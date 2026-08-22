import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui'
import { useLive } from '../lib/live'
import { useSession } from '../state/session'

/**
 * Something has just arrived that needs you.
 *
 * Deliberately not a modal. A dialog that seizes the screen interrupts whatever
 * someone was in the middle of and, for a person who finds unexpected changes
 * expensive, costs more than the notice is worth — the same argument that put
 * advance notice in Ananya's record in the first place. Building the opposite
 * into her software would be an odd thing to do.
 *
 * So it is prominent and immediate but never blocking: it does not take focus,
 * nothing behind it is disabled, Escape dismisses it, and it stays until it is
 * dealt with rather than vanishing on a timer. Nobody has to catch it.
 *
 * It only fires for things assigned to the person reading, and only for things
 * that arrived after this session started — signing in should not replay every
 * decision made while you were away. That is what the record is for.
 */

interface Review {
  id: string
  title: string
  reason: string
  assigned_to: string[]
  status: string
}

interface AccessRequest {
  id: string
  requested_by: string
  purpose: string
  status: string
}

interface InboxData {
  reviews: Review[]
  access_requests: AccessRequest[]
  people: Record<string, { name: string }>
}

interface Arrival {
  id: string
  title: string
  detail: string
}

const OPEN = new Set(['Awaiting approval', 'Awaiting professional review'])

export function ArrivalAlert({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const navigate = useNavigate()
  const { data } = useLive<InboxData>('inbox', patientId)

  const [queue, setQueue] = useState<Arrival[]>([])
  const known = useRef<Set<string> | null>(null)
  const dismissed = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!data) return

    const mine: Arrival[] = []

    data.reviews
      .filter((r) => OPEN.has(r.status) && r.assigned_to.includes(role ?? ''))
      .forEach((r) => mine.push({ id: r.id, title: r.title, detail: r.reason }))

    if (role === 'patient') {
      data.access_requests
        .filter((r) => r.status === 'Pending')
        .forEach((r) =>
          mine.push({
            id: r.id,
            title: `${data.people?.[r.requested_by]?.name ?? 'Someone'} has asked to see your record`,
            detail: r.purpose,
          }),
        )
    }

    // The first poll establishes what was already there. Everything after it is
    // genuinely new, which is the only kind of thing worth interrupting for.
    if (known.current === null) {
      known.current = new Set(mine.map((m) => m.id))
      return
    }

    const arrived = mine.filter((m) => !known.current!.has(m.id) && !dismissed.current.has(m.id))
    if (arrived.length) {
      arrived.forEach((m) => known.current!.add(m.id))
      setQueue((q) => [...q, ...arrived.filter((a) => !q.some((existing) => existing.id === a.id))])
    }
  }, [data, role, option?.personId])

  const current = queue[0]

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  if (!current) return null

  function dismiss() {
    if (!current) return
    dismissed.current.add(current.id)
    setQueue((q) => q.slice(1))
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-40 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[12px] border border-state-wait/40 bg-surface p-4 shadow-xl sm:left-auto sm:right-5 sm:translate-x-0"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[0.74rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
          Needs you now
        </p>
        {queue.length > 1 ? (
          <span className="text-[0.75rem] text-muted">{queue.length} waiting</span>
        ) : null}
      </div>

      <p className="text-[0.92rem] font-medium leading-snug text-ink">{current.title}</p>
      <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-2">{current.detail}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            const to = option?.home ?? '/'
            dismiss()
            navigate(to)
          }}
        >
          Open it
        </Button>
        <Button variant="quiet" onClick={dismiss}>
          Not now
        </Button>
      </div>

      <p className="mt-2 text-[0.76rem] leading-relaxed text-muted">
        Nothing happens until you decide, and this will still be waiting if you close it.
      </p>
    </div>
  )
}
