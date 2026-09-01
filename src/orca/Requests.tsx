/**
 * Requests — an employer's and an adviser's actual job.
 *
 * Anil was given a chat box and nothing to do with what it told him. His job is
 * receiving a request, deciding on it, putting it in place and reviewing it,
 * and only the first of those had a screen. Ruth's is the same job on an
 * academic calendar.
 *
 * FOUR ANSWERS, NOT TWO. Approve, approve in part, decline, and ask a question.
 * Real accommodation decisions are rarely yes or no — three days at home is
 * refusable where two is not — and a binary forces the whole request to fail on
 * the half that could not be met, which is a worse outcome for the person than
 * a partial yes with a reason. The fourth answer is what stops a bad decision
 * being forced: somebody who cannot tell whether "a quieter space" means a room
 * or a corner should be able to ask rather than guess.
 *
 * A REASON IS REQUIRED FOR ANYTHING BUT A FULL YES. A partial or a refusal
 * without one cannot be responded to, appealed, or planned around — it is a
 * decision that happened to somebody rather than one they were part of. The
 * server enforces it; this screen says so before the press rather than after.
 *
 * THE QUESTION GOES TO THE PERSON, NOT THEIR CLINICIAN. What is being asked
 * about is what they need, not why they need it, and routing it through a
 * clinician would turn a practical question into a medical one.
 */
import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useSubject } from './subject'
import { actOnRecord, useLive } from '../lib/live'
import {
  Card,
  CouldNotLoad,
  Disclosure,
  Loading,
  Nothing,
  PageTitle,
  SectionHead,
  Updated,
  longDate,
} from './parts'
import { ActionButton, useAction } from './action'

interface RequestRow {
  id: string
  title: string
  type?: string
  status?: string
  raised_on?: string
  destination?: string
  destination_role?: string
  functional_requirement?: string | null
  requested_adjustment?: string | null
  authorised_information?: string[] | null
  withheld?: string[] | null
  implementation?: string | null
  review_date?: string | null
  steps?: unknown[]
}

interface ClarificationRow {
  id: string
  request_id: string
  asked_on: string
  asked_by_label?: string
  question: string
  answered_on?: string | null
  answer?: string | null
}

type Decision = 'Approved' | 'Approved in part' | 'Declined'

const OPEN = new Set(['Draft', 'Active', 'Awaiting stakeholder', 'Awaiting information', 'In progress'])

