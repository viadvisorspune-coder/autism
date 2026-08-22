import { useState } from 'react'
import { Button, Callout, Card, CardBody, CardHead, StatusPill, formatDate } from './ui'
import { actOnRecord, useLive } from '../lib/live'
import { useSession } from '../state/session'
import { useUI } from '../state/ui'

/**
 * Decisions moving between people.
 *
 * The same component for every role, because the thing being modelled is the
 * same: somebody is waiting on somebody else. What differs is only which side
 * of that you are on, and the interface says which — "waiting for you" is a
 * different heading from "waiting for them", and the second one is not a
 * to-do list, it is reassurance that you are not the hold-up.
 *
 * Every open view polls, so a decision made in one tab appears in the others
 * within a few seconds without anyone refreshing. That is what makes this a
 * conversation rather than a form.
 */

interface Review {
  id: string
  patient_id: string
  title: string
  reason: string
  understanding: string | null
  evidence: string[]
  uncertainty: string | null
  proposed_action: string | null
  decision_required: string | null
  assigned_to: string[]
  status: string
  decision: string | null
  decided_by: string | null
  decided_at: string | null
  raised_on: string
}

interface AccessRequest {
  id: string
  requested_by: string
  requested_role: string
  purpose: string
  requested_scope: string[]
  justification: string | null
  status: string
  created_at: string
}

interface InboxData {
  reviews: Review[]
  access_requests: AccessRequest[]
  people: Record<string, { name: string; role: string; organisation: string | null }>
}

const OPEN = new Set(['Awaiting approval', 'Awaiting professional review'])

