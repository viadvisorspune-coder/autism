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
import {
  type WorkflowName,
  composeTrigger,
  deploymentFor,
  identityFor,
  routeFor,
} from '../_shared/compose.ts'

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
   * The route, with the caller allowed to correct it but not to invent it.
   *
   * `routeFor` is a regular expression and will sometimes be wrong — "can you
   * write down what changed" reads as a document request and is not one. The
   * interface shows which workflow is about to run, so a person can say
   * otherwise; that override arrives here as `workflow`. Anything that is not
   * one of the two known names is ignored rather than trusted, because an
   * unknown workflow name has no deployment and would fail later and less
   * clearly.
   */
  const asked = str(body.workflow)
  const workflow: WorkflowName =
    asked === 'understand' || asked === 'produce' ? asked : routeFor(message)

  const lookup = deploymentFor(workflow)
  if (!lookup.ok) {
    return json({ error: 'workflow_not_configured', detail: lookup.reason }, 503)
  }
  const deployment = lookup.deployment

  /**
   * The previous step, when this turn continues one.
   *
   * Read from the database rather than accepted from the caller. The browser
   * could post any text as "what the last run said", and the whole value of a
   * hand-off is that the second workflow is reading something a first workflow
   * actually produced.
   */
  let previous: { answerText: string | null; sources: unknown; withheld: unknown } | null = null
  const chainedFrom = str(body.chain_from)
  if (chainedFrom) {
    const { data: prior } = await admin
      .from('workflow_runs')
      .select('id, actor_id, answer_html, result')
      .eq('id', chainedFrom)
      .maybeSingle()

    if (!prior) return json({ error: 'chain_source_not_found' }, 404)
    // A run belonging to somebody else is not source material for this one.
    if (prior.actor_id && prior.actor_id !== actor.id) {
      return forbidden('That earlier step belongs to a different person.')
    }

    const envelope = (prior.result ?? {}) as Record<string, unknown>
    previous = {
      answerText: textFromHtml(String(prior.answer_html ?? '')),
      sources: envelope.sources ?? [],
      withheld: envelope.withheld ?? [],
    }
  }

  const identity = identityFor(actor, patientId ?? 'ANANYA-001')
  const recipient = asRecipient(body.recipient)
  const triggerText = composeTrigger({
    workflow,
    identity,
    message,
    recipient,
    artifactType: str(body.artifact_type),
    previous,
  })

  // The run exists before it is started, so a trigger that fails still leaves
  // a record that it was attempted.
  const idempotencyKey = str(body.idempotency_key) ?? crypto.randomUUID()
  const { data: run, error: runError } = await admin
    .from('workflow_runs')
    .insert({
      patient_id: patientId,
      actor_id: actor.id,
      type: workflow === 'understand' ? 'Understand' : 'Produce',
      workflow_name: workflow,
      stakeholder: actor.name,
      current_step: 'Trigger composed',
      status: 'In progress',
      trigger_text: triggerText,
      idempotency_key: idempotencyKey,
      // Empty when configured by a URL that carries no recognisable id. Null
      // says "we do not know it"; an empty string would read as a real value
      // and quietly fail any later lookup that tried to match on it.
      deployment_id: deployment.id || null,
      chained_from: chainedFrom,
    })
    .select('id')
    .single()

  if (runError || !run) return json({ error: 'could_not_record_run' }, 500)

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
    /**
     * Why it could not be reached, and where it was trying to go.
     *
     * The URL is not a secret — it is a deployment id on a public host — and
     * withholding it made this the least diagnosable failure in the system:
     * a malformed value in the URL variable surfaced as a bare
     * `yoxa_unreachable`, which reads as a network problem and sends people
     * to check things that were never wrong. The secret is still never
     * logged or returned.
     */
    console.error('trigger failed', String(error))
    const why = error instanceof Error ? error.message : String(error)
    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', current_step: `Could not reach Yoxa: ${why}` })
      .eq('id', run.id)
    return json(
      { error: 'yoxa_unreachable', detail: why, url: deployment.url, run_id: run.id },
      502,
    )
  }

  if (!upstream.ok) {
    /**
     * The status code is the diagnosis, so it is kept.
     *
     * 401 and 403 look identical from a chat window and mean opposite things:
     * a wrong secret against a live deployment, versus a correct secret
     * against one nobody activated. Collapsing them into "it failed" is what
     * turns a two-minute fix into an afternoon.
     */
    const detail = upstream.status === 403
      ? 'Yoxa accepted the credentials but the deployment is not activated.'
      : upstream.status === 401
        ? 'Yoxa rejected the deployment secret.'
        : `Yoxa refused the trigger (HTTP ${upstream.status}).`

    await admin
      .from('workflow_runs')
      .update({ status: 'Blocked', current_step: detail })
      .eq('id', run.id)
    return json({ error: 'trigger_refused', status: upstream.status, detail, run_id: run.id }, 502)
  }

  const accepted = (await upstream.json().catch(() => ({}))) as Record<string, unknown>
  await admin
    .from('workflow_runs')
    .update({
      current_step: 'Queued at Yoxa',
      yoxa_run_id: str(accepted.workflow_run_id),
    })
    .eq('id', run.id)

  return json({
    run_id: run.id,
    workflow,
    status: 'queued',
    yoxa_run_id: str(accepted.workflow_run_id),
    /**
     * The exact text that was sent.
     *
     * Returned so the interface can show what left rather than what it
     * predicted would leave. The page composes its own preview to display
     * before sending, and if the two ever drift, this is the one that is true.
     */
    trigger_text: triggerText,
  })
})

function asRecipient(v: unknown): { name: string; role: string; org: string } | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  return { name, role: str(r.role) ?? 'recipient', org: str(r.org) ?? '' }
}

/**
 * HTML to plain text, for material being handed to another workflow.
 *
 * A trigger is prose a model reads, not a document it renders. Sending markup
 * spends its attention on tags and invites it to echo them into its own
 * output. Block tags become line breaks first, so an unclosed paragraph does
 * not weld the end of one sentence onto the start of the next.
 */
function textFromHtml(html: string): string {
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
