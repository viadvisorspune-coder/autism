/**
 * Compare two periods — a clinician's most common question, made a control.
 *
 * "What has changed since March" is the question every review appointment
 * starts with, and until now the only way to ask it was to type it and hope the
 * router understood which two dates were meant. Two date fields and a button
 * remove the guessing from both ends: the person is not composing a sentence
 * for a parser, and the workflow is not inferring a period from prose.
 *
 * IT COMPOSES A QUESTION RATHER THAN COMPUTING AN ANSWER. This does not diff
 * the record itself, and it must not — a change summary assembled in the
 * browser would be an unattributed clinical claim with no provenance, which is
 * the one thing this product refuses to produce. It asks the same engine
 * everything else asks, so the answer arrives with its sources on it and lands
 * on the same screen as every other answer.
 *
 * WHAT IT SHOWS ON THIS SIDE is which entries fall in each window and how many.
 * That is arithmetic on dates rather than a judgement about them, and it is the
 * part somebody needs before they ask: two periods with nothing in one of them
 * produce an answer about a silence, and it is better to see that first.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TimelineEvent } from '../data/types'
import { ActionButton, useAction } from './action'
import { longDate } from './parts'

/** The last day of the month `back` months before today, as an ISO date. */
function monthsAgo(back: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - back)
  return d.toISOString().slice(0, 10)
}

export default function Compare({
  events,
  subjectName,
  ask,
}: {
  events: TimelineEvent[]
  subjectName: string
  ask: (question: string) => Promise<string>
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [aFrom, setAFrom] = useState(() => monthsAgo(12))
  const [aTo, setATo] = useState(() => monthsAgo(6))
  const [bFrom, setBFrom] = useState(() => monthsAgo(6))
  const [bTo, setBTo] = useState(() => monthsAgo(0))

  const inWindow = (from: string, to: string) =>
    events.filter((e) => e.date >= from && e.date <= to).length

  const first = useMemo(() => inWindow(aFrom, aTo), [events, aFrom, aTo])
  const second = useMemo(() => inWindow(bFrom, bTo), [events, bFrom, bTo])

  /**
   * The one thing this refuses to send.
   *
   * A period that runs backwards is a typo, and asking about it would produce
   * a confident answer about an empty window. Caught here, in words, next to
   * the field.
   */
  const backwards = aFrom > aTo || bFrom > bTo

  const run = useAction(async () => {
    if (backwards) return false
    const id = await ask(
      `Compare ${subjectName || 'this record'} between ${longDate(aFrom)} and ${longDate(aTo)} with ` +
        `${longDate(bFrom)} to ${longDate(bTo)}. Say what changed, what stayed the same, and what ` +
        `is not recorded in either period. Name the entries each statement rests on.`,
    )
    navigate(`/ask/${id}`)
    return true
  })

  return (
    <section className="o-section">
      <h2 className="o-h3 mb-3">Compare two periods</h2>
      <p className="o-body o-measure">
        The question a review usually starts with. This asks it against the record and answers it
        the same way every other question is answered, with the entries named.
      </p>

      {!open ? (
        <button
          type="button"
          className="o-btn mt-6"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          Compare two periods
        </button>
      ) : null}

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            <Window
              title="Earlier"
              from={aFrom}
              to={aTo}
              onFrom={setAFrom}
              onTo={setATo}
              count={first}
              id="a"
            />
            <Window
              title="Later"
              from={bFrom}
              to={bTo}
              onFrom={setBFrom}
              onTo={setBTo}
              count={second}
              id="b"
            />
          </div>

          {backwards ? (
            <p role="alert" className="o-body o-measure mt-6 o-panel p-5">
              <span className="font-semibold">One of these periods ends before it begins.</span>{' '}
              Check the two dates in that column — an answer about a period that runs backwards
              would be an answer about nothing, said confidently.
            </p>
          ) : null}

          {!backwards && (!first || !second) ? (
            <p className="o-body o-measure mt-6 o-panel p-5">
              <span className="font-semibold">
                {!first && !second
                  ? 'Neither period has any entries in it.'
                  : `The ${!first ? 'earlier' : 'later'} period has no entries in it.`}
              </span>{' '}
              You can still ask — the answer will be about a silence in the record, which is
              sometimes exactly what you need to know, and is worth expecting rather than
              discovering.
            </p>
          ) : null}

          <div className="mt-6">
            <ActionButton
              action={run}
              idle="Ask what changed"
              working="Checking the record…"
              done="Asked"
              failed="Did not send"
              primary
              disabled={backwards}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Window({
  title,
  from,
  to,
  onFrom,
  onTo,
  count,
  id,
}: {
  title: string
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  count: number
  id: string
}) {
  return (
    <div>
      <h3 className="o-h3 mb-4">{title}</h3>
      <label htmlFor={`cmp-${id}-from`} className="o-label mb-1 block">
        From
      </label>
      <input
        id={`cmp-${id}-from`}
        type="date"
        className="o-input"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
      />
      <label htmlFor={`cmp-${id}-to`} className="o-label mb-1 mt-4 block">
        To
      </label>
      <input
        id={`cmp-${id}-to`}
        type="date"
        className="o-input"
        value={to}
        onChange={(e) => onTo(e.target.value)}
      />
      {/*
        Arithmetic, not judgement. How many entries fall inside the window is a
        fact this screen can state; what they mean is the question being asked.
      */}
      <p className="o-meta mt-3" aria-live="polite">
        {count} {count === 1 ? 'entry' : 'entries'} in this period
      </p>
    </div>
  )
}