export function Inbox({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const { say } = useUI()
  const { data, refresh } = useLive<InboxData>('inbox', patientId)
  const [busy, setBusy] = useState<string | null>(null)

  const reviews = data?.reviews ?? []
  const access = (data?.access_requests ?? []).filter((r) => r.status === 'Pending')

  const mine = reviews.filter((r) => OPEN.has(r.status) && r.assigned_to.includes(role ?? ''))
  const theirs = reviews.filter((r) => OPEN.has(r.status) && !r.assigned_to.includes(role ?? ''))
  const settled = reviews.filter((r) => !OPEN.has(r.status)).slice(0, 5)

  const nameOf = (id: string | null) => (id ? (data?.people?.[id]?.name ?? id) : 'someone')

  async function decide(review: Review, decision: string) {
    setBusy(review.id)
    const result = await actOnRecord('decide_review', patientId, option?.personId ?? '', {
      review_id: review.id,
      decision,
    })
    setBusy(null)
    say(result.ok ? `Recorded: ${decision}.` : (result.error ?? 'That could not be saved.'))
    if (result.ok) refresh()
  }

  async function decideAccess(request: AccessRequest, approve: boolean) {
    setBusy(request.id)
    const result = await actOnRecord('decide_access_request', patientId, option?.personId ?? '', {
      request_id: request.id,
      approve,
    })
    setBusy(null)
    say(
      result.ok
        ? approve
          ? 'Access given. It appears in your consent history.'
          : 'Declined. Nothing was shared.'
        : (result.error ?? 'That could not be saved.'),
    )
    if (result.ok) refresh()
  }

  if (!mine.length && !theirs.length && !access.length && !settled.length) return null

  return (
    <div className="space-y-6">
      {/* Access first: somebody has asked and can see nothing until answered. */}
      {access.length > 0 && role === 'patient' ? (
        <Card>
          <CardHead title="Someone has asked to see your record" meta={`${access.length} waiting`} />
          <CardBody>
            <ul className="space-y-4">
              {access.map((r) => (
                <li key={r.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                  <p className="text-[0.9rem] font-medium text-ink">{nameOf(r.requested_by)}</p>
                  <p className="text-[0.82rem] text-muted">
                    {r.requested_role} · asked {formatDate(r.created_at.slice(0, 10))}
                  </p>
                  <p className="mt-1.5 text-[0.87rem] leading-relaxed text-ink-2">{r.purpose}</p>
                  {r.requested_scope.length ? (
                    <p className="mt-1 text-[0.83rem] text-ink-2">
                      <span className="text-muted">Asking for: </span>
                      {r.requested_scope.join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      disabled={busy === r.id}
                      onClick={() => decideAccess(r, true)}
                    >
                      Give access
                    </Button>
                    <Button variant="quiet" disabled={busy === r.id} onClick={() => decideAccess(r, false)}>
                      Not now
                    </Button>
                  </div>
                  <p className="mt-2 text-[0.78rem] text-muted">
                    They can see nothing until you decide, and saying no needs no reason.
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {mine.length > 0 ? (
        <Card>
          <CardHead
            title="Waiting for you"
            meta={`${mine.length} ${mine.length === 1 ? 'decision' : 'decisions'}`}
          />
          <CardBody>
            <ul className="space-y-5">
              {mine.map((r) => (
                <li key={r.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[0.92rem] font-medium text-ink">{r.title}</p>
                    <StatusPill status={r.status as never} />
                  </div>
                  <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">{r.reason}</p>

                  {r.understanding ? (
                    <p className="mt-2 text-[0.84rem] leading-relaxed text-ink-2">
                      <span className="text-muted">What ORCA understands: </span>
                      {r.understanding}
                    </p>
                  ) : null}

                  {r.uncertainty ? (
                    <div className="mt-2 rounded-[20px]  bg-state-wait-tint px-4 py-2.5">
                      <p className="text-[0.83rem] leading-relaxed text-ink-2">
                        <span className="font-medium">Not certain about: </span>
                        {r.uncertainty}
                      </p>
                    </div>
                  ) : null}

                  {r.proposed_action ? (
                    <p className="mt-2 text-[0.85rem] leading-relaxed text-ink">
                      <span className="text-muted">Proposed: </span>
                      {r.proposed_action}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" disabled={busy === r.id} onClick={() => decide(r, 'Approved')}>
                      Approve
                    </Button>
                    <Button disabled={busy === r.id} onClick={() => decide(r, 'Approved with changes')}>
                      Approve with changes
                    </Button>
                    <Button variant="quiet" disabled={busy === r.id} onClick={() => decide(r, 'Declined')}>
                      Decline
                    </Button>
                  </div>
                  <p className="mt-2 text-[0.78rem] text-muted">
                    Raised {formatDate(r.raised_on)}. Nothing moves until you choose.
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* Not a to-do list — the opposite. You are not the hold-up. */}
      {theirs.length > 0 ? (
        <Card>
          <CardHead title="Waiting for someone else" meta={`${theirs.length} open`} />
          <CardBody>
            <ul className="space-y-3">
              {theirs.map((r) => (
                <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-[0.89rem] font-medium text-ink">{r.title}</p>
                  <p className="text-[0.83rem] text-muted">
                    With {r.assigned_to.join(' or ')} since {formatDate(r.raised_on)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[0.79rem] leading-relaxed text-muted">
              There is nothing for you to do with these. They appear here so you can see where they
              are rather than wondering.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {settled.length > 0 ? (
        <Card>
          <CardHead title="Recently decided" />
          <CardBody>
            <ul className="space-y-3">
              {settled.map((r) => (
                <li key={r.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="text-[0.89rem] font-medium text-ink">{r.title}</p>
                  <p className="text-[0.83rem] text-ink-2">
                    {r.decision ?? 'Decided'} by {nameOf(r.decided_by)}
                    {r.decided_at ? ` · ${formatDate(r.decided_at.slice(0, 10))}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------- raising a decision */

/**
 * Asking somebody to decide something.
 *
 * Deliberately requires naming who — a decision addressed to nobody is a
 * decision nobody makes, and the endpoint refuses one.
 */
export function RaiseDecision({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const { say } = useUI()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [to, setTo] = useState<string[]>(role === 'patient' ? ['psychologist'] : ['patient'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audience =
    role === 'patient'
      ? ['psychologist', 'psychiatrist', 'ot', 'gp', 'therapist']
      : ['patient', 'psychologist', 'psychiatrist', 'ot', 'gp']

  async function send() {
    setBusy(true)
    setError(null)
    const result = await actOnRecord('raise_review', patientId, option?.personId ?? '', {
      title,
      reason,
      assigned_to: to,
      decision_required: 'Approve, approve with changes, or decline',
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    say(result.note ?? 'Sent.')
    setTitle('')
    setReason('')
    setOpen(false)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Ask someone to decide something</Button>
    )
  }

  return (
    <Card>
      <CardHead title="Ask someone to decide" meta="They will see this within a few seconds" />
      <CardBody className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[0.8rem] text-muted">What is the decision?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Whether to keep the advance-notice strategy going"
            className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[0.8rem] text-muted">Why are you asking?</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="It helped when notice came the evening before, but not when the change was the same hour."
            className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] leading-relaxed outline-none placeholder:text-muted"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-[0.8rem] text-muted">Who should decide?</span>
          <div className="flex flex-wrap gap-1.5">
            {audience.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={to.includes(r)}
                onClick={() => setTo((t) => (t.includes(r) ? t.filter((x) => x !== r) : [...t, r]))}
                className={`rounded-full  px-3 py-1.5 text-[0.8rem] ${
                  to.includes(r) ? 'border-brand bg-brand-tint text-brand-ink' : 'border-line text-ink-2'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {error ? <Callout tone="alert" title="Not sent">{error}</Callout> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={busy || !title.trim() || !reason.trim() || !to.length}
            onClick={send}
          >
            {busy ? 'Sending…' : 'Send it'}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
