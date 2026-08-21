import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'
import { useSession } from '../state/session'

/**
 * Reads from the live record, with the prototype's own data as the floor.
 *
 * Three states, and the interface is told which one it is in rather than
 * having to infer it:
 *
 *   live      — the backend answered, and this is the real record
 *   refused   — the backend answered, and this role may not see it
 *   mock      — there is no backend reachable, so the prototype data is shown
 *
 * The mock state exists because a demonstration that goes blank when a network
 * call fails demonstrates nothing. It is never silent: every screen using this
 * shows which state it is in, because a page that cannot tell you whether it is
 * showing a real record is worse than one that admits it is not.
 */
export type ReadState = 'loading' | 'live' | 'refused' | 'mock'

export interface ReadResult<T> {
  state: ReadState
  data: T | null
  reason: string | null
}

export type Resource =
  | 'privacy'
  | 'timeline'
  | 'requests'
  | 'profile'
  | 'strategies'
  | 'audit'
  | 'approvals'
  | 'workflow_runs'

export function useOrcaRead<T>(resource: Resource, patientId: string | null = 'pt-ananya'): ReadResult<T> {
  const { role, option } = useSession()
  const [result, setResult] = useState<ReadResult<T>>({ state: 'loading', data: null, reason: null })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setResult({ state: 'mock', data: null, reason: 'No backend configured for this build.' })
      return
    }

    let cancelled = false

    supabase.functions
      .invoke('app-read', {
        body: { resource, role, actor_id: option?.personId ?? null, patient_id: patientId },
      })
      .then(({ data, error }) => {
        if (cancelled) return

        // A 403 arrives as an error with the refusal in its body. That is a
        // real answer from the permission layer, not a failure, and it must
        // not fall back to mock data — falling back would show the role
        // exactly what it was just refused.
        if (error) {
          const body = (error as { context?: { body?: unknown } }).context?.body
          const refusal = parseRefusal(body)
          if (refusal) {
            setResult({ state: 'refused', data: null, reason: refusal })
            return
          }
          setResult({ state: 'mock', data: null, reason: 'The record could not be reached.' })
          return
        }

        if (data && data.permitted === false) {
          setResult({ state: 'refused', data: null, reason: String(data.reason ?? 'Not permitted.') })
          return
        }

        setResult({ state: 'live', data: (data?.data ?? null) as T, reason: null })
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ state: 'mock', data: null, reason: 'The record could not be reached.' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [resource, role, option?.personId, patientId])

  return result
}

/** The refusal body can arrive as a string, a stream, or already parsed. */
function parseRefusal(body: unknown): string | null {
  if (!body) return null
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : (body as Record<string, unknown>)
    if (parsed && parsed.permitted === false && typeof parsed.reason === 'string') return parsed.reason
  } catch {
    return null
  }
  return null
}