export default function Requests() {
  const { role, option, patientId } = useSession()
  const { subjectId, subjectName } = useSubject()
  const record = subjectId ?? patientId
  const { data, loading, failed, updatedAt, refresh } = useLive<{
    requests: RequestRow[]
    clarifications: ClarificationRow[]
  }>('requests', record)

  const university = role === 'university'
  const all = data?.requests ?? []
  // Only what was sent to this person's role. A request addressed to the
  // university appearing on an employer's screen is a disclosure by accident.
  const mine = useMemo(() => all.filter((r) => r.destination_role === role), [all, role])
  const open = useMemo(() => mine.filter((r) => OPEN.has(r.status ?? '')), [mine])
  const settled = useMemo(() => mine.filter((r) => !OPEN.has(r.status ?? '')), [mine])

  async function act(action: string, fields: Record<string, unknown>): Promise<boolean> {
    if (!record || !option?.personId) return false
    const result = await actOnRecord(action, record, option.personId, fields)
    if (result.ok) await refresh()
    return result.ok
  }

  return (
    <>
      <PageTitle
        sub={`Sent to you by ${subjectName || 'the person they are about'}. Nothing here decides itself and nothing expires.`}
      >
        {loading && !data
          ? 'Requests'
          : open.length === 0
            ? 'Nothing is waiting on you'
            : open.length === 1
              ? 'One request is waiting on you'
              : `${open.length} requests are waiting on you`}
      </PageTitle>

      {loading && !data ? <Loading what="requests sent to you" /> : null}
      {failed ? <CouldNotLoad what="Requests" onRetry={refresh} /> : null}

      {!loading && !mine.length && !failed ? (
        <Nothing>
          {university
            ? 'No student has sent you a request. When one does, it appears here with what is being asked for and what is not being shared with you.'
            : 'Nobody has sent you a request. When somebody does, it appears here with what is being asked for and what is not being shared with you.'}
        </Nothing>
      ) : null}

      <ul className="space-y-10">
        {open.map((r) => (
          <li key={r.id}>
            <Request
              request={r}
              clarifications={(data?.clarifications ?? []).filter((c) => c.request_id === r.id)}
              act={act}
              active={open.length === 1}
            />
          </li>
        ))}
      </ul>

      {settled.length ? (
        <section className="o-section">
          <SectionHead>Already decided</SectionHead>
          <p className="o-body o-measure mb-6">
            Kept, with what was decided and why. A decision that disappears once it is made cannot
            be reviewed, and a review date is nothing without the decision it applies to.
          </p>
          <ul className="space-y-8">
            {settled.map((r) => (
              <li key={r.id}>
                <Card tone={r.status === 'Cancelled' ? 'past' : 'shared'}>
                  <div className="p-6">
                    <p className="o-h3">{r.title}</p>
                    <p className="o-meta mt-2">
                      {[
                        r.raised_on ? `Asked ${longDate(r.raised_on)}` : null,
                        r.status === 'Cancelled' ? 'Declined' : 'Agreed',
                        r.review_date ? `Review ${longDate(r.review_date)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.implementation ? (
                      <p className="o-body o-measure mt-4">In place: {r.implementation}</p>
                    ) : null}
                    <Trail steps={r.steps} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/** What was decided, by whom, and why — kept on the request that carries it. */
function Trail({ steps }: { steps?: unknown[] }) {
  const rows = (steps ?? []) as {
    at?: string
    by?: string
    role?: string
    decision?: string
    reason?: string
  }[]
  if (!rows.length) return null
  return (
    <div className="mt-5">
      <Disclosure summary="What was decided" note={<p className="o-meta">{rows.length} recorded.</p>}>
        <ul className="space-y-4">
          {rows.map((s, i) => (
            <li key={i} className="o-panel p-4">
              <p className="o-body font-semibold">{s.decision}</p>
              <p className="o-meta mt-1">
                {[s.by, s.at ? longDate(String(s.at).slice(0, 10)) : null].filter(Boolean).join(' · ')}
              </p>
              {s.reason ? <p className="o-body o-measure mt-2">{s.reason}</p> : null}
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  )
}

/**
 * One request, with what is not being shared as prominent as what is.
 *
 * The withheld list is the reason an employer can be trusted with this screen
 * at all: it says, in the same size type as everything else, that a diagnosis
 * was not sent and is not being asked about. Without it an employer reads a
 * functional requirement and fills the gap with a guess, which is the failure
 * mode this whole product exists around.
 */
function Request({
  request,
  clarifications,
  act,
  active,
}: {
  request: RequestRow
  clarifications: ClarificationRow[]
  act: (action: string, fields: Record<string, unknown>) => Promise<boolean>
  active: boolean
}) {
  const [choice, setChoice] = useState<Decision | 'ask' | null>(null)
  const [reason, setReason] = useState('')
  const [implementation, setImplementation] = useState('')
  const [review, setReview] = useState('')
  const [question, setQuestion] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const needsReason = choice === 'Approved in part' || choice === 'Declined'
  const ready =
    choice === 'ask' ? Boolean(question.trim()) : Boolean(choice) && (!needsReason || reason.trim())

  const decide = useAction(async () => {
    setProblem(null)
    if (!choice || choice === 'ask') return false
    const ok = await act('decide_request', {
      request_id: request.id,
      decision: choice,
      reason: reason.trim() || null,
      implementation: implementation.trim() || null,
      review_date: review || null,
    })
    if (!ok) {
      setProblem('That could not be saved. Everything you typed is still here and nothing was sent.')
      return false
    }
    return true
  })

  const askThem = useAction(async () => {
    setProblem(null)
    if (!question.trim()) return false
    const ok = await act('ask_about_request', {
      request_id: request.id,
      question: question.trim(),
    })
    if (!ok) {
      setProblem('That could not be sent. What you typed is still here.')
      return false
    }
    setQuestion('')
    setChoice(null)
    return true
  })

  return (
    <Card tone="decision" raised={active} active={active}>
      <div className="o-card-body">
        <h2 className="o-h2 mb-6">{request.title}</h2>
        <p className="o-meta">
          {[request.raised_on ? `Asked ${longDate(request.raised_on)}` : null, request.type]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {request.functional_requirement ? (
          <>
            <hr className="o-rule my-8" />
            <h3 className="o-h3 mb-3">What they need</h3>
            <p className="o-body o-measure">{request.functional_requirement}</p>
          </>
        ) : null}

        {request.requested_adjustment ? (
          <>
            <hr className="o-rule my-8" />
            <h3 className="o-h3 mb-3">What is being asked for</h3>
            <p className="o-body o-measure">{request.requested_adjustment}</p>
          </>
        ) : null}

        {/*
          What is not being shared, at the same weight as what is.

          This is the reason an employer can be given this screen at all. An
          employer who reads a functional requirement with no statement of what
          was held back fills the gap with a guess, and the guess is a
          diagnosis. Saying plainly that one was not sent, and is not being
          asked about, is what makes the request answerable on its own terms.
        */}
        <hr className="o-rule my-8" />
        <h3 className="o-h3 mb-3">What is not being shared with you</h3>
        <p className="o-body o-measure">
          {request.withheld?.length
            ? request.withheld.join(', ')
            : 'Any diagnosis, any medication, and anything from clinical sessions. You are being asked about what somebody needs, not why they need it.'}
        </p>

        {clarifications.length ? (
          <>
            <hr className="o-rule my-8" />
            <h3 className="o-h3 mb-3">Questions already asked</h3>
            <ul className="space-y-4">
              {clarifications.map((c) => (
                <li key={c.id} className="o-panel p-4">
                  <p className="o-body">{c.question}</p>
                  <p className="o-meta mt-1">
                    {c.asked_by_label} · {longDate(c.asked_on)}
                  </p>
                  <p className="o-body o-measure mt-3">
                    {c.answer ?? 'No answer yet. The request is still open.'}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <hr className="o-rule my-8" />
        <h3 className="o-h3 mb-4">Your answer</h3>
        <div className="flex flex-wrap gap-3">
          {(['Approved', 'Approved in part', 'Declined'] as Decision[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={choice === d}
              onClick={() => setChoice(choice === d ? null : d)}
              className={`o-btn o-btn-small ${choice === d ? 'o-btn-on' : ''}`}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={choice === 'ask'}
            onClick={() => setChoice(choice === 'ask' ? null : 'ask')}
            className={`o-btn o-btn-small ${choice === 'ask' ? 'o-btn-on' : ''}`}
          >
            Ask a question instead
          </button>
        </div>

        <div className="o-reveal" data-open={choice ? 'yes' : 'no'}>
          <div inert={!choice}>
            {choice === 'ask' ? (
              <>
                <label htmlFor={`q-${request.id}`} className="o-h3 mb-3 mt-6 block">
                  What you need to know
                </label>
                <p className="o-body o-measure mb-3">
                  This goes to them, not to their clinician. Nothing is decided by asking and the
                  request stays open.
                </p>
                <textarea
                  id={`q-${request.id}`}
                  className="o-input"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </>
            ) : (
              <>
                <label htmlFor={`why-${request.id}`} className="o-h3 mb-3 mt-6 block">
                  {choice === 'Approved'
                    ? 'Anything you want to add'
                    : 'What could not be met, and why'}
                </label>
                {needsReason ? (
                  <p className="o-body o-measure mb-3">
                    Required. A partial or a refusal with no reason cannot be responded to,
                    appealed, or planned around — it is a decision that happened to somebody
                    rather than one they were part of.
                  </p>
                ) : null}
                <textarea
                  id={`why-${request.id}`}
                  className="o-input"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-invalid={needsReason && !reason.trim() ? true : undefined}
                />

                {choice !== 'Declined' ? (
                  <>
                    <label htmlFor={`impl-${request.id}`} className="o-h3 mb-3 mt-6 block">
                      What will actually be in place
                    </label>
                    <textarea
                      id={`impl-${request.id}`}
                      className="o-input"
                      rows={2}
                      value={implementation}
                      onChange={(e) => setImplementation(e.target.value)}
                    />

                    <label htmlFor={`rev-${request.id}`} className="o-h3 mb-3 mt-6 block">
                      Review this on
                    </label>
                    <input
                      id={`rev-${request.id}`}
                      type="date"
                      className="o-input"
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                    />
                    <p className="o-meta o-measure mt-2">
                      Nothing chases this date. It shows as due on your register when it passes.
                    </p>
                  </>
                ) : null}
              </>
            )}

            {problem ? (
              <div role="alert" className="o-body o-measure mt-6 o-panel p-5">
                <p className="font-semibold">This was not saved.</p>
                <p className="mt-3">{problem}</p>
                <p className="mt-3">Nothing is being retried on its own.</p>
              </div>
            ) : null}

            <div className="mt-6">
              {choice === 'ask' ? (
                <ActionButton
                  action={askThem}
                  idle="Send the question"
                  working="Sending…"
                  done="Sent ✓"
                  failed="Not sent"
                  primary
                  disabled={!ready}
                />
              ) : (
                <ActionButton
                  action={decide}
                  idle={`Record: ${choice ?? ''}`}
                  working="Saving…"
                  done="Saved ✓"
                  failed="Not saved"
                  primary
                  disabled={!ready}
                />
              )}
            </div>
          </div>
        </div>

        <p className="o-body o-measure mt-6">
          Whatever you decide goes into their record with your name on it, so they can see what
          you decided and why. Nothing is sent to their clinician.
        </p>
      </div>
    </Card>
  )
}
