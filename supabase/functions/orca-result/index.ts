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
import { deliver, findRun } from '../_shared/deliver.ts'


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

    const run = await findRun({ runId, yoxaRunId })
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

    const { chainedRunId, chainError } = await deliver(run, {
      answerHtml,
      envelope,
      status,
      step: status === 'Completed' ? 'Answered' : 'Replied without an answer',
    })

    return json({
      stored: true,
      run_id: run.id,
      status,
      chained_run_id: chainedRunId,
      chain_error: chainError,
    })
  }),
)
