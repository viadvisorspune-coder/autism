import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Starting a workflow, and watching one.
 *
 * The deployment secret is not here and never can be — the browser calls
 * `workflow-trigger`, which holds it. What this file does is the honest part of
 * the conversation: send the question, then report where the run has actually
 * got to, including when it has stopped and is waiting for a person.
 *
 * It deliberately does not pretend to be a chat. A run takes a minute or two
 * and often ends by stopping rather than answering, so anything that showed a
 * typing indicator and waited for a reply would be lying about what is
 * happening underneath.
 */

export interface RunStep {
  label: string
  state: 'done' | 'current' | 'todo'
  detail?: string | null
}

export interface RunApproval {
  request_id: string
  title: string
  description: string | null
  options: { id: string; label: string; description?: string }[]
  status: string
  created_at: string
}

export interface RunReview {
  id: string
  title: string
  reason: string
  understanding: string | null
  uncertainty: string | null
  proposed_action: string | null
  decision_required: string | null
  status: string
}

export interface RunActivity {
  id: string
  occurred_at: string
  actor_label: string
  action: string
  record: string
  result: 'Allowed' | 'Denied'
  why: string | null
}

export interface RunState {
  run: {
    id: string
    patient_id: string | null
    type: string
    status: string
    current_step: string
    waiting_for: string | null
    steps: RunStep[]
    started_at: string
    updated_at: string
    closed_at: string | null
    closure_reason: string | null
  }
  approvals: RunApproval[]
  reviews: RunReview[]
  activity: RunActivity[]
}

export interface StartResult {
  runId: string | null
  error: string | null
}

/** Statuses that mean the run has stopped and will not move on its own. */
const WAITING = new Set([
  'Awaiting approval',
  'Awaiting professional review',
  'Awaiting information',
  'Awaiting stakeholder',
])

export function isWaitingOnAPerson(status: string): boolean {
  return WAITING.has(status)
}

/**
 * What "waiting for" means to the person reading it.
 *
 * `waiting_for` is an engineering field. It holds whatever the run is blocked
 * on, which includes the name of the platform the workflow runs on and, when
 * something fails, a bare HTTP status. Ananya saw "This is now with Yoxa. It
 * will not move until they decide."
 *
 * Two things wrong with that. She has never heard of Yoxa and has no reason
 * to: the machinery ORCA is built on is not part of her care, and naming a
 * vendor in her conversation makes her responsible for understanding an
 * architecture. And nothing is *deciding* — a queue is not a person, and
 * saying it will not move until "they" decide invites her to wait on a
 * judgement that nobody is making.
 *
 * So a machine is described as work in progress, and only an actual person or
 * role is named. When it is genuinely with someone, "they" is correct and the
 * sentence means what it says.
 */
const NOT_A_PERSON = /yoxa|workflow|system|engine|queue|http|unreachable|returned \d/i

export function waitingLabel(waitingFor: string | null): { text: string; isPerson: boolean } {
  if (!waitingFor || NOT_A_PERSON.test(waitingFor)) {
    return { text: 'I am still working on this. Nothing needs you yet.', isPerson: false }
  }
  return {
    text: `This is now with ${waitingFor}, and nothing will move until they decide.`,
    isPerson: true,
  }
}

export function isFinished(status: string): boolean {
  return status === 'Completed' || status === 'Cancelled' || status === 'Blocked'
}

/**
 * Send a question to the agent layer.
 *
 * A fresh idempotency key per action: reusing one is only correct when
 * retrying the identical action, and a person pressing send twice because
 * nothing appeared to happen means it twice.
 */
export async function startRun(
  triggerText: string,
  patientId: string,
  actorId: string,
): Promise<StartResult> {
  if (!isSupabaseConfigured) {
    return { runId: null, error: 'This build has no backend, so nothing was sent.' }
  }

  try {
    // A trigger that never resolves leaves the compose button disabled and the
    // person unable to try again, which is worse than a clear failure.
    const { data, error } = await withTimeout(
      supabase.functions.invoke('workflow-trigger', {
        body: {
          trigger_text: triggerText,
          patient_id: patientId,
          actor_id: actorId,
          idempotency_key: crypto.randomUUID(),
        },
      }),
      20000,
    )

    if (error) {
      const detail = await readErrorBody(error)
      return { runId: null, error: detail ?? 'The workflow could not be started.' }
    }
    if (!data?.workflow_run_id) {
      return { runId: null, error: 'The workflow did not return a run to follow.' }
    }
    return { runId: String(data.workflow_run_id), error: null }
  } catch (error) {
    return {
      runId: null,
      error:
        error instanceof Error && error.message === 'timeout'
          ? 'The workflow did not respond. Nothing was sent, so it is safe to try again.'
          : 'The workflow could not be reached.',
    }
  }
}

/** Rejects with "timeout" rather than hanging on a request that never lands. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function readRun(runId: string): Promise<RunState | null> {
  if (!isSupabaseConfigured) return null
  try {
    const { data, error } = await supabase.functions.invoke('app-read', {
      body: { resource: 'run', role: 'patient', run_id: runId },
    })
    if (error || !data?.permitted) return null
    return (data.data as RunState) ?? null
  } catch {
    return null
  }
}

/**
 * Follow a run until it stops moving, calling back on every change.
 *
 * Polls rather than subscribes, because the run is advanced by Yoxa calling
 * our endpoints rather than by anything this page can listen to. Stops when the
 * run finishes, when it is waiting on a person, or when it has clearly stalled
 * — never indefinitely, because a spinner with no end is its own kind of lie.
 */
