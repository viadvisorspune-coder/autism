/**
 * Starting a workflow run.
 *
 * Two callers need this and they are not alike. `orca-chat` starts a run
 * because a person asked something. `orca-result` starts one because a chained
 * path's first half just finished and the second half is now due — minutes
 * later, with nobody watching. Duplicating the sequence across both was the
 * obvious shortcut and the wrong one: the composed trigger, the run row and
 * the identifiers handed to a workflow have to be identical whichever door the
 * run came through, or a chained document is built from a subtly different
 * brief than a direct one.
 *
 * The order matters and is not arbitrary. The row is created before the
 * trigger is composed, because a workflow with API connectors writes its
 * answer back against ORCA's run id and learns that id only from the trigger
 * text. An id cannot be in a message that has already been sent.
 */

import { admin, json } from './yoxa.ts'
import {
  type Recipient,
  type WorkflowName,
  composeTrigger,
  deploymentFor,
  identityFor,
} from './compose.ts'

export interface LaunchRequest {
  actor: { id: string; name: string; role: string }
  patientId: string | null
  lane: WorkflowName
  message: string
  recipient?: Recipient | null
  artifactType?: string | null
  /** The run whose answer feeds this one. */
  chainedFrom?: string | null
  path?: string | null
  reason?: string | null
  /** What to run when this finishes, for the second half of a chain. */
  then?: WorkflowName | null
  idempotencyKey?: string | null
  /**
   * Rehearse instead of running.
   *
   * Everything up to the outbound call happens for real — routing, the
   * composed trigger, the run row — and then a stand-in answer is recorded
   * rather than Yoxa being called. It is the only way to exercise a path while
   * a deployment is unconfigured, and the only way to test routing without
   * spending a minute per attempt.
   */
  dryRun?: boolean
  /** One sentence saying a file came with the question. */
  attached?: string | null
}

export type LaunchResult =
  | { ok: true; runId: string; yoxaRunId: string | null; triggerText: string }
  | { ok: false; status: number; error: string; detail?: string; runId?: string }

const TYPE_LABEL: Record<WorkflowName, string> = {
  understand: 'Understand',
  produce: 'Produce',
  chat: 'Chat',
  fifteen: 'End-to-end support coordination',
}

