/**
 * Strategies — the loop that had no interface.
 *
 * An occupational therapist's job is not a series of assessments. It is:
 * propose something, wait, find out whether it worked, adapt or stop. The
 * tables for it have existed since the first migration and there has never been
 * a screen — the loop lived only as rows somebody seeded, which meant Meera and
 * Sana could read what had been tried and could not try anything.
 *
 * THE OUTCOME IS THE HALF THAT GOES MISSING. Anybody will record a plan; it is
 * the finding out that gets skipped, because it happens six weeks later on a
 * different day with no prompt attached to it. So the review date is on the
 * card, overdue is stated in words at the top of the screen, and recording what
 * happened is one control on the strategy itself rather than a form somewhere
 * else.
 *
 * THREE WORDS, ALWAYS THE SAME THREE. Helped, partly helped, did not help. An
 * outcome written freehand every time cannot be read across a year — "worked
 * quite well I think" and "helped" are the same finding recorded two ways, and
 * a line of forty of those is forty paragraphs rather than a shape.
 *
 * NOTHING CHASES A REVIEW DATE. It is a date, not a reminder: nobody is
 * notified when it passes and the screen says so. An interface that lets
 * somebody believe it is watching for them, and is not, is worse than one that
 * never offered.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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

interface StrategyRow {
  id: string
  title: string
  goal: string
  rationale?: string | null
  conditions?: string | null
  success_criteria?: string | null
  starts_on?: string | null
  review_date?: string | null
  environment?: string | null
  status?: string
  phase?: string
}

interface CheckinRow {
  id: string
  strategy_id: string
  recorded_on: string
  note: string
  helpfulness: 'Helped' | 'Partly helped' | 'Did not help'
}

type Helpfulness = CheckinRow['helpfulness']

const HELPFULNESS: Helpfulness[] = ['Helped', 'Partly helped', 'Did not help']

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Strategies() {
  const { option, patientId } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const record = subjectId ?? patientId
  const { data, loading, failed, updatedAt, refresh } = useLive<{
    strategies: StrategyRow[]
    checkins: CheckinRow[]
  }>('strategies', record)

  const strategies = data?.strategies ?? []
  const checkins = data?.checkins ?? []

  const active = useMemo(
    () => strategies.filter((s) => s.status !== 'Completed' && s.status !== 'Cancelled'),
    [strategies],
  )
  const ended = useMemo(
    () => strategies.filter((s) => s.status === 'Completed' || s.status === 'Cancelled'),
    [strategies],
  )
  const due = useMemo(
    () => active.filter((s) => s.review_date && s.review_date <= today()),
    [active],
  )

  async function act(action: string, fields: Record<string, unknown>): Promise<boolean> {
    if (!record || !option?.personId) return false
    const result = await actOnRecord(action, record, option.personId, fields)
    if (result.ok) await refresh()
    return result.ok
  }

  if (choosable && !subjectId) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <p className="o-body o-measure mb-8">
          A strategy is tried with one person, in their own life. Open somebody from your caseload
          and this becomes theirs.
        </p>
        <Link to="/caseload" className="o-btn o-btn-primary no-underline">
          Go to your caseload
        </Link>
      </>
    )
  }

  return (
    <>
      <PageTitle
        sub={`What has been tried with ${subjectName || 'this person'}, and what came of it.`}
      >
        {loading && !data
          ? 'Strategies'
          : active.length === 0
            ? 'Nothing is being tried'
            : active.length === 1
              ? 'One thing is being tried'
              : `${active.length} things are being tried`}
      </PageTitle>

      {/*
        Due for review, said once at the top in words.

        This is the whole reason the screen exists — the finding out is what
        gets skipped, six weeks later on a different day with nothing attached
        to it. And it says plainly that nothing chased it, because an interface
        somebody believes is watching for them, and is not, is worse than one
        that never offered.
      */}
      {due.length ? (
        <p role="status" className="o-body o-measure mb-10 o-panel p-5">
          <span className="font-semibold">
            {due.length === 1
              ? 'One of these is due for review.'
              : `${due.length} of these are due for review.`}
          </span>{' '}
          Nothing was chased and nobody was told — a review date here is a note to yourself, not
          something the system watches. Recording what happened is on the card.
        </p>
      ) : null}

      {loading && !data ? <Loading what="what has been tried" /> : null}
      {failed ? <CouldNotLoad what="Strategies" onRetry={refresh} /> : null}

      {!loading && !strategies.length && !failed ? (
        <Nothing>
          Nothing has been tried yet, or nothing that was written down. What you start here
          appears with its outcomes over time, which is the part that makes it worth anything
          later.
        </Nothing>
      ) : null}

      <ul className="space-y-8">
        {active.map((s) => (
          <li key={s.id}>
            <Strategy
              strategy={s}
              checkins={checkins.filter((c) => c.strategy_id === s.id)}
              act={act}
            />
          </li>
        ))}
      </ul>

      <NewStrategy act={act} subjectName={subjectName ?? ''} />

      {ended.length ? (
        <section className="o-section">
          <SectionHead>Ended</SectionHead>
          <p className="o-body o-measure mb-6">
            Kept, because what did not work is as much a finding as what did — and it is the half
            somebody needs before proposing the same thing again.
          </p>
          <ul className="space-y-8">
            {ended.map((s) => (
              <li key={s.id}>
                <Strategy
                  strategy={s}
                  checkins={checkins.filter((c) => c.strategy_id === s.id)}
                  act={act}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * One strategy, with everything ever observed about it underneath.
 *
 * The outcomes are the body of the card rather than a detail behind a link.
 * A strategy without its outcomes is a plan, and a list of plans is what this
 * screen exists to stop being the whole picture.
 */
function Strategy({
  strategy,
  checkins,
  act,
}: {
  strategy: StrategyRow
  checkins: CheckinRow[]
  act: (action: string, fields: Record<string, unknown>) => Promise<boolean>
}) {
  const over = Boolean(strategy.review_date && strategy.review_date <= today())
  const finished = strategy.status === 'Completed' || strategy.status === 'Cancelled'
  const latest = checkins[checkins.length - 1]

  return (
    <Card tone={finished ? 'past' : over ? 'decision' : 'current'}>
      <div className="o-card-body">
        <h2 className="o-h3">{strategy.title}</h2>
        <p className="o-body o-measure mt-3">{strategy.goal}</p>
        <p className="o-meta mt-3">
          {[
            strategy.starts_on ? `Started ${longDate(strategy.starts_on)}` : null,
            strategy.environment,
            finished ? 'Ended' : strategy.review_date ? `Review ${longDate(strategy.review_date)}` : 'No review date',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {/* Overdue, in words as well as in the block above. */}
        {over && !finished ? (
          <p className="o-body mt-3 font-semibold">Due for review</p>
        ) : null}

        {/*
          What is known so far, in one line, before anything is opened.

          The most recent outcome is the answer to the question somebody opened
          this screen with. Putting it behind a disclosure would make the
          commonest read the one that costs a press.
        */}
        {latest ? (
          <p className="o-body o-measure mt-4">
            <span className="font-semibold">{latest.helpfulness}</span> — {latest.note}{' '}
            <span className="o-meta">({longDate(latest.recorded_on)})</span>
          </p>
        ) : (
          <p className="o-body o-measure mt-4">
            Nothing has been recorded about how this went.
          </p>
        )}

        {checkins.length > 1 ? (
          <div className="mt-5">
            <Disclosure
              summary="Everything recorded about this"
              note={
                <p className="o-meta">
                  {checkins.length} {checkins.length === 1 ? 'outcome' : 'outcomes'}, oldest first.
                </p>
              }
            >
              <ul className="space-y-4">
                {checkins.map((c) => (
                  <li key={c.id} className="o-panel p-4">
                    <p className="o-body">
                      <span className="font-semibold">{c.helpfulness}</span> — {c.note}
                    </p>
                    <p className="o-meta mt-1">{longDate(c.recorded_on)}</p>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}

        {(strategy.conditions || strategy.success_criteria || strategy.rationale) && !finished ? (
          <div className="mt-5">
            <Disclosure summary="How this was set up">
              {strategy.rationale ? (
                <>
                  <h3 className="o-h3 mb-2">Why</h3>
                  <p className="o-body o-measure mb-5">{strategy.rationale}</p>
                </>
              ) : null}
              {strategy.conditions ? (
                <>
                  <h3 className="o-h3 mb-2">When it applies</h3>
                  <p className="o-body o-measure mb-5">{strategy.conditions}</p>
                </>
              ) : null}
              {strategy.success_criteria ? (
                <>
                  <h3 className="o-h3 mb-2">What would count as working</h3>
                  <p className="o-body o-measure">{strategy.success_criteria}</p>
                </>
              ) : null}
            </Disclosure>
          </div>
        ) : null}

        {!finished ? <Outcome strategy={strategy} act={act} /> : null}
      </div>
    </Card>
  )
}

/**
 * Recording what happened, and ending it.
 *
 * Both live on the strategy because both are answers to the same question —
 * did this work — and separating them puts the ending somewhere a person has to
 * go looking for. Ending asks for the same three words, so a strategy that
 * stopped because it worked and one that stopped because it made things worse
 * are distinguishable a year later.
 */
function Outcome({
  strategy,
  act,
}: {
  strategy: StrategyRow
  act: (action: string, fields: Record<string, unknown>) => Promise<boolean>
}) {
  const [open, setOpen] = useState<'outcome' | 'end' | 'review' | null>(null)
  const [note, setNote] = useState('')
  const [how, setHow] = useState<Helpfulness>('Partly helped')
  const [reviewDate, setReviewDate] = useState(strategy.review_date ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const record = useAction(async () => {
    setProblem(null)
    if (!note.trim()) return false
    const ok = await act('record_outcome', {
      strategy_id: strategy.id,
      note: note.trim(),
      helpfulness: how,
    })
    if (!ok) {
      setProblem('That could not be recorded. What you typed is still here.')
      return false
    }
    setNote('')
    setOpen(null)
    return true
  })

  const end = useAction(async () => {
    setProblem(null)
    if (!note.trim()) return false
    const ok = await act('end_strategy', {
      strategy_id: strategy.id,
      reason: note.trim(),
      helpfulness: how,
    })
    if (!ok) {
      setProblem('That could not be saved. What you typed is still here.')
      return false
    }
    setNote('')
    setOpen(null)
    return true
  })

  const move = useAction(async () => {
    setProblem(null)
    if (!reviewDate) return false
    const ok = await act('set_review_date', {
      strategy_id: strategy.id,
      review_date: reviewDate,
    })
    if (!ok) {
      setProblem('That could not be saved.')
      return false
    }
    setOpen(null)
    return true
  })

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-4">
        <button
          type="button"
          className={`o-btn ${open === 'outcome' ? 'o-btn-on' : ''}`}
          aria-expanded={open === 'outcome'}
          onClick={() => setOpen(open === 'outcome' ? null : 'outcome')}
        >
          Record what happened
        </button>
        <button
          type="button"
          className="o-btn"
          aria-expanded={open === 'review'}
          onClick={() => setOpen(open === 'review' ? null : 'review')}
        >
          {strategy.review_date ? 'Move the review date' : 'Set a review date'}
        </button>
        <button
          type="button"
          className="o-btn"
          aria-expanded={open === 'end'}
          onClick={() => setOpen(open === 'end' ? null : 'end')}
        >
          End this
        </button>
      </div>

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          {open === 'review' ? (
            <>
              <label htmlFor={`review-${strategy.id}`} className="o-h3 mb-3 mt-6 block">
                Come back to this on
              </label>
              <input
                id={`review-${strategy.id}`}
                type="date"
                className="o-input"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
              />
              <p className="o-meta o-measure mt-2">
                Nothing chases this. It appears at the top of this screen when it passes.
              </p>
              <div className="mt-6">
                <ActionButton
                  action={move}
                  idle="Save the date"
                  working="Saving…"
                  done="Saved ✓"
                  failed="Not saved"
                  primary
                  disabled={!reviewDate}
                />
              </div>
            </>
          ) : (
            <>
              <h3 className="o-h3 mb-3 mt-6">
                {open === 'end' ? 'Why this is ending' : 'What happened'}
              </h3>
              <div className="mb-5 flex flex-wrap gap-3">
                {HELPFULNESS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={how === h}
                    onClick={() => setHow(h)}
                    className={`o-btn o-btn-small ${how === h ? 'o-btn-on' : ''}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <textarea
                className="o-input"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={problem ? true : undefined}
                aria-label={open === 'end' ? 'Why this is ending' : 'What happened'}
              />
              {problem ? (
                <p role="alert" className="o-body o-measure mt-4 o-panel p-5">
                  {problem}
                </p>
              ) : null}
              <div className="mt-6">
                {open === 'end' ? (
                  <ActionButton
                    action={end}
                    idle="End it"
                    working="Saving…"
                    done="Ended ✓"
                    failed="Not saved"
                    primary
                    disabled={!note.trim()}
                  />
                ) : (
                  <ActionButton
                    action={record}
                    idle="Record it"
                    working="Saving…"
                    done="Recorded ✓"
                    failed="Not saved"
                    primary
                    disabled={!note.trim()}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Starting one.
 *
 * The two required fields are what it is and what it is for. Everything else is
 * optional and asked for anyway, because a strategy with no success criteria is
 * one nobody can honestly say worked — and the moment to write that down is
 * now, not six weeks from now when the answer is already known.
 */
function NewStrategy({
  act,
  subjectName,
}: {
  act: (action: string, fields: Record<string, unknown>) => Promise<boolean>
  subjectName: string
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [conditions, setConditions] = useState('')
  const [criteria, setCriteria] = useState('')
  const [review, setReview] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const create = useAction(async () => {
    setProblem(null)
    if (!title.trim() || !goal.trim()) return false
    const ok = await act('add_strategy', {
      title: title.trim(),
      goal: goal.trim(),
      conditions: conditions.trim() || null,
      success_criteria: criteria.trim() || null,
      starts_on: today(),
      review_date: review || null,
    })
    if (!ok) {
      setProblem('That could not be started. Everything you typed is still here.')
      return false
    }
    setTitle('')
    setGoal('')
    setConditions('')
    setCriteria('')
    setReview('')
    setOpen(false)
    return true
  })

  return (
    <section className="o-section">
      <SectionHead>Try something new</SectionHead>

      {!open ? (
        <button type="button" className="o-btn" aria-expanded={false} onClick={() => setOpen(true)}>
          Start a strategy
        </button>
      ) : null}

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <label htmlFor="st-title" className="o-h3 mb-3 block">
            What is being tried
          </label>
          <input
            id="st-title"
            className="o-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label htmlFor="st-goal" className="o-h3 mb-3 mt-6 block">
            What it is for
          </label>
          <textarea
            id="st-goal"
            className="o-input"
            rows={3}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <label htmlFor="st-when" className="o-h3 mb-3 mt-6 block">
            When it applies
          </label>
          <textarea
            id="st-when"
            className="o-input"
            rows={2}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />

          <label htmlFor="st-worked" className="o-h3 mb-3 mt-6 block">
            What would count as working
          </label>
          <textarea
            id="st-worked"
            className="o-input"
            rows={2}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <p className="o-meta o-measure mt-2">
            Worth writing now rather than in six weeks. A strategy with no success criteria is one
            nobody can honestly say worked, and by then the answer is already known.
          </p>

          <label htmlFor="st-review" className="o-h3 mb-3 mt-6 block">
            Come back to this on
          </label>
          <input
            id="st-review"
            type="date"
            className="o-input"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <p className="o-meta o-measure mt-2">
            Nothing chases it. It appears at the top of this screen when it passes.
          </p>

          {problem ? (
            <p role="alert" className="o-body o-measure mt-6 o-panel p-5">
              {problem}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-4">
            <ActionButton
              action={create}
              idle="Start it"
              working="Saving…"
              done="Started ✓"
              failed="Not started"
              primary
              disabled={!title.trim() || !goal.trim()}
            />
            <button type="button" className="o-btn" onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>

          <p className="o-meta o-measure mt-5">
            This is visible to {subjectName || 'the person it is about'} and to the professionals
            connected to their record. Nothing is sent to anyone by starting it.
          </p>
        </div>
      </div>
    </section>
  )
}
