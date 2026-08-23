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
    // Three seconds was measured against a warm function. A Supabase Edge
    // Function that has not been called for a while takes longer than that to
    // start, so the first visit of the morning fell back to example data and
    // told the person their own record had not answered — which is both wrong
    // and alarming. Ten seconds, and one retry, because being slow once is a
    // far smaller problem than showing somebody a record that is not theirs.
    hydrate(10000)
      .then((result) => (result === 'mock' && !cancelled ? hydrate(10000) : result))
      .then((result) => {
        if (!cancelled) setStatus(result)
      })

    /**
     * And again, quietly, while the tab is open.
     *
     * Loading once at boot was right when one person read their own record.
     * It stopped being right the moment other people could write to it: a
     * psychologist adds a session note at 10:04 and, until this, ORCA could
     * not answer a question about it until the patient reloaded the page.
     * Between them the record was two records.
     *
     * A minute is chosen against what actually happens on the other side of
     * this: somebody writing up a session takes minutes, not seconds, so
     * polling faster would mostly re-fetch a record nobody had touched. It
     * pauses on a hidden tab for the same reason the live polls do — a
     * background tab pulling the whole record every minute is a battery cost
     * nobody agreed to.
     *
     * Nothing re-renders on its own. Screens read these arrays when they
     * render and ORCA reads them when it answers, which is the moment that
     * matters: the answer is built from whatever the last refresh brought in.
     */
    const timer = window.setInterval(() => {
      if (cancelled || document.visibilityState !== 'visible') return
      void hydrate(10000).then((result) => {
        if (!cancelled) setStatus(result)
      })
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
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
