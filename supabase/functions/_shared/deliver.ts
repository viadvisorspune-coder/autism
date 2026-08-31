/**
 * Recording that a run produced something, whatever brought the news.
 *
 * Three channels can carry a workflow's output back into ORCA and they arrive
 * at different doors: a completion webhook or poller reaches `orca-result`, an
 * approval gate reaches `hitl-receiver`, and a workflow with API connectors
 * writes through `conversation-reply`. Nothing about the answer differs — only
 * the road it took.
 *
 * That made this the natural place for a bug. `orca-result` recorded answers,
 * fired chained paths and moved run state; `hitl-receiver` stored the approval
 * and touched none of it. So a run whose only output came through an approval
 * gate sat at "Queued at Yoxa" for ever: no answer on the row, so the chat
 * could not settle the turn, the second half of a chain never fired, and the
 * replay lane could never find it. The content was in the database the whole
 * time, one table across.
 *
 * It matters more here than it would elsewhere because the approval gate is
 * currently the ONLY road home for two of the five paths. UNDERSTAND and
 * PRODUCE are locked with no connectors, and Yoxa exposes no way to read a
 * finished run — so an answer that arrives attached to an approval is not an
 * edge case, it is the main case.
 */

import { admin } from './yoxa.ts'
import type { WorkflowName } from './compose.ts'
import { launch } from './start.ts'

export interface RunRef {
  /** ORCA's own run id. */
  runId?: string | null
  /** Yoxa's run id, which is what an external caller is likely to have. */
  yoxaRunId?: string | null
}

export interface Delivery {
  /** The output, as HTML. Null when the message carried no content. */
  answerHtml?: string | null
  /** The whole envelope as received, kept unmodified for whoever looks next. */
  envelope?: unknown
  /** A run state from this database's vocabulary. */
  status: string
  /** What the run is now doing, in words. */
  step: string
}

const CHAIN_COLUMNS =
  'id, status, actor_id, patient_id, answer_html, next_workflow, next_message, ' +
  'next_recipient, next_artifact_type, path, route_reason'

/** The run this delivery belongs to, by either identifier. */
export async function findRun(ref: RunRef) {
  const base = admin.from('workflow_runs').select(CHAIN_COLUMNS).limit(1)
  if (ref.runId) {
    const { data } = await base.eq('id', ref.runId).maybeSingle()
    if (data) return data
  }
  if (ref.yoxaRunId) {
    const { data } = await base.eq('yoxa_run_id', ref.yoxaRunId).maybeSingle()
    if (data) return data
  }
  return null
}

/**
 * Land the output on the run, then continue the path if one was planned.
 *
 * Returns the id of any chained run that was started, so a caller can report
 * it. A failure to chain is not a failure to deliver: the answer is already
 * recorded, and losing it because the follow-on could not start would be the
 * wrong trade.
 */
export async function deliver(
  run: Record<string, unknown>,
  d: Delivery,
): Promise<{ chainedRunId: string | null; chainError: string | null }> {
  const runId = String(run.id)

  /**
   * An answer already on the row is not overwritten.
   *
   * Deliveries are at-least-once and can arrive by more than one road, so the
   * same run may be told about its own output twice. The first account stands:
   * replacing it would swap what the person has already read on screen for a
   * second copy that may have been through a different transport.
   */
  const keepExisting = Boolean(run.answer_html)
  const answerHtml = keepExisting ? String(run.answer_html) : (d.answerHtml ?? null)

  await admin
    .from('workflow_runs')
    .update({
      ...(d.envelope !== undefined ? { result: d.envelope } : {}),
      ...(keepExisting ? {} : { answer_html: d.answerHtml ?? null }),
      status: d.status,
      current_step: d.step,
      finished_at: d.status === 'Completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)

  const next = run.next_workflow ? String(run.next_workflow) : null
  if (!next || !answerHtml) return { chainedRunId: null, chainError: null }

  /**
   * The second half only runs on real content.
   *
   * A run that ended blocked, refused, or with nothing to say has produced no
   * source material, and drafting a document from an absence is how a
   * confident letter gets written about a record nobody successfully read.
   *
   * Note this deliberately does NOT require status 'Completed'. When an answer
   * arrives attached to an approval gate the run is legitimately still awaiting
   * a person, and that answer is nonetheless the material the next step needs.
   * Waiting for a completion that this transport never sends would stall every
   * chained path indefinitely.
   */
  const actor = await actorFor(String(run.actor_id ?? ''))
  if (!actor) return { chainedRunId: null, chainError: 'actor_not_found' }

  const chained = await launch({
    actor,
    patientId: run.patient_id ? String(run.patient_id) : null,
    lane: next as WorkflowName,
    message: String(run.next_message ?? ''),
    recipient: (run.next_recipient ?? null) as never,
    artifactType: run.next_artifact_type ? String(run.next_artifact_type) : null,
    chainedFrom: runId,
    path: run.path ? String(run.path) : null,
    reason: run.route_reason ? String(run.route_reason) : null,
  })

  // Cleared either way. A failed second half is recorded on its own row with
  // its own reason; leaving the instruction would restart it on every
  // redelivery of the same result.
  await admin.from('workflow_runs').update({ next_workflow: null }).eq('id', runId)

  return {
    chainedRunId: chained.ok ? chained.runId : null,
    chainError: chained.ok ? null : chained.error,
  }
}

/**
 * The person a chained run acts for.
 *
 * Read from the first run's row, never from the incoming request. The caller
 * is a workflow reporting a result, and it has no business naming who the
 * follow-on document is written for — that was settled when the person asked,
 * and it is the basis on which the second workflow's access is decided.
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
