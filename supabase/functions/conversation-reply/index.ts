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
import { admin, guard, json, recordAudit, str } from '../_shared/yoxa.ts'

/** Long enough for a real answer, short enough not to be a document. */
const MAX_LENGTH = 4000

Deno.serve(
  guard(async (_req, { body }) => {
    const patientId = str(body.patient_id)
    const actorId = str(body.actor_id)
    const text = str(body.text)
    const workflowRunId = str(body.workflow_run_id)

    if (!patientId) return json({ error: 'patient_id is required' }, 400)
    if (!actorId) return json({ error: 'actor_id is required' }, 400)
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
      .eq('id', patientId)
      .maybeSingle()
    if (!patient) {
      return json(
        { error: 'patient_not_found', patient_id: patientId, fix: 'Use an id from the record.' },
        404,
      )
    }

    // Find the thread, or open one — but only for somebody who belongs here.
    let { data: conversation } = await admin
      .from('conversations')
      .select('id')
      .eq('patient_id', patientId)
      .eq('actor_id', actorId)
      .maybeSingle()

    if (!conversation) {
      const allowed = await mayHoldAConversation(patientId, actorId)
      if (!allowed) {
        // Refused, and recorded as refused. A denial is as much a part of the
        // audit trail as an action, and a silent no teaches nobody anything.
        await recordAudit({
          actorId,
          actorLabel: 'ORCA',
          actorRole: 'admin',
          patientId,
          action: 'Tried to open a conversation',
          record: `Conversation with ${actorId}`,
          accessType: 'Write',
          why: 'Agent reply to a person with no connection to this record.',
          result: 'Denied',
          workflowRunId,
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
        .insert({ patient_id: patientId, actor_id: actorId })
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
        workflow_run_id: workflowRunId,
      })
      .select('id, created_at')
      .single()

    if (error) return json({ error: error.message }, 400)

    await admin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id)

    /**
     * A run whose only job was to answer is finished once it has answered.
     *
     * Otherwise it sits at "In progress · Processing" forever: the person has
     * their reply on screen while the interface beside it still shows work
     * happening, which reads as though something else is coming. Closing it
     * here rather than in a further workflow step means the answer and the
     * closure cannot come apart — there is no third call left to fail after
     * the person has already been served.
     *
     * Only ever closes a run that is still open, and only a run whose type is
     * a question. A document-producing run has more to do after it speaks.
     */
    if (workflowRunId) {
      await admin
        .from('workflow_runs')
        .update({
          status: 'Completed',
          current_step: 'Replied',
          waiting_for: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowRunId)
        .eq('type', 'Question')
        .eq('status', 'In progress')
    }

    await recordAudit({
      actorId,
      actorLabel: 'ORCA',
      actorRole: 'admin',
      patientId,
      action: 'Replied in the conversation',
      record: `Message ${message.id}`,
      accessType: 'Write',
      why: text.slice(0, 200),
      result: 'Allowed',
      workflowRunId,
    })

    return json({
      message_id: message.id,
      conversation_id: conversation.id,
      created_at: message.created_at,
      delivered_to: actorId,
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
async function mayHoldAConversation(patientId: string, actorId: string): Promise<boolean> {
  const { data: patient } = await admin
    .from('patients')
    .select('id, user_id')
    .eq('id', patientId)
    .maybeSingle()
  if (patient && (patient as { user_id?: string }).user_id === actorId) return true

  const { data: connection } = await admin
    .from('connections')
    .select('consent_status, review_due')
    .eq('patient_id', patientId)
    .eq('person_id', actorId)
    .maybeSingle()

  if (!connection) return false
  if (connection.consent_status !== 'Active') return false
  if (connection.review_due && new Date(connection.review_due) < new Date()) return false
  return true
}