export function followRun(
  runId: string,
  onChange: (state: RunState) => void,
  options: { intervalMs?: number; maxMs?: number } = {},
): () => void {
  // Measured against real runs: the first agent step lands three to five
  // minutes after the trigger, so a five-minute ceiling gave up before the run
  // had done anything. Polling every three seconds for that long is also just
  // noise — slow down once the first minute has passed without news.
  const interval = options.intervalMs ?? 4000
  const limit = options.maxMs ?? 20 * 60 * 1000
  const startedAt = Date.now()

  let stopped = false
  let lastSignature = ''

  const tick = async () => {
    if (stopped) return

    const state = await readRun(runId)
    if (state) {
      const signature = JSON.stringify([
        state.run.status,
        state.run.current_step,
        state.approvals.length,
        state.activity.length,
      ])
      if (signature !== lastSignature) {
        lastSignature = signature
        onChange(state)
      }

      if (isFinished(state.run.status) || isWaitingOnAPerson(state.run.status)) {
        stopped = true
        return
      }
    }

    if (Date.now() - startedAt > limit) {
      stopped = true
      return
    }

    const elapsed = Date.now() - startedAt
    window.setTimeout(tick, elapsed > 60_000 ? interval * 2 : interval)
  }

  void tick()

  return () => {
    stopped = true
  }
}

/**
 * The reason a function call failed, in words.
 *
 * supabase-js attaches the raw Response as `context`, so the body has to be
 * read from it rather than picked off a property. Getting this wrong turned a
 * precise "Yoxa returned 403" into a generic "could not be started" and hid
 * the actual fault for an hour — the message a failure carries is the whole
 * value of the failure.
 */
/**
 * The one thing in an upstream failure body that is worth repeating.
 *
 * Not the whole payload: a person who asked for help with their week should
 * not be shown a stack of JSON. But a trace id is what the other side's
 * support desk asks for first, and having to go digging in function logs to
 * find it is a tax on the person least able to pay it.
 */
function referenceIn(detail: unknown): string {
  if (typeof detail !== 'string') return ''
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>
    const id = parsed.trace_id ?? parsed.traceId ?? parsed.request_id ?? parsed.id
    return typeof id === 'string' && id ? ` Reference for their support: ${id}` : ''
  } catch {
    return ''
  }
}

/** Their own sentence about what went wrong, when they provide one. */
function messageIn(detail: unknown): string | null {
  if (typeof detail !== 'string') return null
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: unknown } }
    const message = parsed.error?.message
    return typeof message === 'string' && message ? message : null
  } catch {
    return null
  }
}

async function readErrorBody(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context
  if (!context) return null
  try {
    let parsed: unknown = null

    if (context instanceof Response) {
      parsed = await context.clone().json()
    } else {
      const holder = context as { body?: unknown }
      parsed = typeof holder.body === 'string' ? JSON.parse(holder.body) : holder.body
    }

    const record = parsed as Record<string, unknown> | null
    if (!record) return null

    // A rejection carries a status, and the status says whose problem it is.
    // Repeating one explanation for every code sends people to check the thing
    // that is already correct — which is exactly what a 403 message did when
    // the answer was a 500.
    if (record.error === 'trigger_rejected') {
      const status = Number(record.status ?? 0)
      // Yoxa's own body comes back in `detail`. Discarding it produced a
      // sentence that was true, unhelpful, and identical every time — the
      // reference is the only part their support can act on, so it survives.
      const ref = referenceIn(record.detail)
      if (status >= 500) {
        // Their body names the failure. "The trigger start was interrupted"
        // is a more useful thing to read than "HTTP 500", and it is their
        // wording rather than an inference from a status code.
        const said = messageIn(record.detail)
        // No claim about retrying: the breaker means it sometimes did and
        // sometimes did not, and a sentence that is true half the time is
        // worse than one that says less.
        return (
          `The workflow service could not start this. ${said ?? `It failed on its side (HTTP ${status}).`} ` +
          `Nothing is wrong with your record or your request — this is theirs to fix.${ref}`
        )
      }
      if (status === 403 || status === 401) {
        // Actionable without naming the vendor: whoever maintains this knows
        // which service it is, and the person reading it does not need to.
        return 'The workflow service refused the request. Either the deployment is not active, or its secret does not match the one set here.'
      }
      if (status === 404) {
        return 'The workflow service does not recognise this deployment. Its address may have changed.'
      }
      return `The workflow service refused the request (HTTP ${status}).${ref}`
    }
    if (record.error === 'yoxa_unreachable') {
      return 'The workflow service could not be reached. Nothing was sent.'
    }
    if (record.error === 'not_permitted') {
      return typeof record.reason === 'string' ? record.reason : 'You do not have access to this record.'
    }
    if (typeof record.reason === 'string') return record.reason
    if (record.error === 'trigger_not_configured') {
      return 'The workflow is not connected yet: YOXA_TRIGGER_URL and YOXA_DEPLOYMENT_SECRET are not set.'
    }
    if (record.error === 'sign_in_required') {
      return 'The workflow refused the request because nobody is signed in.'
    }
    if (typeof record.error === 'string') return record.error
    return null
  } catch {
    return null
  }
}
