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

type Kind = 'share' | 'access' | 'stopped' | 'authority' | 'question' | 'other'

/**
 * How much is at stake, so the list can lead with it.
 *
 * Information leaving the record is the only irreversible thing here. Once it
 * has gone to an employer it has gone, and no later decision takes it back.
 * Everything else can be revisited.
 */
const WEIGHT: Record<Kind, number> = {
  share: 0,
  access: 1,
  question: 2,
  authority: 3,
  stopped: 4,
  other: 5,
}

interface Row {
  key: string
  kind: Kind
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
  const [expanded, setExpanded] = useState(false)

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
        kind: 'access',
        title: `${nameOf(r.requested_by)} wants to see part of your record`,
        detail: r.purpose,
        with: null,
        actions: [
          { label: 'Give access', run: () => decideAccess(r.id, true), primary: true },
          { label: 'Not now', run: () => decideAccess(r.id, false) },
        ],
      }),
    )
  }

  // Deduped before anything else. The policy layer raises one review per
  // proposed action, so asking ORCA the same thing four times produces four
  // rows that are word-for-word identical. Seven of those is not seven
  // decisions; it is one decision printed seven times, and it is why the page
  // felt like a pile rather than a list.
  const distinct = new Map<string, { review: Review; count: number }>()
  reviews
    .filter((r) => OPEN.has(r.status))
    .forEach((r) => {
      const key = `${r.title}|${r.reason}`
      const seen = distinct.get(key)
      if (seen) seen.count += 1
      else distinct.set(key, { review: r, count: 1 })
    })

  distinct.forEach(({ review: r, count }) => {
    const mine = r.assigned_to.includes(role ?? '')
    const shape = classify(r, role ?? '')

    rows.push({
      key: r.id,
      kind: shape.kind,
      title: count > 1 ? `${shape.title} (${count} times)` : shape.title,
      detail: shape.detail,
      with: shape.yours && mine ? null : shape.withWhom ?? r.assigned_to.join(' or '),
      since: r.raised_on,
      actions:
        shape.yours && mine
          ? shape.choices.map((c, i) => ({
              label: c.label,
              run: () => decide(r.id, c.decision),
              primary: i === 0,
            }))
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
      kind: 'question',
      title: r.title,
      detail: unanswered
        ? `${r.destination} asked a question that has not been answered.`
        : r.requestedAdjustment,
      with: unanswered ? null : r.currentOwner,
      since: r.raised,
      href: unanswered ? `/patient/requests/${r.id}` : undefined,
    })
  })

  // Consequence first, then whose turn, then age. The old sort put "your
  // turn" above everything, which is right until seven things are all your
  // turn — at which point it says nothing and the one that matters is
  // wherever it happens to fall.: a thing that has been
  // waiting longest is the thing most likely to have been forgotten.
  rows.sort((a, b) => {
    if (!a.with !== !b.with) return a.with ? 1 : -1
    if (WEIGHT[a.kind] !== WEIGHT[b.kind]) return WEIGHT[a.kind] - WEIGHT[b.kind]
    return (a.since ?? '').localeCompare(b.since ?? '')
  })

  const yours = rows.filter((r) => !r.with).length
  const appointments = appointmentsFor(patientId).filter((a) => a.status !== 'Completed')
  // Four at a time. Beyond that a list stops being read and starts being
  // skimmed, and the sort has already put the ones that matter at the top —
  // so the fifth onwards are, by construction, the ones that can wait.
  const shown = expanded ? rows : rows.slice(0, 4)

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
                {shown.map((r) => (
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

              {rows.length > shown.length ? (
                <button
                  onClick={() => setExpanded(true)}
                  className="w-full px-5 py-3 text-left text-[0.85rem] font-medium text-brand hover:bg-canvas"
                >
                  Show {rows.length - shown.length} more
                </button>
              ) : null}
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
    <span className="shrink-0 rounded-full  border-line px-2.5 py-1 text-[0.74rem] text-muted">
      With {withWhom}
    </span>
  )
}

/** Kept so existing imports do not break while screens are converted. */
export const PriorityStack = WorkStream


/**
 * What this review actually is, in the person's terms.
 *
 * The policy layer raises everything under one title — "Action needs human
 * review" — with one set of buttons: Approve, Approve with changes, Decline.
 * That is accurate about the mechanism and useless about the decision. Asked
 * to approve something, the first question anyone has is "approve what?", and
 * the interface did not answer it.
 *
 * So the reason the policy layer recorded is read back and turned into the
 * decision it actually represents:
 *
 *   share      — something would leave the record. The only irreversible one
 *                here, so it sorts first and its buttons name the outcome:
 *                share it, share less, do not share. "Approve" does not say
 *                what happens; "Share it" does.
 *   stopped    — ORCA stopped itself before making a clinical claim. This is
 *                not the patient's to approve. Asking somebody to sign off a
 *                clinical statement about themselves is the opposite of the
 *                safeguard it came from, so it is shown as what it is: a stop
 *                that a clinician is looking at.
 *   authority  — a determination outside this platform's authority. Also not
 *                hers, and also shown rather than asked.
 *
 * When the reason matches nothing known, it keeps the original wording rather
 * than inventing a friendlier one. A confident label over an unrecognised
 * decision is worse than a plain one.
 */
function classify(
  review: Review,
  role: string,
): {
  kind: Kind
  title: string
  detail: string
  yours: boolean
  withWhom?: string
  choices: { label: string; decision: string }[]
} {
  const reason = review.reason.toLowerCase()
  const isPatient = role === 'patient'

  if (reason.includes('leave the patient') || reason.includes('boundary')) {
    return {
      kind: 'share',
      title: isPatient
        ? 'Something would be shared outside your record'
        : 'Disclosure needs the patient’s approval',
      detail: isPatient
        ? 'Nothing has gone anywhere. You decide what leaves, and to whom — this is the one thing here that cannot be taken back afterwards.'
        : review.reason,
      yours: isPatient,
      withWhom: isPatient ? undefined : 'the patient',
      choices: [
        { label: 'Share it', decision: 'Approved' },
        { label: 'Share less than asked', decision: 'Approved with changes' },
        { label: 'Do not share', decision: 'Declined' },
      ],
    }
  }

  if (reason.includes('clinical claim') || reason.includes('diagnose')) {
    return {
      kind: 'stopped',
      title: 'ORCA stopped itself before saying something clinical',
      detail:
        'It was about to make a clinical statement, which is not its to make. Nothing was said and nothing was recorded. A clinician is looking at it.',
      yours: false,
      withWhom: 'your psychologist',
      choices: [],
    }
  }

  if (reason.includes('statutory') || reason.includes('authority') || reason.includes('employment determination')) {
    return {
      kind: 'authority',
      title: 'This is not ORCA’s decision to make',
      detail:
        'It touches an employment or statutory judgement, which belongs to a person with the authority to make it. It has gone to one.',
      yours: false,
      withWhom: 'your clinical team',
      choices: [],
    }
  }

  if (reason.includes('risk of harm')) {
    return {
      kind: 'share',
      title: 'A person has been asked to look at this now',
      detail: 'This is not something a workflow should handle. Somebody has been told.',
      yours: false,
      withWhom: 'your clinical team',
      choices: [],
    }
  }

  return {
    kind: 'other',
    title: review.title,
    detail: review.reason,
    yours: true,
    choices: [
      { label: 'Approve', decision: 'Approved' },
      { label: 'Approve with changes', decision: 'Approved with changes' },
      { label: 'Decline', decision: 'Declined' },
    ],
  }
}
