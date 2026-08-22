import { useCallback, useEffect, useState } from 'react'

/**
 * Never lose what someone has written.
 *
 * Half-written text is the most expensive thing on any of these screens. It
 * costs more to produce than anything else the interface asks for — a person
 * describing a bad week at work is doing real work to find the words — and
 * every ordinary accident destroys it: a closed tab, a phone that rings, a
 * back button, a session that expires while they are thinking.
 *
 * So every composer keeps its draft on the device as it is typed, and finds it
 * again on return. Local storage rather than the record, deliberately: an
 * unfinished sentence about a bad day is not a fact about somebody, and
 * writing it to a shared record before they chose to send it would be exactly
 * the thing this system promises not to do.
 *
 * `clear()` on a successful send, and only then.
 */
export function useDraft(key: string, initial = '') {
  const storageKey = `orca.draft.${key}`

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial
    try {
      return window.localStorage.getItem(storageKey) ?? initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      if (value) window.localStorage.setItem(storageKey, value)
      else window.localStorage.removeItem(storageKey)
    } catch {
      /* Private browsing. It still holds for as long as the page is open. */
    }
  }, [storageKey, value])

  const clear = useCallback(() => {
    setValue('')
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* Nothing to clean up. */
    }
  }, [storageKey])

  /** True when the text on screen was recovered rather than typed just now. */
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      setRestored(Boolean(window.localStorage.getItem(storageKey)))
    } catch {
      setRestored(false)
    }
    // Only on mount: after that, anything present was typed in this sitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { value, setValue, clear, restored }
}
