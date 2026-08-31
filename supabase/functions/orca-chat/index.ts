/**
 * The orchestrator between ORCA's chat and the two Yoxa workflows.
 *
 * One turn of conversation passes through here: a person's sentence arrives,
 * and a started workflow run comes back. Everything between — who is asking,
 * which workflow answers, what text it is actually given — is decided on this
 * side, because every one of those is a decision the browser must not be
 * trusted with.
 *
 * WHY IT RETURNS BEFORE THERE IS AN ANSWER. Yoxa is asynchronous. A trigger is
 * accepted and queued; the run may take a minute, or stop halfway to ask a
 * person for approval, and the HTTP request that started it is long gone by
 * then. So this records a run, starts it, and hands back a run id. The answer
 * arrives separately and lands on that row. Pretending otherwise — holding the
 * request open and waiting — would work in a demo and fail the first time a
 * run paused for a human.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not ask a model how to route, it
 * does not read identity out of the message, and it does not send anything
 * anywhere or write to the longitudinal record. Delivery and ingestion are out
 * of scope; this starts runs and stores what comes back.
 */

import { admin, cors, json, str } from '../_shared/yoxa.ts'
import { actorFromRequest, mayActOnPatient, forbidden, unauthorised } from '../_shared/app.ts'
import { type WorkflowName, isConfigured } from '../_shared/compose.ts'
import { type Lane, type Plan, SAME_QUESTION, planFor, similarity } from '../_shared/route.ts'
import { launch, launchError } from '../_shared/start.ts'
import { resolveRecipient } from '../_shared/recipient.ts'

/** How long a retrieval stays fresh enough to draft from without looking again. */
const EVIDENCE_FRESH_MS = 60 * 60 * 1000

/**
 * The two facts routing cannot read off the sentence.
 *
 * Both are scoped to this actor and this subject. The same question asked by
 * two people has two different correct answers, because what may be shown
 * depends on who is asking — so a replay or a reuse that crossed that line
 * would hand one person an answer computed for another.
 */
async function routingFacts(
  actorId: string,
  patientId: string | null,
  message: string,
  rehearsing: boolean,
): Promise<{ recentEvidenceRunId: string | null; alreadyAnsweredRunId: string | null }> {
  /**
   * A real request sees only real runs. A rehearsal sees rehearsals too.
   *
   * The first half is the safety property: without it, a few practice runs
   * start steering real requests — a stand-in answer counting as "already
   * answered" and replaying to somebody asking about their own record, or as
   * "recent evidence" and becoming the material a real document is drafted
   * from. A rehearsal that can change what a real person is told is worse than
   * having no rehearsal at all.
   *
   * The second half is what makes rehearsing worth anything. Two of the five
   * paths exist only as a consequence of history — PRODUCE alone needs a
   * recent retrieval, CHATBOT replay needs a prior answer — so a rehearsal
   * blind to other rehearsals could never reach them, and the mode would
   * exercise three paths while claiming to exercise five.
   *
   * The asymmetry is the whole design: rehearsals can see each other and
   * cannot be seen.
   */
  const query = admin
    .from('workflow_runs')
    .select('id, workflow_name, trigger_text, answer_html, started_at')
    .eq('actor_id', actorId)
    .not('answer_html', 'is', null)
    .order('started_at', { ascending: false })
    .limit(25)

  const scoped = rehearsing ? query : query.eq('dry_run', false)
  const { data } = patientId ? await scoped.eq('patient_id', patientId) : await scoped
  const rows = data ?? []

  const fresh = rows.filter(
    (r) => Date.now() - Date.parse(String(r.started_at)) < EVIDENCE_FRESH_MS,
  )

  // Evidence to draft from: a recent look at the record, not a recent draft.
  const evidence = fresh.find((r) => r.workflow_name === 'understand') ?? null

  /**
   * A prior answer to the same question.
   *
   * Compared against the person's own words, which are the quoted last line of
   * the stored trigger. Comparing whole triggers would score every pair as
   * near-identical: they share a preamble naming the same person, role,
   * subject and purpose, so the only part that differs is swamped.
   */
  const answered =
    rows.find((r) => {
      const asked = quotedQuestion(String(r.trigger_text ?? ''))
      return asked ? similarity(asked, message) >= SAME_QUESTION : false
    }) ?? null

  return {
    recentEvidenceRunId: evidence?.id ?? null,
    alreadyAnsweredRunId: answered?.id ?? null,
  }
}

