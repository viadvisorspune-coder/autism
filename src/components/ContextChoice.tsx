import { useCallback, useEffect, useState } from 'react'
import { requestsFor, strategiesFor, eventsFor } from '../data/db'
import type { WorkflowStatus } from '../data/types'

/** Finished, one way or the other. Everything else is still live context. */
const SETTLED = new Set<WorkflowStatus>(['Completed', 'Cancelled'])

/**
 * "Don't make me tell my story again."
 *
 * The single most exhausting thing about post-diagnostic care is repeating
 * yourself — to a new clinician, a new employer, a new form, and then to the
 * software that was meant to help. ORCA already holds four months of this
 * person's record, so opening a conversation by asking them to summarise it
 * would be a strange thing to do.
 *
 * But the opposite default is not obviously right either. Sometimes the thing
 * happening today has nothing to do with what happened in June, and dragging
 * it all in makes the answer worse. Sometimes a person simply does not want to
 * be answered as their history.
 *
 * So it is asked once per session, and the answer does something real. Choosing
 * to carry context appends a recap — assembled from the record, and named in
 * full on screen — to what gets sent. Choosing to start fresh sends exactly
 * what was typed and folds the old thread away. Neither choice deletes
 * anything: "start fresh" is about this conversation, not about the record,
 * and saying so matters when the person choosing it has spent years being told
 * that asking for a clean slate means losing their history.
 */

export type ContextMode = 'previous' | 'fresh'

const key = (patientId: string) => `orca.context.${patientId}`

export function useContextMode(patientId: string) {
  const [mode, setMode] = useState<ContextMode | null>(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(key(patientId))
      if (stored === 'previous' || stored === 'fresh') setMode(stored)
    } catch {
      /* Private browsing. The question just gets asked again. */
    }
  }, [patientId])

  const choose = useCallback(
    (next: ContextMode) => {
      setMode(next)
      try {
        sessionStorage.setItem(key(patientId), next)
      } catch {
        /* Nothing to do; the choice still holds for this render. */
      }
    },
    [patientId],
  )

  return { mode, choose }
}

/* --------------------------------------------------------------- the recap */

export interface Recap {
  lines: string[]
  /** What actually gets attached to the message, or null if there is nothing. */
  preamble: string | null
}

/**
 * What "my previous context" concretely means, in this record, today.
 *
 * Built from open things rather than everything: an active strategy is context
 * for a conversation happening now, a strategy that finished in June is
 * history. Listed on screen exactly as it is sent, because a recap the person
 * cannot read is a summary of them written behind their back.
 */
export function recapFor(patientId: string, recentMessages: string[] = []): Recap {
  const strategies = strategiesFor(patientId).filter((s) => s.status === 'Active')
  const open = requestsFor(patientId).filter((r) => !SETTLED.has(r.status))
  const recent = eventsFor(patientId).slice(0, 2)

  const lines: string[] = []
  strategies.forEach((s) => lines.push(`Currently trying: ${s.title} — ${s.goal}`))
  open.forEach((r) => lines.push(`Open request: ${r.title}, with ${r.currentOwner}`))
  recent.forEach((e) => lines.push(`Recently recorded: ${e.title}`))
  recentMessages.slice(-2).forEach((m) => lines.push(`Last said: ${truncate(m, 120)}`))

  if (!lines.length) return { lines, preamble: null }

  return {
    lines,
    preamble: `[Context already in the record, included at the person's request:\n${lines
      .map((l) => `- ${l}`)
      .join('\n')}]\n\n`,
  }
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/* ------------------------------------------------------------------- the ask */

export function ContextChoice({
  patientId,
  onChoose,
  recentMessages = [],
}: {
  patientId: string
  onChoose: (mode: ContextMode) => void
  recentMessages?: string[]
}) {
  const [showing, setShowing] = useState(false)
  const recap = recapFor(patientId, recentMessages)

  return (
    <div className="frost-tint mb-5 rounded-[26px] px-5 py-4">
      <p className="text-[0.95rem] font-medium text-ink">
        You have talked to ORCA before. Should it use what it already knows?
      </p>
      <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-2">
        You do not have to explain your situation again. If today is not about any of that, it can
        set it aside instead — that only affects this conversation, and nothing is deleted either
        way.
      </p>

      {recap.lines.length ? (
        <div className="mt-3">
          <button
            onClick={() => setShowing((v) => !v)}
            aria-expanded={showing}
            className="text-[0.8rem] text-muted underline-offset-2 hover:text-ink-2 hover:underline"
          >
            {showing ? 'Hide what it would use' : `See exactly what it would use (${recap.lines.length})`}
          </button>
          {showing ? (
            <ul className="mt-2 space-y-1 rounded-[20px]  border-line bg-canvas px-4 py-3">
              {recap.lines.map((l) => (
                <li key={l} className="text-[0.82rem] leading-relaxed text-ink-2">
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onChoose('previous')}
          className="rounded-2xl bg-brand px-4 py-2 text-[0.87rem] font-medium text-white hover:bg-brand-ink"
        >
          Use my previous context
        </button>
        <button
          onClick={() => onChoose('fresh')}
          className="rounded-2xl  bg-surface-2 px-4 py-2 text-[0.87rem] font-medium text-ink hover:bg-surface-2"
        >
          Start fresh
        </button>
      </div>
    </div>
  )
}

/** Once chosen, one quiet line that says which it is and lets you change it. */
export function ContextBanner({
  mode,
  count,
  onChange,
}: {
  mode: ContextMode
  count: number
  onChange: () => void
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px]  border-line bg-canvas px-4 py-2.5">
      <p className="text-[0.83rem] leading-relaxed text-ink-2">
        {mode === 'previous'
          ? `Using what you have already told ORCA — ${count} item${count === 1 ? '' : 's'} from your record.`
          : 'Starting fresh. Your record is untouched; it is just not being brought into this conversation.'}
      </p>
      <button
        onClick={onChange}
        className="shrink-0 text-[0.82rem] font-medium text-brand underline-offset-2 hover:underline"
      >
        {mode === 'previous' ? 'Start fresh instead' : 'Use my previous context'}
      </button>
    </div>
  )
}
