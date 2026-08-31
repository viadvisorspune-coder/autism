/**
 * Where a finished run's answer lands.
 *
 * The v5 workflows have no Supabase connectors, so nothing calls back into
 * ORCA during a run the way the older ones did. A trigger is accepted, the run
 * happens, and the answer exists in Yoxa. This is the one door back.
 *
 * IT IS DELIBERATELY INDIFFERENT TO HOW THE ANSWER ARRIVED. A completion
 * webhook, a poller that read Yoxa's runs API, an output tool configured to
 * POST here, or a person pasting an envelope during a demo — all of them look
 * the same from inside this function, because all any of them can do is name a
 * run and hand over an envelope. That was the point of putting the join in the
 * database rather than in the transport: the screen reading the result does
 * not have to know, and the transport can change without touching anything
 * else.
 *
 * WHAT IT WILL NOT DO. It will not invent a status. An envelope that does not
 * say it succeeded is stored as received and the run is left in a state that
 * says so, because the alternative is showing somebody a confident answer
 * about their record that no workflow actually stood behind.
 */

import { admin, guard, json, str } from '../_shared/yoxa.ts'
import type { WorkflowName } from '../_shared/compose.ts'
import { launch } from '../_shared/start.ts'

/**
 * The person a chained run acts for.
 *
 * Read from the first run's row rather than from the incoming request. The
 * caller here is Yoxa delivering a result, and it has no business naming who
 * the follow-on document is written for — that was settled when the person
 * asked, and it is the whole basis on which the second workflow's access is
 * decided.
 */
async function actorFor(id: string) {
  if (!id) return null
  const { data } = await admin
    .from('app_users')
    .select('id, name, role')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

/** Yoxa's status words, mapped to the run states this database knows. */
const RUN_STATUS: Record<string, string> = {
  done: 'Completed', complete: 'Completed', completed: 'Completed',
  success: 'Completed', ok: 'Completed',
  needs_clarification: 'Awaiting information', clarification: 'Awaiting information',
  needs_approval: 'Awaiting approval', awaiting_approval: 'Awaiting approval',
  paused: 'Awaiting approval',
  blocked: 'Blocked', refused: 'Blocked', denied: 'Blocked',
  error: 'Escalated', failed: 'Escalated',
}

Deno.serve(
  guard(async (_req, { body }) => {
    /**
     * Which run this belongs to.
     *
     * Either identifier works. `run_id` is ORCA's own and is what a poller
     * would have; `yoxa_run_id` is what a webhook from Yoxa would carry, since
     * Yoxa has no reason to know ORCA's ids. Requiring one specific form would
     * mean the transport we end up with decides whether this function is
     * usable.
     */
    const runId = str(body.run_id)
    const yoxaRunId = str(body.yoxa_run_id) ?? str(body.workflow_run_id)
    if (!runId && !yoxaRunId) {
      return json({ error: 'run_id or yoxa_run_id is required' }, 400)
    }

    const lookup = admin
      .from('workflow_runs')
      .select(
        'id, status, actor_id, patient_id, next_workflow, next_message, ' +
          'next_recipient, next_artifact_type, path, route_reason',
      )
      .limit(1)
    const { data: run } = runId
      ? await lookup.eq('id', runId).maybeSingle()
      : await lookup.eq('yoxa_run_id', yoxaRunId!).maybeSingle()

    if (!run) return json({ error: 'run_not_found' }, 404)

    // The envelope, wherever the transport put it.
    const envelope =
      (body.result ?? body.output ?? body.envelope ?? body.data ?? body) as Record<string, unknown>

    const answerHtml =
      str(envelope.answer) ?? str(envelope.answer_html) ?? str(envelope.response)

    const word = str(envelope.status)?.toLowerCase().replace(/[\s-]+/g, '_') ?? ''
    /**
     * An unrecognised status does not become "Completed".
     *
     * `In progress` is the honest resting place for an envelope we cannot
     * classify: something came back, we stored it, and we are not claiming the
     * work finished. The raw envelope is on the row for whoever looks next.
     */
    const status = RUN_STATUS[word] ?? 'In progress'

    const { error } = await admin
      .from('workflow_runs')
      .update({
        result: envelope,
        answer_html: answerHtml,
        status,
        current_step: status === 'Completed' ? 'Answered' : 'Replied without an answer',
        finished_at: status === 'Completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    if (error) return json({ error: error.message }, 500)

    /**
     * The second half of a chained path.
     *
     * "Write a handover" with nothing recent on the record is two runs — look,
     * then draft — and this is where the second one starts. It cannot happen in
     * the request that began the first: Yoxa is asynchronous, so that request
     * returned minutes ago and whatever was waiting is gone. The instruction
     * survived on the row instead, and this is the moment it comes due.
     *
     * Only on a real answer. A run that ended blocked, refused, or with nothing
     * to say has produced no source material, and drafting a document from an
     * absence is how a confident letter gets written about a record nobody
     * successfully read.
     */
    const next = str(run.next_workflow)
    if (next && status === 'Completed' && answerHtml) {
      const actor = await actorFor(String(run.actor_id ?? ''))
      if (actor) {
        const chained = await launch({
          actor,
          patientId: run.patient_id ? String(run.patient_id) : null,
          lane: next as WorkflowName,
          message: String(run.next_message ?? ''),
          recipient: (run.next_recipient ?? null) as never,
          artifactType: str(run.next_artifact_type),
          chainedFrom: run.id,
          path: String(run.path ?? ''),
          reason: String(run.route_reason ?? ''),
        })
        // The chain is cleared either way. A failed second half is recorded on
        // its own row with its own reason; leaving the instruction in place
        // would restart it on every redelivery of this same result.
        await admin.from('workflow_runs').update({ next_workflow: null }).eq('id', run.id)
        return json({
          stored: true,
          run_id: run.id,
          status,
          chained_run_id: chained.ok ? chained.runId : null,
          chain_error: chained.ok ? null : chained.error,
        })
      }
    }

    return json({ stored: true, run_id: run.id, status })
  }),
)
