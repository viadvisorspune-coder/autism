/**
 * Sends a human's decision back to Yoxa.
 *
 * Called by ORCA's own interface, never by Yoxa and never from a page without a
 * session. The response secret lives only here; it is not readable from the
 * browser, which is the entire reason this function exists rather than the page
 * posting to Yoxa directly.
 */
import { admin, cors, json, str } from '../_shared/yoxa.ts'
import { actorFromRequest, forbidden, mayActOnPatient, unauthorised, yoxaOrigin } from '../_shared/app.ts'

/**
 * The secret that answers a particular deployment.
 *
 * Yoxa issues an approval response secret per deployment, and this read a
 * single environment variable — so a second workflow's approvals could only be
 * answered by overwriting the first workflow's secret, silently breaking it.
 * The receiver already accepts several signing secrets for exactly this
 * reason; the responder did not, and the asymmetry was going to be discovered
 * by a person pressing Approve and being told the run was not configured.
 *
 * YOXA_HITL_RESPONSE_SECRETS holds a JSON object keyed by deployment id.
 * YOXA_HITL_RESPONSE_SECRET remains the fallback for a single deployment and
 * for anything already configured, so nothing that works today stops working.
 */
function responseSecretFor(deploymentId: string | null | undefined): string | null {
  const raw = Deno.env.get('YOXA_HITL_RESPONSE_SECRETS')
  if (raw && deploymentId) {
    try {
      const byDeployment = JSON.parse(raw) as Record<string, unknown>
      const found = byDeployment[deploymentId]
      if (typeof found === 'string' && found.trim()) return found.trim()
    } catch {
      // A malformed map must not take out the single-secret path below.
      console.error('YOXA_HITL_RESPONSE_SECRETS is not valid JSON; using the single secret.')
    }
  }
  return Deno.env.get('YOXA_HITL_RESPONSE_SECRET') ?? null
}

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

  const requestId = str(body.request_id)
  const selectedOptionId = str(body.selected_option_id)
  const overrideMessage = str(body.override_message)

  if (!requestId) return json({ error: 'request_id is required' }, 400)
  if (!selectedOptionId && !overrideMessage) {
    return json({ error: 'choose an option or write a response' }, 400)
  }
  if (selectedOptionId && overrideMessage) {
    return json({ error: 'send exactly one of selected_option_id or override_message' }, 400)
  }

  const { data: task } = await admin
    .from('hitl_requests')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle()

  if (!task) return json({ error: 'approval_not_found' }, 404)

  if (task.patient_id && !(await mayActOnPatient(actor.id, task.patient_id as string))) {
    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_label: actor.name,
      actor_role: actor.role,
      patient_id: task.patient_id,
      action: 'Attempted to answer an approval outside their scope',
      record: `HITL request ${requestId}`,
      access_type: 'Approve',
      why: 'No live connection to this record',
      result: 'Denied',
      workflow_run_id: task.workflow_run_id,
    })
    return forbidden('You do not have access to this record.')
  }

  if (task.status === 'Answered') {
    return json({
      request_id: requestId,
      status: 'Answered',
      already_answered: true,
      note: 'This was already decided. Nothing was sent again.',
    })
  }

  const origin = yoxaOrigin()
  const responseSecret = responseSecretFor(task.deployment_id)
  if (!origin || !responseSecret || !task.deployment_id) {
    return json({ error: 'hitl_response_not_configured' }, 503)
  }

  const url =
    `${origin}/api/v1/public/workflow-deployments/${task.deployment_id}` +
    `/hitl/requests/${requestId}/respond`

  const answer = selectedOptionId
    ? { selected_option_id: selectedOptionId }
    : { override_message: overrideMessage }

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Yoxa-HITL-Response-Secret': responseSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(answer),
    })
  } catch (error) {
    // Never log the secret, only that the call failed.
    console.error('hitl respond failed', String(error))
    return json({ error: 'yoxa_unreachable' }, 502)
  }

  // 202 means stored and queued for resume; 200 means it had already been
  // answered. Neither needs a further call.
  const accepted = upstream.status === 202 || upstream.status === 200

  if (accepted) {
    await admin
      .from('hitl_requests')
      .update({
        status: 'Answered',
        selected_option_id: selectedOptionId,
        override_message: overrideMessage,
        decided_by: actor.id,
        decided_at: new Date().toISOString(),
        yoxa_status_code: upstream.status,
      })
      .eq('request_id', requestId)

    await admin.from('audit_log').insert({
      actor_id: actor.id,
      actor_label: actor.name,
      actor_role: actor.role,
      patient_id: task.patient_id,
      action: `Answered a human approval (${selectedOptionId ?? 'written response'})`,
      record: `HITL request ${requestId}`,
      access_type: 'Approve',
      why: String(task.title ?? ''),
      result: 'Allowed',
      workflow_run_id: task.workflow_run_id,
    })
  }

  return json(
    {
      request_id: requestId,
      status: accepted ? 'Answered' : 'Awaiting approval',
      already_answered: upstream.status === 200,
      yoxa_status_code: upstream.status,
      note: accepted
        ? 'Your decision was recorded and the workflow will continue from where it paused.'
        : 'Yoxa did not accept the decision. Nothing was changed here.',
    },
    accepted ? 200 : 502,
  )
})
