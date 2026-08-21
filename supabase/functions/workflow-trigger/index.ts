/**
 * Starts a Yoxa workflow run from a real, authenticated action in ORCA.
 *
 * The deployment secret lives here and nowhere else. A button in the browser
 * cannot hold it, which is why this function exists between the page and Yoxa.
 * The page calls this with the user's session; this calls Yoxa with the secret.
 *
 * NOTE ON THE OUTBOUND SHAPE: Yoxa's Integration screen gives the authoritative
 * cURL — URL, header names and payload. The request below follows the documented
 * text-trigger contract (JSON body with trigger_text, plus a unique
 * Idempotency-Key). If the copied cURL names the secret header differently,
 * change SECRET_HEADER to match it exactly rather than adapting the caller.
 */
import { admin, cors, json, str } from '../_shared/yoxa.ts'
import { actorFromRequest, forbidden, mayActOnPatient, unauthorised } from '../_shared/app.ts'

// Yoxa's copied cURL names this header explicitly. It is NOT an Authorization
// bearer — sending it that way returns 403 with a rejection that looks exactly
// like an inactive deployment, which is how this cost an hour.
const SECRET_HEADER = Deno.env.get('YOXA_SECRET_HEADER') ?? 'X-Yoxa-Deployment-Secret'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const actor = await actorFromRequest(req, body)
  if (!actor) return unauthorised()

  const triggerText = str(body.trigger_text)
  const patientId = str(body.patient_id)
  if (!triggerText) return json({ error: 'trigger_text is required' }, 400)
  if (!patientId) return json({ error: 'patient_id is required' }, 400)

  if (!(await mayActOnPatient(actor.id, patientId))) {
    return forbidden('You do not have access to this record.')
  }

  const triggerUrl = Deno.env.get('YOXA_TRIGGER_URL')
  const secret = Deno.env.get('YOXA_DEPLOYMENT_SECRET')
  if (!triggerUrl || !secret) return json({ error: 'trigger_not_configured' }, 503)

  // A new key per real user action. Reusing one is only correct when retrying
  // that same action with an identical payload.
  const idempotencyKey = str(body.idempotency_key) ?? crypto.randomUUID()

  // Record the run before calling out, so a failure leaves a visible trace
  // rather than silence.
  const { data: run, error: runError } = await admin
    .from('workflow_runs')
    .insert({
      patient_id: patientId,
      type: 'End-to-end support coordination',
      stakeholder: actor.role === 'patient' ? 'Patient' : actor.name,
      current_step: 'Trigger received',
      status: 'In progress',
      waiting_for: 'Yoxa',
      idempotency_key: idempotencyKey,
      trigger_text: triggerText,
      steps: [{ label: 'Trigger received', state: 'current' }],
    })
    .select('id')
    .single()

  if (runError) {
    // A duplicate key means this exact action was already sent; return the run
    // that already exists rather than starting a second one.
    if (runError.code === '23505') {
      const { data: existing } = await admin
        .from('workflow_runs')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      return json({
        workflow_run_id: existing?.id ?? null,
        status: existing?.status ?? 'In progress',
        replayed: true,
        note: 'This action had already been sent. The original run is unchanged.',
      })
    }
    return json({ error: runError.message }, 500)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  }
  headers[SECRET_HEADER] = SECRET_HEADER.toLowerCase() === 'authorization'
    ? `Bearer ${secret}`
    : secret

  let upstream: Response
  let upstreamBody = ''
  try {
    upstream = await fetch(triggerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        trigger_text: triggerText,
        metadata: {
          patient_id: patientId,
          actor_id: actor.id,
          actor_role: actor.role,
          local_workflow_run_id: run.id,
        },
      }),
    })
    upstreamBody = await upstream.text()
  } catch (error) {
    console.error('trigger failed', String(error))
    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', waiting_for: 'Yoxa (unreachable)' })
      .eq('id', run.id)
    return json({ error: 'yoxa_unreachable', workflow_run_id: run.id }, 502)
  }

  if (!upstream.ok) {
    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', waiting_for: `Yoxa returned ${upstream.status}` })
      .eq('id', run.id)
    // The body may explain the rejection; it never contains our secret.
    return json(
      { error: 'trigger_rejected', status: upstream.status, detail: upstreamBody.slice(0, 500), workflow_run_id: run.id },
      502,
    )
  }

  // Yoxa's own run id, when it returns one, is worth keeping beside ours.
  let remoteRunId: string | null = null
  try {
    const parsed = JSON.parse(upstreamBody) as Record<string, unknown>
    remoteRunId = str(parsed.workflow_run_id) ?? str(parsed.run_id) ?? null
  } catch {
    /* a non-JSON success body is not an error */
  }

  await admin.from('audit_log').insert({
    actor_id: actor.id,
    actor_label: actor.name,
    actor_role: actor.role,
    patient_id: patientId,
    action: 'Started a support workflow',
    record: `Workflow run ${run.id}`,
    access_type: 'Write',
    why: triggerText.slice(0, 200),
    result: 'Allowed',
    workflow_run_id: run.id,
  })

  return json({
    workflow_run_id: run.id,
    yoxa_workflow_run_id: remoteRunId,
    status: 'In progress',
    replayed: false,
    note: 'Sent. Nothing is shared with anyone outside ORCA unless you approve it later.',
  })
})
