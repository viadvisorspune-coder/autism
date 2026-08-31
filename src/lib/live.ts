import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'
import { useSession } from '../state/session'

/**
 * Shared state, across tabs and across people.
 *
 * An approval that only exists in the tab that raised it is a note to self.
 * For it to be a decision between two people, every open view has to agree
 * about it within a few seconds — Ananya raises something, her psychologist
 * sees it without refreshing, decides, and Ananya sees the answer.
 *
 * This polls rather than subscribing. Postgres change streams would be
 * cheaper, but they are filtered by row-level security, and ORCA has no
 * sign-in yet — so every browser is anonymous and would receive nothing. The
 * read path already enforces scope server-side, so polling it is both simpler
 * and honest about where permission is decided.
 *
 * It pauses while the tab is hidden. A background tab polling every four
 * seconds is a battery drain nobody asked for, and it catches up on return.
 */
export interface LiveResult<T> {
  data: T | null
  loading: boolean
  /**
   * True once a read has failed and none has since succeeded.
   *
   * Without this every failure was silent, and a screen that could not reach
   * the record rendered exactly like a screen whose record is empty. That is
   * the worst confusion this interface can produce: "you have no decisions
   * waiting" and "we could not find out whether you have decisions waiting"
   * are different facts, and only one of them means you can stop looking.
   *
   * Set only after a real attempt, and cleared by the next success, so a
   * single dropped poll on a flaky connection does not put a warning on
   * screen that the following second contradicts.
   */
  failed: boolean
  refresh: () => void
}

/**
 * Whose record, when the caller does not say.
 *
 * This defaulted to the literal 'pt-ananya'. In the seeded demo that is the
 * right answer, which is exactly what made it dangerous: it was silently
 * correct and would have stayed silently correct right up until the first
 * session belonging to somebody else, at which point every screen that omitted
 * the argument would have read one particular person's medical record.
 *
 * `undefined` now means "the record this session is about" and is resolved
 * from the session. An explicit `null` still means "no particular record",
 * which the caseload and admin reads rely on, so the two cases stay
 * distinguishable rather than collapsing into one default.
 */
export function useLive<T>(
  resource: string,
  patientId?: string | null,
  intervalMs = 4000,
): LiveResult<T> {
  const { role, option, patientId: sessionPatient } = useSession()
  const forRecord = patientId === undefined ? sessionPatient : patientId
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | null>(null)
  const alive = useRef(true)

  const read = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    try {
      const { data: body, error } = await supabase.functions.invoke('app-read', {
        body: { resource, role, actor_id: option?.personId ?? null, patient_id: forRecord },
      })
      if (!alive.current) return
      if (!error && body?.permitted) {
        setData((body.data as T) ?? null)
        setFailed(false)
      } else {
        // A refusal is not a failure — it is an answer, and the screens that
        // ask for a resource they may not have already handle it. Only an
        // actual inability to find out counts here.
        setFailed(Boolean(error))
      }
    } catch {
      if (alive.current) setFailed(true)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [resource, role, option?.personId, forRecord])

  useEffect(() => {
    /**
     * A build with no backend has nothing to poll.
     *
     * `read` returns immediately in that case, but the loop kept rescheduling
     * itself anyway — a timer firing every four seconds, for the life of the
     * tab, to call a function whose first line is a return. Harmless and
     * pointless, which is the combination that survives review forever.
     */
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    alive.current = true

    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(run, intervalMs)
    }

    const run = async () => {
      if (document.visibilityState === 'visible') await read()
      if (alive.current) schedule()
    }

    void run()

    // Coming back to a tab should feel current immediately, not in four
    // seconds' time.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive.current = false
      if (timer.current) window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [read, intervalMs])

  return { data, loading, failed, refresh: read }
}

/* ------------------------------------------------------------------- writes */

export interface WriteResult {
  ok: boolean
  error: string | null
  note: string | null
  /**
   * What the server sent back.
   *
   * Every write used to return only ok/error/note, so a caller that needed
   * the id of the thing it had just created had no way to get it — an upload
   * could not be shared, because the conversation never learned which
   * document it had made.
   */
  data: Record<string, unknown> | null
}

/** One person's decision, sent to the record everyone else is reading. */
export async function actOnRecord(
  action: string,
  patientId: string,
  actorId: string,
  fields: Record<string, unknown> = {},
): Promise<WriteResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      error: 'This build has no backend, so nothing was saved.',
      note: null,
      data: null,
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('app-write', {
      body: { action, patient_id: patientId, actor_id: actorId, ...fields },
    })

    if (error) {
      const reason = await refusal(error)
      return { ok: false, error: reason ?? 'That could not be saved.', note: null, data: null }
    }
    return {
      ok: true,
      error: null,
      note: typeof data?.note === 'string' ? data.note : null,
      data: (data ?? null) as Record<string, unknown> | null,
    }
  } catch {
    return { ok: false, error: 'That could not be saved.', note: null, data: null }
  }
}

/** A refusal is an answer, and it carries a reason worth showing. */
async function refusal(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context
  if (!context) return null
  try {
    const parsed =
      context instanceof Response
        ? await context.clone().json()
        : (context as { body?: unknown }).body
    const record = (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as Record<
      string,
      unknown
    > | null
    if (!record) return null
    if (typeof record.reason === 'string') return record.reason
    if (typeof record.fix === 'string') return record.fix
    if (typeof record.error === 'string') return record.error
    return null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ conversation */

export interface StoredMessage {
  id: string
  author: 'person' | 'orca'
  text: string
  created_at: string
  workflow_run_id: string | null
}

export interface SinceLastVisit {
  events: { id: string; title: string; recorded_on: string; category: string }[]
  decisions: { id: string; title: string; decision: string | null; decided_at: string }[]
  runs: { id: string; type: string; status: string; current_step: string; updated_at: string }[]
}

/**
 * A document a run produced, delivered into the conversation that asked for it.
 *
 * `url` is signed and expires in half an hour. Absent means the file is not
 * ready — usually a run that recorded the document before writing the bytes.
 */
export interface Attachment {
  id: string
  title: string
  file_type: string
  category: string
  workflow_run_id: string | null
  recorded_on: string
  url: string | null
}

export interface ConversationData {
  conversation: { id: string; started_at: string; last_message_at: string } | null
  messages: StoredMessage[]
  /** Matched to a message by workflow_run_id. */
  attachments?: Attachment[]
  last_seen_at: string | null
  since_last_visit: SinceLastVisit
}

/**
 * Says something into the record, rather than into a variable.
 *
 * Fire-and-forget on purpose: a message that failed to save should not stop
 * the conversation the person is having. The next read reconciles.
 */
export function persistMessage(
  patientId: string,
  actorId: string,
  text: string,
  author: 'person' | 'orca',
  workflowRunId?: string | null,
): void {
  void actOnRecord('say', patientId, actorId, { text, author, workflow_run_id: workflowRunId ?? null })
}

/** Stamped on leaving, so the next arrival can say what changed. */
export function markSeen(patientId: string, actorId: string): void {
  void actOnRecord('mark_seen', patientId, actorId)
}
