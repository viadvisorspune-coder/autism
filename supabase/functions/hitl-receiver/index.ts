/**
 * Receives Yoxa's signed human-approval events.
 *
 *   Yoxa reaches a human approval gate
 *     -> posts a signed event here
 *     -> this stores it as a pending approval
 *     -> a person decides it in ORCA's own interface
 *     -> hitl-respond posts that decision back
 *     -> the same workflow run resumes
 *
 * Delivery is at-least-once, so a repeat of the same event_id is expected and
 * must not create a second task. Verification happens over the raw bytes,
 * before any parsing.
 */
import { admin, cors, json } from '../_shared/yoxa.ts'
import { notifyRoles } from '../_shared/notify.ts'

const TOLERANCE_SECONDS = 300

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const secret = Deno.env.get('YOXA_HITL_WEBHOOK_SIGNING_SECRET')
  if (!secret) return json({ error: 'receiver_not_configured' }, 503)

  // Raw bytes first. Parsing and re-serialising would change them and the
  // signature would never match.
  const raw = await req.text()
  const timestamp = req.headers.get('x-yoxa-webhook-timestamp') ?? ''
  const presented = (req.headers.get('x-yoxa-webhook-signature') ?? '').replace(/^v1=/, '')
  const eventIdHeader = req.headers.get('x-yoxa-webhook-id') ?? ''

  if (!timestamp || !presented) return json({ error: 'missing_signature_headers' }, 400)

  const age = Math.abs(Date.now() - Date.parse(timestamp)) / 1000
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return json({ error: 'stale_timestamp' }, 400)
  }

  const expected = await hmacHex(secret, `${timestamp}.${raw}`)
  if (!timingSafeEqual(expected, presented)) return json({ error: 'invalid_signature' }, 401)

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const eventId = String(payload.event_id ?? eventIdHeader ?? '')
  const eventType = String(payload.event_type ?? 'unknown')
  if (!eventId) return json({ error: 'missing_event_id' }, 400)

  // Deduplicate on the event id. A conflict means Yoxa redelivered, which is
  // a success from its point of view — answer 200 and change nothing.
  const { error: dupe } = await admin
    .from('hitl_events')
    .insert({ event_id: eventId, event_type: eventType, payload })

  if (dupe) {
    if (dupe.code === '23505') return new Response(null, { status: 200, headers: cors })
    return json({ error: dupe.message }, 500)
  }

  if (eventType === 'hitl.webhook_test') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (eventType !== 'hitl.approval_requested') {
    // Recorded above; nothing else to do with an event type we do not model.
    return new Response(null, { status: 204, headers: cors })
  }

  const requestId = String(payload.request_id ?? '')
  const workflowRunId = payload.workflow_run_id ? String(payload.workflow_run_id) : null
  if (!requestId) return json({ error: 'missing_request_id' }, 400)

  // The stable link back to our own record is the workflow run, not Yoxa's
  // request id — that one is only used when answering.
  let patientId: string | null = null
  if (workflowRunId) {
    const { data: run } = await admin
      .from('workflow_runs')
      .select('patient_id')
      .eq('id', workflowRunId)
      .maybeSingle()
    patientId = (run?.patient_id as string) ?? null
  }

  const { error: taskError } = await admin.from('hitl_requests').insert({
    request_id: requestId,
    event_id: eventId,
    deployment_id: payload.deployment_id ? String(payload.deployment_id) : null,
    workflow_run_id: workflowRunId,
    patient_id: patientId,
    title: String(payload.title ?? 'ORCA needs a decision'),
    description: payload.description ? String(payload.description) : null,
    options: Array.isArray(payload.options) ? payload.options : [],
  })

  // A second delivery that got past the event dedup still must not duplicate
  // the task.
  if (taskError && taskError.code !== '23505') return json({ error: taskError.message }, 500)

  if (patientId) {
    // The patient, deliberately and not by omission. Yoxa's event names a
    // title, a description and some options; it does not name an audience, and
    // there is nothing here to infer one from. These gates exist to put the
    // person the record is about back in the loop before a run continues, so
    // the patient is the right reader — but it is a choice made here, not a
    // fact carried by the payload, and if Yoxa ever starts addressing gates to
    // a clinician this is the line that has to change.
    await notifyRoles({
      patientId,
      roles: ['patient'],
      kind: 'asking',
      what: String(payload.title ?? 'A decision is needed before this can continue.'),
      why: 'A workflow has reached a point that needs a person, not a model.',
      workflowRunId,
    })

    await admin.from('audit_log').insert({
      actor_label: 'Yoxa workflow',
      patient_id: patientId,
      action: 'Human approval requested',
      record: `HITL request ${requestId}`,
      access_type: 'Approve',
      why: String(payload.title ?? ''),
      result: 'Allowed',
      workflow_run_id: workflowRunId,
    })
  }

  return new Response(null, { status: 204, headers: cors })
})
