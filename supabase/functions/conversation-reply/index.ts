/**
 * conversation_reply — the agent answering in words, in the thread.
 *
 * Everything else a Yoxa run can do to this record is structured: it updates
 * patient state, raises a review, asks a clarification, writes an audit line,
 * produces a document. All of that is right, and none of it is a reply. Until
 * now an agent that had worked something out had nowhere to simply say it, so
 * the conversation could only narrate steps — "checking what can be shared
 * here" — while the actual finding went into a table the person would have to
 * go looking for.
 *
 * This is the missing link and nothing more: one operation that appends an
 * ORCA-authored message to the conversation the person is already reading. The
 * table, the read path and the interface all existed; what was missing was a
 * way in.
 *
 * Three rules it enforces rather than trusts.
 *
 * SCOPE. A message can only be written into a conversation that already exists
 * between this patient and this actor, or created for an actor who is actually
 * connected to the patient. An agent cannot open a thread with someone who has
 * no relationship to the record.
 *
 * PROVENANCE. Every message carries the run that produced it. A line of advice
 * with no traceable origin is exactly the thing this system exists to prevent,
 * and "the assistant said so" is not an origin.
 *
 * NO SIDE EFFECTS. Writing a reply does not decide, share, or change the
 * record. If the run wants to do any of those it has a connector for it, each
 * of which stops for a human. Text is text — which is precisely why it is safe
 * to let an agent write it, and why it must never become a way to smuggle an
 * action past an approval.
 */
import { inferFromRecentRun } from '../_shared/whoami.ts'
import { deliver, findRun } from '../_shared/deliver.ts'
import { admin, guard, json, recordAudit, str } from '../_shared/yoxa.ts'

/**
 * Words a workflow reaches for when it has lost the real value.
 *
 * Not an exhaustive list and it does not need to be — anything not caught
 * here is checked against the database instead. These are the ones seen in
 * the wild, plus the role names, because a step that has lost `actor_id`
 * frequently substitutes the role it does still know.
 */
const PLACEHOLDERS = new Set([
  'unknown', 'null', 'none', 'nil', 'n/a', 'na', 'undefined', 'string', 'todo',
  'current-run', 'current_run', 'currentrun', 'run', 'me', 'self', 'user',
  'actor', 'subject', 'recipient', 'example', 'test',
  'patient', 'psychologist', 'psychiatrist', 'therapist', 'ot', 'gp',
  'clinic', 'employer', 'university', 'trusted', 'admin',
])

/** The value if it could name something, otherwise null. */
function meaningful(value: string | null): string | null {
  const clean = (value ?? '').trim()
  if (!clean) return null
  return PLACEHOLDERS.has(clean.toLowerCase()) ? null : clean
}

/** Long enough for a real answer, short enough not to be a document. */
const MAX_LENGTH = 4000

/**
 * Provenance, as data rather than as a paragraph.
 *
 * A workflow that names its sources inside the prose gives the person a
 * sentence. A workflow that sends them here gives them a link: `Answer.tsx`
 * renders each entry that carries an `id` as a link into `/record/:id`, so
 * "this came from the OT observation on 4 August" becomes the OT observation
 * on 4 August, one tap away. That is the difference between claiming the
 * answer is grounded and letting somebody check.
 *
 * Both are optional and both are tolerant of shape. An agent that sends
 * strings gets strings rendered; one that sends objects gets links. What it
 * must never do is fail the whole reply because a citation list came back in
 * an unexpected form — the answer is what the person is waiting for, and the
 * bibliography is not worth losing it over.
 */
const MAX_CITED = 25

function readCited(input: unknown): { id?: string; reporter?: string; date?: string; label?: string }[] {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, MAX_CITED)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim() ? { label: entry.trim() } : null
      if (!entry || typeof entry !== 'object') return null
      /**
       * Every name a workflow has plausibly given each of these.
       *
       * ORCA Understand's Responder emits `item_id`, `reporter_role`,
       * `occurred_at` and `claim`; the chatbot emits `id`, `reporter`, `date`.
       * Both are reasonable and neither is going to change to suit the other,
       * so the endpoint accepts both rather than asking a model to re-key its
       * own output on the way out — a step it would occasionally get wrong,
       * silently, and the failure would look like an answer that cites
       * nothing.
       */
      const r = entry as Record<string, unknown>
      const row = {
        id: str(r.id) ?? str(r.item_id) ?? undefined,
        reporter: str(r.reporter) ?? str(r.source) ?? str(r.reporter_role) ?? undefined,
        date: str(r.date) ?? str(r.recorded_on) ?? str(r.occurred_at) ?? undefined,
        label: str(r.label) ?? str(r.title) ?? str(r.claim) ?? undefined,
      }
      return row.id || row.reporter || row.date || row.label ? row : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

