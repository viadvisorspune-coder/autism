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
import { deliver, findRun } from '../_shared/deliver.ts'
import { inferFromRecentRun } from '../_shared/whoami.ts'

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

/**
 * Every signing secret this receiver will accept.
 *
 * One per deployment that raises approvals. The plain name stays the primary
 * so nothing that already works has to be re-entered; the numbered and
 * comma-separated forms are both accepted because a person adding a second
 * deployment will reach for whichever occurs to them first, and guessing wrong
 * costs a silent verification failure.
 */
function signingSecrets(): string[] {
  const names = [
    'YOXA_HITL_WEBHOOK_SIGNING_SECRET',
    'YOXA_HITL_WEBHOOK_SIGNING_SECRET_2',
    'YOXA_HITL_WEBHOOK_SIGNING_SECRET_3',
    'YOXA_HITL_WEBHOOK_SIGNING_SECRETS',
  ]
  const found = names
    .flatMap((name) => (Deno.env.get(name) ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set(found)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const secrets = signingSecrets()
  if (!secrets.length) return json({ error: 'receiver_not_configured' }, 503)

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

  /**
   * Any configured deployment may have signed this.
   *
   * Each Yoxa deployment mints its OWN webhook signing secret, and every
   * deployment that raises approvals delivers to this one URL. Checking a
   * single secret meant the first deployment configured worked and every
   * later one failed `invalid_signature` — with no row written and nothing
   * on screen to explain it, which is the worst way for this to break.
   *
   * Every candidate is tried before rejecting, and the comparison is
   * constant-time in each case, so a failure reveals nothing about which
   * secret was closest.
   */
  let verified = false
  for (const candidate of secrets) {
    const expected = await hmacHex(candidate, `${timestamp}.${raw}`)
    if (timingSafeEqual(expected, presented)) verified = true
  }
  if (!verified) return json({ error: 'invalid_signature' }, 401)

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

  const title = String(payload.title ?? 'ORCA needs a decision')
  const description = payload.description ? String(payload.description) : null
  const { patientId, source } = await resolvePatient(workflowRunId, `${title}\n${description ?? ''}`)

  const { error: taskError } = await admin.from('hitl_requests').insert({
    request_id: requestId,
    event_id: eventId,
    deployment_id: payload.deployment_id ? String(payload.deployment_id) : null,
    workflow_run_id: workflowRunId,
    patient_id: patientId,
    patient_source: source,
    title,
    description,
    options: Array.isArray(payload.options) ? payload.options : [],
  })

  // A second delivery that got past the event dedup still must not duplicate
  // the task.
  if (taskError && taskError.code !== '23505') return json({ error: taskError.message }, 500)

  /**
   * The approval's content is the run's output.
   *
   * For a gate that asks "here is the draft — send it?", the description IS
   * the draft, and for two of the five paths it is the only road that output
   * has home: UNDERSTAND and PRODUCE are locked with no API connectors, and
   * Yoxa exposes no way to read a finished run.
   *
   * This function used to store the approval and touch nothing else, so a run
   * whose only output came this way sat at "Queued at Yoxa" for ever. The
   * content was in the database the whole time, one table across: the chat
   * could not settle the turn, a chained path never started its second half,
   * and the replay lane could never find it.
   *
   * The run is left Awaiting approval, which is what it is. Recording the
   * answer is not deciding the approval — nothing is sent, and the person
   * still chooses.
   */
  if (workflowRunId && description) {
    const run = await findRun({ runId: workflowRunId, yoxaRunId: workflowRunId })
    if (run) {
      await deliver(run, {
        answerHtml: description,
        status: 'Awaiting approval',
        step: 'Waiting for a person to decide',
      })
    }
  }

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

/**
 * Which patient a Yoxa approval gate is about.
 *
 * This used to be one lookup: take `workflow_run_id` off the event and find
 * that run in our table. It never once succeeded. Yoxa sends *its* run id, not
 * ours, so every one of the eleven gates it delivered was stored with no
 * patient — and a null patient_id silently switched off everything downstream.
 * No notification was written (that branch is guarded by the id), and the read
 * path filters approvals by patient, so the gate never appeared on any screen.
 *
 * Which meant: Yoxa reached a point where it needed a person, asked us, we
 * accepted the question, and then showed it to nobody. Yoxa waited. The run
 * never finished. No document was ever produced by the workflow whose entire
 * purpose is producing one — and nothing anywhere reported an error, because
 * from each component's own point of view nothing had gone wrong.
 *
 * So it now tries four things, exact before approximate, and says which one
 * answered. The middle two are not guesses: they read an id out of Yoxa's own
 * prose and then confirm it against our tables, so a match is a fact.
 */
type PatientSource = 'run_id' | 'review_item' | 'named_in_text' | 'inferred' | 'unresolved'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const PATIENT_TOKEN = /\bpt-[a-z0-9-]+\b/gi
const USER_TOKEN = /\bu-[a-z0-9-]+\b/gi

async function resolvePatient(
  workflowRunId: string | null,
  text: string,
): Promise<{ patientId: string | null; source: PatientSource }> {
  // 1. Our own run id. Exact when Yoxa echoes what we sent, which is the
  //    contract; the rest of this function exists because it does not.
  if (workflowRunId) {
    const { data } = await admin
      .from('workflow_runs')
      .select('patient_id')
      .eq('id', workflowRunId)
      .maybeSingle()
    if (data?.patient_id) return { patientId: String(data.patient_id), source: 'run_id' }
  }

  // 2. A review item quoted in the gate's own description. The safety agent
  //    raises these through our connector, so the id is ours and the row it
  //    names carries the patient. Confirmed against the table, never trusted
  //    from the text alone.
  const uuids = [...new Set(text.match(UUID) ?? [])]
  if (uuids.length) {
    const { data } = await admin
      .from('review_items')
      .select('patient_id')
      .in('id', uuids)
      .limit(2)
    const found = [...new Set((data ?? []).map((r) => String(r.patient_id)))]
    if (found.length === 1) return { patientId: found[0], source: 'review_item' }
  }

  // 3. A patient named outright. Yoxa's descriptions often carry "(pt-ananya)"
  //    because the trigger text puts it there. Same rule: confirmed against
  //    the patients table before it counts.
  const tokens = [...new Set((text.match(PATIENT_TOKEN) ?? []).map((t) => t.toLowerCase()))]
  if (tokens.length) {
    const { data } = await admin.from('patients').select('id').in('id', tokens).limit(2)
    const found = [...new Set((data ?? []).map((r) => String(r.id)))]
    if (found.length === 1) return { patientId: found[0], source: 'named_in_text' }
  }

  // 4. The patient's own sign-in id. Matched only against `patients.user_id`,
  //    never against app_users at large: a clinician's id appears in this text
  //    too and resolves to everybody on their caseload, which is not an answer.
  const users = [...new Set((text.match(USER_TOKEN) ?? []).map((t) => t.toLowerCase()))]
  if (users.length) {
    const { data } = await admin.from('patients').select('id').in('user_id', users).limit(2)
    const found = [...new Set((data ?? []).map((r) => String(r.id)))]
    if (found.length === 1) return { patientId: found[0], source: 'named_in_text' }
  }

  // 5. The bounded fallback the connector endpoints already use. It refuses
  //    whenever more than one run could be meant — see _shared/whoami.ts.
  const guess = await inferFromRecentRun()
  if (guess?.patientId) return { patientId: guess.patientId, source: 'inferred' }

  // Nothing matched. The gate is still stored and still shown — see the read
  // path, which now surfaces unattributed approvals rather than filtering them
  // away. An approval nobody can see is worse than one that admits it does not
  // know whose it is.
  return { patientId: null, source: 'unresolved' }
}