/** The person's own words back out of a composed trigger. */
function quotedQuestion(trigger: string): string | null {
  const quoted = trigger.match(/"([^"]+)"/)
  return quoted ? quoted[1].trim() : null
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

  const message = str(body.message) ?? str(body.trigger_text)
  if (!message) return json({ error: 'message is required' }, 400)

  const actor = await actorFromRequest(req, body)
  if (!actor) return unauthorised()

  const patientId = str(body.patient_id)
  if (patientId && !(await mayActOnPatient(actor.id, patientId))) {
    return forbidden('You do not have access to this record.')
  }

  /**
   * Who the document is for.
   *
   * Taken from the request when the caller states it, and otherwise looked up
   * among the people actually connected to this record by whatever the message
   * names. Routing depends on this — a letter to an employer takes the full
   * governance path and a handover to an OT does not — and nothing was
   * supplying it, so that distinction could never be drawn.
   */
  const recipientIn =
    asRecipient(body.recipient) ??
    (patientId ? await resolveRecipient(patientId, message) : null)

  /**
   * The two facts routing needs that the sentence cannot tell us.
   *
   * Whether a question has already been answered, and whether a recent look at
   * the record still stands, are properties of the record rather than of the
   * wording. Both are read here, scoped to this actor: the same question from
   * two people has two different correct answers, because what may be shown
   * depends on who is asking, and replaying across that line would hand one
   * person another person's answer.
   */
  const facts = await routingFacts(actor.id, patientId, message, body.dry_run === true)

  /**
   * The plan, with the caller allowed to correct it but not to invent it.
   *
   * Routing is a set of readable rules and will sometimes be wrong — "can you
   * write down what changed" reads as a document request and is not one. The
   * interface shows the chosen path before it runs so a person can say
   * otherwise, and that override arrives as `workflow`. An unrecognised name
   * is ignored rather than trusted: it has no deployment and would fail later
   * and far less clearly.
   */
  const asked = str(body.workflow)
  const override: Lane | null =
    asked === 'understand' || asked === 'produce' || asked === 'chat' || asked === 'fifteen'
      ? asked
      : null

  const plan: Plan = override
    ? {
        path: 'understand_only',
        lane: override,
        then: null,
        reason: 'You chose this yourself.',
      }
    : planFor(message, {
        recipientRole: recipientIn?.role ?? null,
        recentEvidenceRunId: facts.recentEvidenceRunId,
        alreadyAnsweredRunId: facts.alreadyAnsweredRunId,
        available: isConfigured,
      })

  /**
   * The replay path fires the workflow; it does not answer on its own.
   *
   * This used to short-circuit — find the prior answer, hand it straight back,
   * start nothing — on the reasoning that firing a run to fetch something ORCA
   * already holds is waste. The workflow's own contract says otherwise: it is
   * fired once the backend has confirmed stored output exists, and it retrieves
   * and renders that output. Short-circuiting skipped the rendering step and
   * returned raw stored HTML, which is not the same artefact.
   *
   * The check still matters, and still happens above: this path is only chosen
   * when a prior answer exists for this actor and purpose. What changed is that
   * confirming it is the precondition for firing the workflow rather than a
   * substitute for it.
   */
  const started = await launch({
    actor,
    patientId,
    lane: plan.lane as WorkflowName,
    message,
    recipient: recipientIn,
    artifactType: str(body.artifact_type),
    chainedFrom: str(body.chain_from),
    path: plan.path,
    reason: plan.reason,
    then: (plan.then as WorkflowName | null) ?? null,
    idempotencyKey: str(body.idempotency_key),
    dryRun: body.dry_run === true,
  })

  if (!started.ok) return launchError(started)

  return json({
    run_id: started.runId,
    workflow: plan.lane,
    path: plan.path,
    reason: plan.reason,
    dry_run: body.dry_run === true,
    status: body.dry_run === true ? 'rehearsed' : 'queued',
    yoxa_run_id: started.yoxaRunId,
    /**
     * The exact text that was sent.
     *
     * Returned so the interface can show what left rather than what it
     * predicted would leave. The page composes its own preview before sending,
     * and if the two ever drift, this is the one that is true.
     */
    trigger_text: started.triggerText,
  })
})

function asRecipient(v: unknown): { name: string; role: string; org: string } | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  return { name, role: str(r.role) ?? 'recipient', org: str(r.org) ?? '' }
}

