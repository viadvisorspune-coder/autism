import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, Section, StatusPill, formatDate } from './ui'
import { useLive } from '../lib/live'
import { useSession } from '../state/session'
import { appointmentsFor, personName, requestsFor } from '../data/db'

/**
 * What matters, in the order it matters.
 *
 * Every role's home screen answers the same three questions, and they are
 * always in the same order and always in the same place:
 *
 *   1. What is waiting on me?      — nothing moves until I act
 *   2. What is waiting on someone? — in flight, and I am not the hold-up
 *   3. What is coming up?          — soon, but not yet
 *
 * The order is urgency, and the first band is the only one that is ever a
 * demand. That distinction is the whole design: a screen that presents an
 * appointment next month with the same weight as a decision somebody is
 * blocked on has sorted by category instead of by cost, and left the reader to
 * work out which is which.
 *
 * Band one is never collapsed, whatever the density preference says. Bands two
 * and three fold away in calm mode with their counts visible, because "three
 * things are in progress and none of them need you" is information a person
 * can act on without reading the list.
 */

interface Review {
  id: string
  title: string
  reason: string
  assigned_to: string[]
  status: string
  raised_on: string
  decided_by: string | null
  decision: string | null
}

interface AccessRequest {
  id: string
  requested_by: string
  requested_role: string
  purpose: string
  status: string
}

interface InboxData {
  reviews: Review[]
  access_requests: AccessRequest[]
  people: Record<string, { name: string }>
}

const OPEN = new Set(['Awaiting approval', 'Awaiting professional review'])

export function PriorityStack({
  patientId = 'pt-ananya',
  extra,
  extraCount = 0,
}: {
  patientId?: string
  /** A screen's own urgent rows, folded into band one rather than competing
   *  with it. Two headings both meaning "urgent" is the flaw this exists to
   *  fix, so a screen with its own list hands it over instead of drawing it. */
  extra?: ReactNode
  extraCount?: number
}) {
  const { role } = useSession()
  const { data } = useLive<InboxData>('inbox', patientId)

  const reviews = data?.reviews ?? []
  const access = (data?.access_requests ?? []).filter((r) => r.status === 'Pending')

  const forMe = reviews.filter((r) => OPEN.has(r.status) && r.assigned_to.includes(role ?? ''))
  const forOthers = reviews.filter((r) => OPEN.has(r.status) && !r.assigned_to.includes(role ?? ''))

  // Requests where the other side has asked a question nobody has answered.
  const requests = requestsFor(patientId)
  const unanswered = requests.filter((r) => r.clarifications.some((c) => !c.answer))
  const inFlight = requests.filter((r) => r.status === 'Awaiting stakeholder')

  const appointments = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')

  const needsMe = forMe.length + (role === 'patient' ? access.length : 0) + unanswered.length + extraCount
  const elsewhere = forOthers.length + inFlight.length

  if (!needsMe && !elsewhere && !appointments.length) return null

  return (
    <div className="mb-8">
      {/* ---------------------------------------------------- band one */}
      {needsMe > 0 ? (
        <div className="mb-6">
          <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
            Needs you {needsMe > 1 ? `· ${needsMe} things` : ''}
          </h2>
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {role === 'patient'
                  ? access.map((r) => (
                      <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                        <p className="text-[0.9rem] font-medium text-ink">
                          {data?.people?.[r.requested_by]?.name ?? personName(r.requested_by)} has
                          asked to see your record
                        </p>
                        <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">{r.purpose}</p>
                        <Link
                          to="/patient/requests"
                          className="mt-1.5 inline-block text-[0.83rem] font-medium text-brand hover:underline"
                        >
                          Decide this
                        </Link>
                      </li>
                    ))
                  : null}

                {forMe.map((r) => (
                  <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[0.9rem] font-medium text-ink">{r.title}</p>
                      <StatusPill status={r.status as never} />
                    </div>
                    <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">{r.reason}</p>
                    <p className="mt-1 text-[0.79rem] text-muted">
                      Raised {formatDate(r.raised_on)} · nothing moves until you decide
                    </p>
                  </li>
                ))}

                {unanswered.map((r) => (
                  <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-[0.9rem] font-medium text-ink">{r.title}</p>
                    <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">
                      {r.destination} asked a question that has not been answered.
                    </p>
                    <Link
                      to={`/patient/requests/${r.id}`}
                      className="mt-1.5 inline-block text-[0.83rem] font-medium text-brand hover:underline"
                    >
                      Read it
                    </Link>
                  </li>
                ))}
              </ul>
              {extra ? <div className="mt-3 space-y-3">{extra}</div> : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* ---------------------------------------------------- band two */}
      {elsewhere > 0 ? (
        <Section
          title="Waiting on someone else"
          count={elsewhere}
          summary={
            forOthers.length
              ? `With ${forOthers[0].assigned_to.join(' or ')} and ${inFlight.length ? 'others' : 'nobody else'}. Nothing here needs you.`
              : `${inFlight.length} in progress elsewhere. Nothing here needs you.`
          }
        >
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {forOthers.map((r) => (
                  <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-[0.88rem] font-medium text-ink">{r.title}</p>
                    <p className="text-[0.82rem] text-muted">
                      With {r.assigned_to.join(' or ')} since {formatDate(r.raised_on)}
                    </p>
                  </li>
                ))}
                {inFlight.map((r) => (
                  <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-[0.88rem] font-medium text-ink">{r.title}</p>
                    <p className="text-[0.82rem] text-muted">With {r.currentOwner}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      ) : null}

      {/* -------------------------------------------------- band three */}
      {appointments.length > 0 ? (
        <Section
          title="Coming up"
          count={appointments.length}
          summary={`Next: ${appointments[0].purpose}, ${formatDate(appointments[0].datetime.slice(0, 10))}.`}
        >
          <Card>
            <CardBody>
              <ul className="space-y-3">
                {appointments.map((a) => (
                  <li key={a.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-[0.88rem] font-medium text-ink">{a.purpose}</p>
                    <p className="text-[0.82rem] text-muted">
                      {personName(a.professionalId)} · {formatDate(a.datetime.slice(0, 10))} ·{' '}
                      {a.preparationStatus}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      ) : null}
    </div>
  )
}