export async function launch(req: LaunchRequest): Promise<LaunchResult> {
  /**
   * A run needs to know whose record it is about.
   *
   * This used to fall back to the literal 'ANANYA-001' — an id that exists
   * nowhere in this system, since the record is 'pt-ananya'. So a request
   * without a subject composed a trigger naming a patient the connectors could
   * never resolve; the workflow would have retrieved nothing and reported that
   * confidently, which is worse than failing. Refusing is the honest answer:
   * there is no sensible default for whose medical record to read.
   */
  if (!req.patientId) {
    return {
      ok: false,
      status: 400,
      error: 'no_subject',
      detail: 'This request does not say whose record it is about.',
    }
  }

  /**
   * A rehearsal does not need a configured deployment.
   *
   * Requiring one defeated the main use: the reason to rehearse is usually
   * that a lane is mid-configuration or its workflow is still being changed.
   * Refusing to exercise routing until the thing routing points at exists is
   * backwards.
   */
  const lookup = deploymentFor(req.lane)
  if (!lookup.ok && !req.dryRun) {
    return { ok: false, status: 503, error: 'workflow_not_configured', detail: lookup.reason }
  }
  const deployment = lookup.ok ? lookup.deployment : null

  /**
   * The previous step, read from the database rather than passed in.
   *
   * A caller could hand over any text as "what the last run said", and the
   * entire value of a hand-off is that the second workflow is reading
   * something a first workflow actually produced.
   */
  let previous: { answerText: string | null; sources: unknown; withheld: unknown } | null = null
  if (req.chainedFrom) {
    const { data: prior } = await admin
      .from('workflow_runs')
      .select('id, actor_id, answer_html, result')
      .eq('id', req.chainedFrom)
      .maybeSingle()
    if (!prior) return { ok: false, status: 404, error: 'chain_source_not_found' }
    if (prior.actor_id && prior.actor_id !== req.actor.id) {
      return { ok: false, status: 403, error: 'chain_source_belongs_to_another_person' }
    }
    const envelope = (prior.result ?? {}) as Record<string, unknown>
    previous = {
      answerText: textFromHtml(String(prior.answer_html ?? '')),
      sources: envelope.sources ?? [],
      withheld: envelope.withheld ?? [],
    }
  }

  const idempotencyKey = req.idempotencyKey ?? crypto.randomUUID()
  const { data: run, error: runError } = await admin
    .from('workflow_runs')
    .insert({
      patient_id: req.patientId,
      actor_id: req.actor.id,
      type: TYPE_LABEL[req.lane],
      workflow_name: req.lane,
      stakeholder: req.actor.name,
      current_step: 'Trigger composed',
      status: 'In progress',
      idempotency_key: idempotencyKey,
      deployment_id: deployment?.id || null,
      chained_from: req.chainedFrom ?? null,
      path: req.path ?? null,
      route_reason: req.reason ?? null,
      next_workflow: req.then ?? null,
      next_message: req.then ? req.message : null,
      next_recipient: req.then ? (req.recipient ?? null) : null,
      next_artifact_type: req.then ? (req.artifactType ?? null) : null,
      dry_run: req.dryRun ?? false,
    })
    .select('id')
    .single()

  if (runError || !run) return { ok: false, status: 500, error: 'could_not_record_run' }

  const identity = identityFor(req.actor, req.patientId)
  const triggerText = composeTrigger({
    workflow: req.lane,
    identity,
    message: req.message,
    recipient: req.recipient ?? null,
    artifactType: req.artifactType ?? null,
    previous,
    runId: run.id,
    attached: req.attached ?? null,
  })
  await admin.from('workflow_runs').update({ trigger_text: triggerText }).eq('id', run.id)

  /**
   * A rehearsal stops here, having done everything except the one thing.
   *
   * The point is to prove the parts this side owns — did routing pick the
   * right path, is the composed trigger right, does a chain record its second
   * half — without waiting on a workflow or a deployment. The stand-in answer
   * says what it is in its own text, because a screen full of realistic
   * placeholder about somebody's medical record is exactly the thing that must
   * never be mistaken for the real answer.
   */
  if (req.dryRun) {
    const answer =
      `<h3>Rehearsal, not a real answer</h3>` +
      `<p>This run was routed and composed but never sent to Yoxa. ` +
      `Path: <strong>${req.path ?? 'unknown'}</strong>. ` +
      `Lane: <strong>${req.lane}</strong>` +
      `${req.then ? `, followed by <strong>${req.then}</strong>` : ''}.</p>` +
      `<p>Nothing was read from the record and nothing was produced.</p>`
    await admin
      .from('workflow_runs')
      .update({
        answer_html: answer,
        status: 'Completed',
        current_step: 'Rehearsed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id)
    return { ok: true, runId: run.id, yoxaRunId: null, triggerText }
  }

  // Unreachable when dryRun is set, which returned above; this narrows the type.
  if (!deployment) return { ok: false, status: 503, error: 'workflow_not_configured' }

  let upstream: Response
  try {
    upstream = await fetch(deployment.url, {
      method: 'POST',
      headers: {
        'X-Yoxa-Deployment-Secret': deployment.secret,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trigger_text: triggerText }),
    })
  } catch (error) {
    // Never log the secret, only that the call failed and where it was going.
    console.error('trigger failed', String(error))
    const why = error instanceof Error ? error.message : String(error)
    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', current_step: `Could not reach Yoxa: ${why}` })
      .eq('id', run.id)
    return { ok: false, status: 502, error: 'yoxa_unreachable', detail: why, runId: run.id }
  }

  if (!upstream.ok) {
    /**
     * The status code is the diagnosis, so it is kept.
     *
     * 401 and 403 look identical from a chat window and mean opposite things:
     * a wrong secret against a live deployment, versus a correct secret
     * against one nobody activated. Collapsing them into "it failed" turns a
     * two-minute fix into an afternoon.
     */
    /**
     * What Yoxa said, not only that it said no.
     *
     * 401 and 403 are self-explaining, so their own sentences stand. Every
     * other refusal was collapsed into the status code alone — and a 400 is
     * precisely the case where the status says nothing and the body says
     * everything: a malformed field, a deployment in the wrong state, a
     * payload the workflow does not accept. Discarding it left the one person
     * who could fix it reading "HTTP 400" and guessing.
     *
     * Trimmed, because this is stored on the run and shown on a screen, and
     * an unbounded upstream body has no business in either.
     */
    const said = await upstream.text().catch(() => '')
    const because = said.trim().slice(0, 400)

    const detail =
      upstream.status === 403
        ? 'Yoxa accepted the credentials but the deployment is not activated.'
        : upstream.status === 401
          ? 'Yoxa rejected the deployment secret.'
          : `Yoxa refused the trigger (HTTP ${upstream.status})` +
            (because ? `: ${because}` : '.')
    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', current_step: detail })
      .eq('id', run.id)
    return { ok: false, status: 502, error: 'trigger_refused', detail, runId: run.id }
  }

  const accepted = (await upstream.json().catch(() => ({}))) as Record<string, unknown>
  const yoxaRunId = typeof accepted.workflow_run_id === 'string' ? accepted.workflow_run_id : null
  await admin
    .from('workflow_runs')
    .update({ current_step: 'Queued at Yoxa', yoxa_run_id: yoxaRunId })
    .eq('id', run.id)

  return { ok: true, runId: run.id, yoxaRunId, triggerText }
}

/** A launch failure, as an HTTP response. */
export const launchError = (r: Extract<LaunchResult, { ok: false }>): Response =>
  json({ error: r.error, detail: r.detail, run_id: r.runId }, r.status)

/**
 * HTML to plain text, for material handed to another workflow.
 *
 * A trigger is prose a model reads, not a document it renders. Sending markup
 * spends its attention on tags and invites it to echo them into its own
 * output. Block tags become line breaks first, so an unclosed paragraph does
 * not weld the end of one sentence onto the start of the next.
 */
export function textFromHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|tr|blockquote|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:ldquo|rdquo);/g, '"')
    .replace(/&(?:lsquo|rsquo);/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
