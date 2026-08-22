import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSession } from './session'

/**
 * How well this person already knows ORCA.
 *
 * The whole design brief for this system is that it should get *simpler* the
 * longer someone uses it, which is the opposite of what software normally
 * does. Normally the first screen is spare and every subsequent release adds
 * another button to it. Here the first screen explains itself and the tenth
 * one has stopped, because by then the explanations are just furniture the
 * person has learned to read past.
 *
 * Three levels, derived rather than chosen:
 *
 *   1 · Learning   — first few visits. Headings carry a line of explanation,
 *                    the getting-started list is on screen, nothing is
 *                    assumed.
 *   2 · Settled    — the explanations retire. What this person actually does
 *                    starts being offered before they go looking for it.
 *   3 · Fluent     — shortcuts up front, prose trimmed to its content. At this
 *                    point the interface's job is to get out of the way.
 *
 * It is derived from visits and actions rather than asked, because "how
 * experienced are you?" is a question people answer wrongly in both
 * directions. But it is never a trapdoor: the level is visible in display
 * settings and can be pinned, since someone returning after three months in
 * hospital may want the level 1 interface back and should not have to earn it
 * by forgetting things.
 *
 * Counting happens per person, in this browser. It is a preference, not a
 * behavioural record, and it never leaves the device — a system whose entire
 * argument is about consent should not quietly build a usage profile on the
 * server to decide how chatty to be.
 */

export type Level = 1 | 2 | 3
export type Verbosity = 'detailed' | 'concise'

interface Stored {
  visits: number
  actions: Record<string, number>
  verbosity: Verbosity | null
  /** Set only if the person overrode the derived level themselves. */
  pinned: Level | null
}

interface MaturityValue {
  level: Level
  visits: number
  verbosity: Verbosity
  setVerbosity: (v: Verbosity) => void
  pinLevel: (l: Level | null) => void
  pinned: Level | null
  /** Count something the person did, so it can be offered sooner next time. */
  record: (action: string) => void
  /** Has this person ever done this? Drives the getting-started list. */
  hasDone: (action: string) => boolean
  /** The things they reach for most, most-used first. */
  frequent: (limit?: number) => string[]
  /** Level 1 only: a line of explanation under a heading. */
  showHelp: boolean
  /** Level 3 only: shortcuts before content. */
  showShortcuts: boolean
  reset: () => void
}

const EMPTY: Stored = { visits: 0, actions: {}, verbosity: null, pinned: null }

const MaturityContext = createContext<MaturityValue | null>(null)

const key = (personId: string) => `orca.maturity.${personId}`

function load(personId: string): Stored {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(key(personId))
    if (!raw) return EMPTY
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Stored>) }
  } catch {
    return EMPTY
  }
}

function save(personId: string, state: Stored) {
  try {
    window.localStorage.setItem(key(personId), JSON.stringify(state))
  } catch {
    /* Private browsing. The level just stays where it is for this session. */
  }
}

function levelFor(visits: number, pinned: Level | null): Level {
  if (pinned) return pinned
  if (visits < 3) return 1
  if (visits < 10) return 2
  return 3
}

export function MaturityProvider({
  personId,
  children,
}: {
  personId: string | null
  children: ReactNode
}) {
  const id = personId ?? 'anonymous'
  const [state, setState] = useState<Stored>(() => load(id))
  // Which person this mount has already counted. StrictMode runs effects
  // twice in development, and a visit counter that double-counts would walk
  // someone through the levels at twice the intended pace.
  const counted = useRef<string | null>(null)

  // A sign-in is a visit. Counted once per person per mount rather than per
  // navigation, so opening six pages in one sitting does not fast-forward
  // someone past the explanations they were still reading.
  useEffect(() => {
    if (counted.current === id) return
    counted.current = id
    setState(() => {
      const fresh = load(id)
      const next = { ...fresh, visits: fresh.visits + 1 }
      save(id, next)
      return next
    })
  }, [id])

  const update = useCallback(
    (change: (s: Stored) => Stored) => {
      setState((current) => {
        const next = change(current)
        save(id, next)
        return next
      })
    },
    [id],
  )

  const value = useMemo<MaturityValue>(() => {
    const level = levelFor(state.visits, state.pinned)
    return {
      level,
      visits: state.visits,
      // Concise is offered, never imposed: it is suggested once someone is
      // clearly fluent, and stays detailed until they say otherwise.
      verbosity: state.verbosity ?? (level === 3 ? 'concise' : 'detailed'),
      setVerbosity: (v) => update((s) => ({ ...s, verbosity: v })),
      pinLevel: (l) => update((s) => ({ ...s, pinned: l })),
      pinned: state.pinned,
      record: (action) =>
        update((s) => ({ ...s, actions: { ...s.actions, [action]: (s.actions[action] ?? 0) + 1 } })),
      hasDone: (action) => (state.actions[action] ?? 0) > 0,
      frequent: (limit = 4) =>
        Object.entries(state.actions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([action]) => action),
      showHelp: level === 1,
      showShortcuts: level >= 2,
      reset: () => update(() => ({ ...EMPTY })),
    }
  }, [state, update])

  return <MaturityContext.Provider value={value}>{children}</MaturityContext.Provider>
}

export function useMaturity(): MaturityValue {
  const value = useContext(MaturityContext)
  if (!value) throw new Error('useMaturity must be used inside MaturityProvider')
  return value
}

/**
 * Wired to whoever is signed in.
 *
 * Kept here rather than in the app root so that the root does not have to know
 * that experience level is a per-person thing. Signing out and back in as
 * someone else swaps the counters, which is the correct behaviour and also
 * the only way the prototype can show all three levels at once.
 */
export function MaturityBridge({ children }: { children: ReactNode }) {
  const { option } = useSession()
  return <MaturityProvider personId={option?.personId ?? null}>{children}</MaturityProvider>
}
