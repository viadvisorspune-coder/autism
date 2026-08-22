import { Link } from 'react-router-dom'
import { Card, CardBody } from './ui'
import { useMaturity } from '../state/maturity'
import { useSession } from '../state/session'
import { useLive } from '../lib/live'
import type { ConversationData } from '../lib/live'
import { connections, strategiesFor } from '../data/db'

/**
 * The first week.
 *
 * Checklists in software are usually a growth tactic dressed as help: five
 * tasks that benefit the product, a progress ring, and a nag that persists
 * long after it stopped being useful. This one has to survive a harder test,
 * because the person reading it may already be at capacity, and a list of
 * homework is a bad thing to hand someone in that state.
 *
 * So it holds three rules:
 *
 *   · Every item is ticked by something real. Not "you clicked the tour" but
 *     "there is a message in your record", "a connection exists", "a strategy
 *     has a check-in". You cannot complete this list without the product
 *     actually having become useful to you.
 *   · It disappears for good once it is done, and it can be dismissed before
 *     that. It never comes back.
 *   · Nothing in it is urgent, and it says so. It sits below the work stream,
 *     because a real decision waiting on somebody outranks a suggestion that
 *     you get to know the software.
 *
 * Only at level 1 — once ORCA is familiar, the list is furniture.
 */

interface Item {
  id: string
  label: string
  detail: string
  to: string
  done: boolean
}

export function GettingStarted({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const { level, hasDone, record } = useMaturity()
  const { data } = useLive<ConversationData>('conversation', patientId, 20000)

  if (level > 1 || hasDone('dismissed:getting-started')) return null
  if (role !== 'patient') return null

  const saidSomething = (data?.messages ?? []).some((m) => m.author === 'person')
  const strategies = strategiesFor(patientId)
  const connected = connections.filter((c) => c.patientId === patientId && c.consentStatus === 'Active')

  const items: Item[] = [
    {
      id: 'say',
      label: 'Tell ORCA something in your own words',
      detail: 'Anything at all. It is the only step the rest of this depends on.',
      to: '/patient/guide',
      done: saidSomething,
    },
    {
      id: 'profile',
      label: 'Read what ORCA thinks it understands about you',
      detail: 'And correct it. Nothing there is fixed, and nothing was written without a source.',
      to: '/patient/profile',
      done: hasDone('visit:profile'),
    },
    {
      id: 'privacy',
      label: 'Check who can see your record',
      detail: connected.length
        ? `${connected.length} people currently have access, each to a named part of it.`
        : 'Nobody has access yet.',
      to: '/patient/privacy',
      done: hasDone('visit:privacy'),
    },
    {
      id: 'strategy',
      label: 'Try one thing and say whether it helped',
      detail: 'A strategy with no check-ins cannot tell you anything at its review.',
      to: '/patient/support',
      done: strategies.some((s) => s.checkIns.length > 0),
    },
  ]

  const done = items.filter((i) => i.done).length
  if (done === items.length) return null

  return (
    <Card className="mb-8">
      <CardBody>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[0.95rem] font-semibold text-ink">Getting started</h2>
          <span className="text-[0.79rem] text-muted">
            {done} of {items.length}
          </span>
        </div>
        <p className="mb-4 text-[0.84rem] leading-relaxed text-muted">
          None of this is urgent and none of it expires. It is here for your first week or so, and
          then it goes away.
        </p>

        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] ${
                  item.done ? 'bg-state-good text-white' : 'bg-surface-2 text-transparent'
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                {item.done ? (
                  <span className="text-[0.89rem] font-medium text-muted line-through">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className="text-[0.89rem] font-medium text-ink hover:underline"
                  >
                    {item.label}
                  </Link>
                )}
                <span className="block text-[0.83rem] leading-relaxed text-ink-2">
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <button
          onClick={() => record('dismissed:getting-started')}
          className="mt-4 text-[0.82rem] text-muted underline-offset-2 hover:text-ink-2 hover:underline"
        >
          Hide this — I will find my way around
        </button>
        {option ? null : null}
      </CardBody>
    </Card>
  )
}
