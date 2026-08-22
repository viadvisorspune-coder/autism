import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, CardBody, Section, formatDate } from './ui'
import { actOnRecord, useLive } from '../lib/live'
import { useSession } from '../state/session'
import { useUI } from '../state/ui'
import { appointmentsFor, personName, requestsFor } from '../data/db'

/**
 * Everything in flight, in one list.
 *
 * The earlier version split this into "needs you" and "waiting on someone
 * else", which sounds like two sections and is actually one fact stated twice:
 * whose turn it is. Splitting by that fact means the same item is described in
 * two places depending on the answer, and a person scanning for their own work
 * has to read both headings to be sure.
 *
 * So it is one stream, sorted so your turn comes first, and each row says whose
 * turn it is on the row itself. "With Dr Kavita" is not a task — it is the
 * absence of one, which is worth showing precisely because someone wondering
 * where a thing has got to would otherwise go looking.
 *
 * Coming up stays separate. A dated thing that has not arrived yet is not in
 * flight, and putting it in the same list would be the mistake this component
 * exists to avoid.
 */

interface Review {
  id: string
  title: string
  reason: string
  assigned_to: string[]
  status: string
  raised_on: string
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

interface Row {
  key: string
  title: string
  detail: string
  /** Null when it is this person's turn. Otherwise who it is with. */
  with: string | null
  since?: string
  href?: string
  actions?: { label: string; run: () => void; primary?: boolean }[]
}

const OPEN = new Set(['Awaiting approval', 'Awaiting professional review'])

export function WorkStream({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const { say } = useUI()
  const { data, refresh } = useLive<InboxData>('inbox', patientId)
  const [busy, setBusy] = useState<string | null>(null)

  const reviews = data?.reviews ?? []
  const access = (data?.access_requests ?? []).filter((r) => r.status === 'Pending')
  const nameOf = (id: string) => data?.people?.[id]?.name ?? personName(id)

  async function decide(id: string, decision: string) {
    setBusy(id)
    const result = await actOnRecord('decide_review', patientId, option?.personId ?? '', {
      review_id: id,
      decision,
    })
    setBusy(null)
    say(result.ok ? `Recorded: ${decision}.` : (result.error ?? 'That could not be saved.'))
    if (result.ok) refresh()
  }

  async function decideAccess(id: string, approve: boolean) {
    setBusy(id)
    const result = await actOnRecord('decide_access_request', patientId, option?.personId ?? '', {
      request_id: id,
      approve,
    })
    setBusy(null)
    say(result.ok ? (approve ? 'Access given.' : 'Declined. Nothing was shared.') : (result.error ?? 'Not saved.'))
    if (result.ok) refresh()
  }

  const rows: Row[] = []

  if (role === 'patient') {
    access.forEach((r) =>
      rows.push({
        key: r.id,
        title: `${nameOf(r.requested_by)} has asked to see your record`,
        detail: r.purpose,
        with: null,
        actions: [
          { label: 'Give access', run: () => decideAccess(r.id, true), primary: true },
          { label: 'Not now', run: () => decideAccess(r.id, false) },
        ],
      }),
    )
  }

  reviews
    .filter((r) => OPEN.has(r.status))
    .forEach((r) => {
      const mine = r.assigned_to.includes(role ?? '')
      rows.push({
        key: r.id,
        title: r.title,
        detail: r.reason,
        with: mine ? null : r.assigned_to.join(' or '),
        since: r.raised_on,
        actions: mine
          ? [
              { label: 'Approve', run: () => decide(r.id, 'Approved'), primary: true },
              { label: 'Approve with changes', run: () => decide(r.id, 'Approved with changes') },
              { label: 'Decline', run: () => decide(r.id, 'Declined') },
            ]
          : undefined,
      })
    })

  // One row per request, never two. A request with an unanswered question is
  // your turn; the same request also being with an employer is the same fact
  // from the other side, and showing both is how the old layout managed to
  // list one thing twice and call it two pieces of work.
  requestsFor(patientId).forEach((r) => {
    const unanswered = r.clarifications.some((c) => !c.answer)
    const inFlight = r.status === 'Awaiting stakeholder'
    if (!unanswered && !inFlight) return

    rows.push({
      key: `r-${r.id}`,
      title: r.title,
      detail: unanswered
        ? `${r.destination} asked a question that has not been answered.`
        : r.requestedAdjustment,
      with: unanswered ? null : r.currentOwner,
      since: r.raised,
      href: unanswered ? `/patient/requests/${r.id}` : undefined,
    })
  })

  // Your turn first. Within each half, oldest first: a thing that has been
  // waiting longest is the thing most likely to have been forgotten.
  rows.sort((a, b) => {
    if (!a.with !== !b.with) return a.with ? 1 : -1
    return (a.since ?? '').localeCompare(b.since ?? '')
  })

  const yours = rows.filter((r) => !r.with).length
  const appointments = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')

  if (!rows.length && !appointments.length) return null

  return (
    <div className="mb-8">
      {rows.length > 0 ? (
        <>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
              In flight
            </h2>
            <p className="text-[0.8rem] text-muted">
              {yours > 0
                ? `${yours} ${yours === 1 ? 'needs' : 'need'} you · ${rows.length - yours} with someone else`
                : 'Nothing needs you right now'}
            </p>
          </div>

          <Card className="mb-6">
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.92rem] font-medium text-ink">{r.title}</p>
                        <p className="mt-0.5 text-[0.85rem] leading-relaxed text-ink-2">{r.detail}</p>
                        {r.since ? (
                          <p className="mt-1 text-[0.78rem] text-muted">Since {formatDate(r.since)}</p>
                        ) : null}
                      </div>
                      <TurnChip with={r.with} />
                    </div>

                    {r.actions ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.actions.map((a) => (
                          <Button
                            key={a.label}
                            variant={a.primary ? 'primary' : 'quiet'}
                            disabled={busy === r.key}
                            onClick={a.run}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    ) : r.href ? (
                      <Link
                        to={r.href}
                        className="mt-2 inline-block text-[0.84rem] font-medium text-brand hover:underline"
                      >
                        Open it
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </>
      ) : null}

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

/**
 * Whose turn it is, on the row rather than in a heading.
 *
 * "Your turn" earns colour because it is the only thing here that is a demand.
 * Everything else is stated quietly, because a person reading a row that is not
 * theirs should be able to tell that in one glance and move on.
 */
function TurnChip({ with: withWhom }: { with: string | null }) {
  if (!withWhom) {
    return (
      <span className="shrink-0 rounded-full bg-state-wait-tint px-2.5 py-1 text-[0.74rem] font-medium text-state-wait">
        Your turn
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.74rem] text-muted">
      With {withWhom}
    </span>
  )
}

/** Kept so existing imports do not break while screens are converted. */
export const PriorityStack = WorkStream
