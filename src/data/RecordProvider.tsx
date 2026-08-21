import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { hydrate, recordNote, recordSource } from './hydrate'

/**
 * Loads the live record without making anyone wait on a blank page.
 *
 * The first attempt at this blocked the first render until the backend
 * answered, which meant up to four seconds of white screen when it was slow —
 * the single worst thing this interface could do to someone who is already
 * finding the day expensive. So the prototype record renders immediately, the
 * fetch runs behind it, and the screen fills in when it lands.
 *
 * The swap is a single re-render of already-laid-out screens, not a spinner
 * becoming content, so nothing jumps position. Until it lands, every screen
 * says it is showing demonstration data.
 */
type Status = 'loading' | 'live' | 'mock'

const RecordContext = createContext<{ status: Status; note: string | null }>({
  status: 'mock',
  note: null,
})

/** Survives StrictMode's deliberate double-invoke of effects. */
let started = false

export function RecordProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() =>
    typeof window === 'undefined' ? 'mock' : 'loading',
  )

  useEffect(() => {
    if (started) {
      setStatus(recordSource)
      return
    }
    started = true

    let cancelled = false
    hydrate(3000).then((result) => {
      if (!cancelled) setStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({ status, note: status === 'mock' ? recordNote : null }),
    [status],
  )

  return <RecordContext.Provider value={value}>{children}</RecordContext.Provider>
}

export function useRecordStatus() {
  return useContext(RecordContext)
}
