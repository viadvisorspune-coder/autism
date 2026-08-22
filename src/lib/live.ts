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
  refresh: () => void
}

export function useLive<T>(
  resource: string,
  patientId: string | null = 'pt-ananya',
  intervalMs = 4000,
): LiveResult<T> {
  const { role, option } = useSession()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<number | null>(null)
  const alive = useRef(true)

  const read = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    try {
      const { data: body, error } = await supabase.functions.invoke('app-read', {
        body: { resource, role, actor_id: option?.personId ?? null, patient_id: patientId },
      })
      if (!alive.current) return
      if (!error && body?.permitted) setData((body.data as T) ?? null)
    } catch {
      /* A missed poll is not worth showing anyone; the next one will land. */
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [resource, role, option?.personId, patientId])

  useEffect(() => {
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

  return { data, loading, refresh: read }
}

/* ------------------------------------------------------------------- writes */

export interface WriteResult {
  ok: boolean
  error: string | null
  note: string | null
}

/** One person's decision, sent to the record everyone else is reading. */
export async function actOnRecord(
  action: string,
  patientId: string,
  actorId: string,
  fields: Record<string, unknown> = {},
): Promise<WriteResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'This build has no backend, so nothing was saved.', note: null }
  }

  try {
    const { data, error } = await supabase.functions.invoke('app-write', {
      body: { action, patient_id: patientId, actor_id: actorId, ...fields },
    })

    if (error) {
      const reason = await refusal(error)
      return { ok: false, error: reason ?? 'That could not be saved.', note: null }
    }
    return {
      ok: true,
      error: null,
      note: typeof data?.note === 'string' ? data.note : null,
    }
  } catch {
    return { ok: false, error: 'That could not be saved.', note: null }
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

export interface ConversationData {
  conversation: { id: string; started_at: string; last_message_at: string } | null
  messages: StoredMessage[]
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