function readWithheld(input: unknown): { domain?: string; reason?: string }[] {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, MAX_CITED)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim() ? { domain: entry.trim() } : null
      if (!entry || typeof entry !== 'object') return null
      const r = entry as Record<string, unknown>
      const row = { domain: str(r.domain) ?? undefined, reason: str(r.reason) ?? undefined }
      return row.domain || row.reason ? row : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

Deno.serve(
  guard(async (_req, { body }) => {
    const patientId = str(body.patient_id)
    const actorId = str(body.actor_id)
    const text = str(body.text)
    const workflowRunId = str(body.workflow_run_id)
    const cited = readCited(body.sources)
    const withheld = readWithheld(body.withheld)

    // An agent that could not see the ids sends empty strings, which satisfy
    // the connector schema and fail here. Rather than refuse a reply the
    // person is waiting for, fall back to the run that is almost certainly
    // theirs — see _shared/whoami.ts for why that is bounded and when it
    // refuses.
    /**
     * An identifier that names nothing is the same as no identifier.
     *
     * A workflow that lost the ids on the way down its own steps does not send
     * an empty string — it sends what it has, which is a placeholder. One run
     * arrived as `{"actor_id":"patient","patient_id":"unknown",
     * "workflow_run_id":"unknown"}`: three fields present, none of them a
     * reference to anything. The recovery below only fired on absence, so it
     * stood aside and the request 404'd on a patient called "unknown".
     *
     * Two tests, in order. A word from the placeholder list is discarded on
     * sight. Anything else is checked against the record it claims to name —
     * because "patient" is a role and pt-ananya is a record, and the only
     * reliable way to tell an id from a noun is to look it up.
     *
     * Discarding rather than refusing is deliberate. The person is waiting for
     * an answer the workflow has already written; recovering the addressee
     * from a run started moments earlier is better for them than a 404, and
     * `inferFromRecentRun` refuses on its own terms when it cannot be sure.
     */
    let resolvedPatient = meaningful(patientId)
    let resolvedActor = meaningful(actorId)
    let resolvedRun = meaningful(workflowRunId)

    if (resolvedPatient) {
      const { data } = await admin
        .from('patients')
        .select('id')
        .eq('id', resolvedPatient)
        .maybeSingle()
      if (!data) resolvedPatient = null
    }
    if (resolvedActor) {
      const { data } = await admin
        .from('app_users')
        .select('id')
        .eq('id', resolvedActor)
        .maybeSingle()
      if (!data) resolvedActor = null
    }

    if (!resolvedPatient || !resolvedActor || !resolvedRun) {
      const guess = await inferFromRecentRun()
      if (guess) {
        resolvedPatient = resolvedPatient || guess.patientId
        resolvedActor = resolvedActor || guess.actorId
        resolvedRun = resolvedRun || guess.runId
      }
    }
    /**
     * A run id we do not recognise is dropped, not fatal.
     *
     * `conversation_messages.workflow_run_id` is a foreign key, so an id that
     * does not exist here fails the insert — and takes the answer down with
     * it. That happens easily and for uninteresting reasons: a workflow tested
     * inside Yoxa invents a run id, and a redelivery can arrive after a run
     * was removed.
     *
     * Losing the link costs a cross-reference. Losing the reply costs the
     * person the answer they asked for, which is the entire point of this
     * function, so the link is what gives way.
     */
    if (resolvedRun) {
      const { data: known } = await admin
        .from('workflow_runs')
        .select('id')
        .eq('id', resolvedRun)
        .maybeSingle()
      if (!known) resolvedRun = null
    }

    if (!resolvedPatient) return json({ error: 'patient_id is required' }, 400)
    if (!resolvedActor) return json({ error: 'actor_id is required' }, 400)
    if (!text) return json({ error: 'text is required' }, 400)
    if (text.length > MAX_LENGTH) {
      return json(
        {
          error: 'text_too_long',
          limit: MAX_LENGTH,
          fix: 'Say the answer here and put the working in a document artefact.',
        },
        400,
      )
    }

    // The patient has to exist. A typo in an id should say so rather than
    // creating a conversation nobody will ever read.
    const { data: patient } = await admin
      .from('patients')
      .select('id')
      .eq('id', resolvedPatient)
      .maybeSingle()
    if (!patient) {
      return json(
        { error: 'patient_not_found', patient_id: resolvedPatient, fix: 'Use an id from the record.' },
        404,
      )
    }

    // Find the thread, or open one — but only for somebody who belongs here.
    let { data: conversation } = await admin
      .from('conversations')
      .select('id')
      .eq('patient_id', resolvedPatient)
      .eq('actor_id', resolvedActor)
      .maybeSingle()

    if (!conversation) {
      const allowed = await mayHoldAConversation(resolvedPatient, resolvedActor)
      if (!allowed) {
        // Refused, and recorded as refused. A denial is as much a part of the
        // audit trail as an action, and a silent no teaches nobody anything.
        await recordAudit({
          actorId: resolvedActor,
          actorLabel: 'ORCA',
          actorRole: 'admin',
          patientId: resolvedPatient,
          action: 'Tried to open a conversation',
          record: `Conversation with ${resolvedActor}`,
          accessType: 'Write',
          why: 'Agent reply to a person with no connection to this record.',
          result: 'Denied',
          workflowRunId: resolvedRun,
        })
        return json(
          {
            error: 'not_connected',
            reason:
              'That person has no active connection to this record, so ORCA cannot start a conversation with them.',
          },
          403,
        )
      }

      const { data: created, error: createError } = await admin
        .from('conversations')
        .insert({ patient_id: resolvedPatient, actor_id: resolvedActor })
        .select('id')
        .single()
      if (createError) return json({ error: createError.message }, 400)
      conversation = created
    }

    const { data: message, error } = await admin
      .from('conversation_messages')
      .insert({
        conversation_id: conversation.id,
        author: 'orca',
        text,
        workflow_run_id: resolvedRun,
      })
      .select('id, created_at')
      .single()

    if (error) return json({ error: error.message }, 400)

    await admin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id)

    /**
     * Speaking is delivering.
     *
     * This used to close the run and nothing more: status to Completed, step
     * to Replied, and no answer written to the row. That was enough when a
     * reply was the whole of what a workflow did, and wrong the moment one of
     * them was the first half of something.
     *
     * Three things were lost by treating a reply as smaller than a result.
     * The answer never reached `answer_html`, so the replay lane could not
     * find it and a second identical question re-ran the whole workflow. The
     * chain never fired, so a request routed as "look first, then draft" got
     * its answer and silently stopped — no error anywhere, the second half
     * simply never happened. And a rehearsal could reach a state a real run
     * could not.
     *
     * `deliver` is where every other transport lands, so a reply now lands
     * there too. It does not overwrite an answer that already arrived by
     * another road, and it fires the chain on real content only.
     *
     * The old `type = 'Question'` guard is gone with it. That was protecting
     * against closing a document run too early; `deliver` handles the same
     * concern properly, by refusing to chain when there is no content and by
     * leaving an existing answer alone.
     */
    let chainedRunId: string | null = null
    if (resolvedRun) {
      const run = await findRun({ runId: resolvedRun })
      if (run) {
        const outcome = await deliver(run, {
          answerHtml: text,
          /**
           * The envelope carries what the answer screen can render.
           *
           * `parseEnvelope` reads `answer`, `sources` and `withheld`, and the
           * screen draws each of the three differently — prose, a checkable
           * list of entries, and a statement of what was left out. Sending
           * only `answer` meant the other two sections never appeared, so a
           * workflow that had done the work of citing its evidence had no way
           * to hand that over, and said it in prose instead where nothing
           * could link it back.
           */
          envelope: { answer: text, sources: cited, withheld, via: 'conversation_reply' },
          status: 'Completed',
          step: 'Replied',
        })
        chainedRunId = outcome.chainedRunId
      }
    }

    await recordAudit({
      actorId: resolvedActor,
      actorLabel: 'ORCA',
      actorRole: 'admin',
      patientId: resolvedPatient,
      action: 'Replied in the conversation',
      record: `Message ${message.id}`,
      accessType: 'Write',
      why: text.slice(0, 200),
      result: 'Allowed',
      workflowRunId: resolvedRun,
    })

    return json({
      message_id: message.id,
      conversation_id: conversation.id,
      created_at: message.created_at,
      delivered_to: resolvedActor,
      // Reported so a workflow author can see the second half started, rather
      // than having to infer it from a run appearing later.
      chained_run_id: chainedRunId,
      note: 'Written into the conversation. Nothing was decided, shared or changed by saying it.',
    })
  }),
)

/**
 * Whether ORCA may speak to this person about this record at all.
 *
 * The patient always. Anyone else only through a live connection — which is
 * the same test every read path applies, for the same reason: a relationship
 * that has lapsed or been withdrawn is not a relationship, and an agent should
 * not be the one route through which that stops being true.
 */
async function mayHoldAConversation(resolvedPatient: string, resolvedActor: string): Promise<boolean> {
  const { data: patient } = await admin
    .from('patients')
    .select('id, user_id')
    .eq('id', resolvedPatient)
    .maybeSingle()
  if (patient && (patient as { user_id?: string }).user_id === resolvedActor) return true

  const { data: connection } = await admin
    .from('connections')
    .select('consent_status, review_due')
    .eq('patient_id', resolvedPatient)
    .eq('person_id', resolvedActor)
    .maybeSingle()

  if (!connection) return false
  if (connection.consent_status !== 'Active') return false
  if (connection.review_due && new Date(connection.review_due) < new Date()) return false
  return true
}
