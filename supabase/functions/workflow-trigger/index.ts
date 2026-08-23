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

  // What kind of request this is, decided in the app before it was sent.
  //
  // The workflow was running all fifteen steps on everything, including "who
  // is Kavita?", because nothing upstream ever told it what it had been handed
  // and its own classification step classified nothing anything could read. It
  // is told now, by the only party that actually knows: the app only triggers
  // at all when a message asks for something to *happen*, so by the time a run
  // exists the lane is already settled.
  //
  // `answered_in_app` matters as much as the lane. The person is not sitting
  // there waiting to be told what is in their own record — they have already
  // read that, in the app, before this request left the browser. What is
  // wanted here is the thing being asked for, not a restatement of the record
  // it will be built from.
  const lane = str(body.lane) ?? 'act'
  const asking = lane === 'ask'

  // The lane in the workflow's own vocabulary, so the orchestrator has a value
  // to copy rather than a judgement to make.
  const laneWord = asking ? 'answer' : lane === 'act' ? 'make' : lane
  const laneInstruction = asking
    ? 'LANE: answer. This person asked a question and wants it thought about. ' +
      'Reply to them in words, in their conversation, using the conversation-reply ' +
      'connector. Do not produce a document. Do not send anything to anyone. Do not ' +
      'open an approval. The reply itself is the whole output.'
    : 'LANE: make. This request asks for something to be produced or sent. Anything ' +
      'the requester merely wanted to know has already been answered in the app from ' +
      'the record, so do not repeat the record back to them. Run only the steps this ' +
      'lane needs; a step that is not relevant should say so in one line and stop.'

  // A new key per real user action. Reusing one is only correct when retrying
  // that same action with an identical payload.
  const idempotencyKey = str(body.idempotency_key) ?? crypto.randomUUID()

  // Record the run before calling out, so a failure leaves a visible trace
  // rather than silence.
  const { data: run, error: runError } = await admin
    .from('workflow_runs')
    .insert({
      patient_id: patientId,
      type: asking ? 'Question' : 'End-to-end support coordination',
      stakeholder: actor.role === 'patient' ? 'Patient' : actor.name,
      current_step: 'Trigger received',
      status: 'In progress',
      waiting_for: 'Processing',
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

  // What the agent needs in order not to block on identity.
  //
  // The safety step was holding ordinary questions — "who is Kavita?" — as
  // privacy incidents, on the grounds that the requester was unauthenticated
  // and the relationship unresolved. It was right about what it could see: the
  // metadata carried an id and nothing else, so it had no way to know that
  // this function had already checked the person's relationship to the record
  // before calling out.
  //
  // So it is told. `relationship` is the connection this platform verified;
  // `authorisation` says exactly which check ran. And `identity_verified` is
  // reported honestly as false in demo mode, because it is: the actor is
  // asserted by the caller and not proven by a session. An agent that blocks
  // on that is behaving correctly, and lying to it to make the block go away
  // would be a worse bug than the block.
  const relationship = await relationshipTo(patientId, actor.id)

  const payload = JSON.stringify({
    // The lane leads the text as well as the metadata. Some agents read only
    // the trigger text; putting it in one place and hoping was how the last
    // routing decision got lost.
    trigger_text: `${laneInstruction}\n\n${triggerText}`,
    metadata: {
      patient_id: patientId,
      actor_id: actor.id,
      actor_role: actor.role,
      actor_name: actor.name,
      relationship,
      authorisation: 'Platform verified this actor may act on this record before triggering.',
      identity_verified: Deno.env.get('ORCA_DEMO_MODE') !== 'true',
      local_workflow_run_id: run.id,
      lane: laneWord,
      answered_in_app: true,
      reply_in_conversation: asking,
      instruction: laneInstruction,
    },
  })

  let upstream: Response
  let upstreamBody = ''
  try {
    ;({ response: upstream, body: upstreamBody } = await send(triggerUrl, headers, payload))
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

/**
 * Send the trigger, honouring Yoxa's own retry contract.
 *
 * Yoxa answers a failed run creation with a machine-readable verdict:
 *
 *   { "error": { "code": "public_trigger_start_interrupted",
 *                "phase": "workflow_start",
 *                "message": "The trigger start was interrupted. Retry the same request.",
 *                "retryable": true } }
 *
 * That is an instruction, and until now this function ignored it and surfaced
 * the first failure as final. If the interruption is transient — a worker lost
 * mid-start, a queue hiccup — the run this person asked for was thrown away for
 * no reason other than that nobody tried twice.
 *
 * THE SAME Idempotency-Key on every attempt, deliberately. This is a retry of
 * one action with an identical payload, which is the only case where reusing a
 * key is correct: it lets Yoxa recognise the repeat and replay the accepted
 * result rather than starting a second run. A fresh key here would risk
 * duplicating work that had in fact started.
 *
 * Only `retryable` failures are repeated. A 403 is a wrong secret and will be
 * wrong again in two seconds; a 400 is a malformed request. Retrying either
 * would just be a slower way to fail, and would hold up someone who is waiting
 * for an answer.
 *
 * The delays are short on purpose. The browser gives this call twenty seconds
 * before it stops waiting, so the whole sequence has to fit inside that with
 * room for the requests themselves. Better to fail honestly at eight seconds
 * than to time out at twenty with nothing to show.
 */
const RETRY_DELAYS_MS = [1200, 3000]

/**
 * A breaker, because "retryable" turned out not to mean recoverable.
 *
 * Yoxa marks an exhausted account's failure `retryable: true` — the quota check
 * throws somewhere their handler has no case for, so a permanent condition
 * arrives wearing a transient one's label. Taking that at face value means
 * every message pays four seconds of deliberate waiting to discover something
 * the previous message already established.
 *
 * So the first interruption is retried honestly, and then remembered. For the
 * next few minutes, an interruption fails immediately and the caller gets on
 * with reading the record instead. If the condition really was transient, the
 * window lapses and the next message tries properly again.
 *
 * Module scope: Deno keeps an isolate warm between invocations, so this
 * usually survives. When it does not, the cost is one slow request — which is
 * exactly the cost of not having it at all. Deliberately not persisted: a
 * cache of someone else's outage is not something to write to a patient's
 * database.
 */
const BREAKER_MS = 5 * 60 * 1000
let interruptedAt = 0

async function send(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ response: Response; body: string }> {
  const breakerOpen = Date.now() - interruptedAt < BREAKER_MS
  let attempt = 0

  for (;;) {
    const response = await fetch(url, { method: 'POST', headers, body })
    const text = await response.text()
    const worthRepeating = isRetryable(response, text)

    if (!response.ok && worthRepeating) interruptedAt = Date.now()

    if (response.ok || !worthRepeating || breakerOpen || attempt >= RETRY_DELAYS_MS.length) {
      if (breakerOpen && !response.ok) {
        console.log('trigger interrupted again within the breaker window; not retrying')
      } else if (attempt > 0) {
        console.log(`trigger attempt ${attempt + 1} finished with ${response.status}`)
      }
      return { response, body: text }
    }

    console.log(`trigger interrupted (${response.status}), retrying the same request`)
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    attempt += 1
  }
}

/** Yoxa's own word for it, not our guess from the status code. */
function isRetryable(response: Response, body: string): boolean {
  if (response.status < 500) return false
  try {
    const parsed = JSON.parse(body) as { error?: { retryable?: unknown } }
    // Absent means unstated, and an unstated 5xx is worth one more go.
    return parsed.error?.retryable !== false
  } catch {
    return true
  }
}


/**
 * How this person stands to this record, in words the agent can use.
 *
 * "Self" and "occupational therapist, for workplace environment and
 * adaptation" are answerable facts. An id on its own is not, which is why a
 * question about a colleague turned into an authority hold.
 */
async function relationshipTo(patientId: string, actorId: string): Promise<string> {
  const { data: patient } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle()
  if (patient?.user_id === actorId) return 'Self — this is their own record.'

  const { data: connection } = await admin
    .from('connections')
    .select('relationship, purpose, access_scope, consent_status, review_due')
    .eq('patient_id', patientId)
    .eq('person_id', actorId)
    .maybeSingle()

  if (!connection) return 'No connection to this record.'
  return (
    `${connection.relationship}, connected for: ${connection.purpose}. ` +
    `Consent ${String(connection.consent_status).toLowerCase()}, review due ${connection.review_due}. ` +
    `Scope: ${(connection.access_scope as string[] | null)?.join(', ') ?? 'unspecified'}.`
  )
}
