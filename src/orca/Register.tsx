/**
 * The register — what is actually in place, and whether it is still working.
 *
 * Deciding a request is the moment everybody designs for and the least
 * important part of the job. What matters six months later is whether the thing
 * that was agreed is happening, and that question had nowhere to live: the
 * decision was recorded and then the record went quiet, which is exactly how an
 * adjustment stops being real without anybody deciding to stop it.
 *
 * ONE SCREEN, TWO WORDS FOR IT. An employer calls these adjustments and a
 * university calls them accommodations. Same rows, same actions, and the label
 * follows the person rather than making them learn the other sector's word.
 *
 * EXAMS EARNS ITS OWN SECTION, FOR RUTH ONLY. Extra time, alternative format
 * and room are the one thing an accessibility adviser is judged on, they have
 * hard deadlines set by somebody else, and missing one cannot be fixed
 * afterwards. An employer has no equivalent and does not get an empty section
 * about one.
 *
 * EVERYTHING RECORDED HERE ENTERS HER RECORD WITH HIS NAME ON IT. Confirming
 * something is in place is a claim about somebody's working life, and it should
 * be as answerable as any clinical entry — which means it is readable next to
 * what she said about the same weeks.
 */
import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useSubject } from './subject'
import { actOnRecord, useLive } from '../lib/live'
import {
  Card,
  CouldNotLoad,
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
  status?: string
  raised_on?: string
  destination_role?: string
  requested_adjustment?: string | null
  implementation?: string | null
  review_date?: string | null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Whether this row is a live arrangement rather than a refused or open one. */
function inPlace(r: RequestRow): boolean {
  return r.status === 'Completed'
}

export default function Register() {
  const { role, option, patientId } = useSession()
  const { subjectId, subjectName } = useSubject()
  const record = subjectId ?? patientId
  const university = role === 'university'
  const word = university ? 'accommodation' : 'adjustment'

  const { data, loading, failed, updatedAt, refresh } = useLive<{ requests: RequestRow[] }>(
    'requests',
    record,
  )

  const mine = useMemo(
    () => (data?.requests ?? []).filter((r) => r.destination_role === role),
    [data, role],
  )
  const live = useMemo(() => mine.filter(inPlace), [mine])
  const due = useMemo(() => live.filter((r) => r.review_date && r.review_date <= today()), [live])

  /**
   * Everything here writes into her record rather than into a private log.
   *
   * A register an employer keeps to himself is a filing cabinet. The point of
   * this one is that what he says about her working conditions is readable
   * beside what she says about the same weeks — which is the only way a
   * contradiction between the two is ever noticed by anybody.
   */
  async function note(title: string, what: string): Promise<boolean> {
    if (!record || !option?.personId) return false
    const result = await actOnRecord('add_entry', record, option.personId, {
      kind: 'note',
      kind_label: title,
      occurred_on: today(),
      fields: { what },
    })
    if (result.ok) await refresh()
    return result.ok
  }

  return (
    <>
      <PageTitle
        sub={`What is in place for ${subjectName || 'them'}, since when, and when it is next worth checking.`}
      >
        {university ? 'Accommodations' : 'Adjustments'}
      </PageTitle>

      {/*
        Due for review, said once at the top, in words.

        The failure this screen exists to prevent is quiet: nobody decides to
        stop an adjustment, it just stops being true and nobody notices for a
        year. A date that has passed is the only warning there is going to be,
        and nothing chases it.
      */}
      {due.length ? (
        <p role="status" className="o-body o-measure mb-10 o-panel p-5">
          <span className="font-semibold">
            {due.length === 1
              ? `One ${word} is due for review.`
              : `${due.length} ${word}s are due for review.`}
          </span>{' '}
          Nothing was chased and nobody was told. A review date here is a note to yourself — the
          check is somebody asking whether this is still happening, and it is on the card.
        </p>
      ) : null}

      {loading && !data ? <Loading what={`what is in place`} /> : null}
      {failed ? <CouldNotLoad what="The register" onRetry={refresh} /> : null}

      {!loading && !live.length && !failed ? (
        <Nothing>
          Nothing is in place yet. A {word} appears here once you have agreed to a request, with
          what was agreed and when it is next worth checking.
        </Nothing>
      ) : null}

      <ul className="space-y-8">
        {live.map((r) => (
          <li key={r.id}>
            <Arrangement request={r} word={word} note={note} />
          </li>
        ))}
      </ul>

      {university ? <Exams subjectName={subjectName ?? ''} note={note} /> : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * One arrangement, and the three things worth saying about it later.
 *
 * Confirm it is happening, report that it is not, or propose a change. The
 * middle one is the one that matters and the one nobody builds: an adjustment
 * that was agreed and is not actually happening is invisible to everybody
 * except the person living it, and they are the person least able to raise it.
 */
function Arrangement({
  request,
  word,
  note,
}: {
  request: RequestRow
  word: string
  note: (title: string, what: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState<'confirm' | 'problem' | 'change' | null>(null)
  const [what, setWhat] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const over = Boolean(request.review_date && request.review_date <= today())

  const write = useAction(async () => {
    setProblem(null)
    if (!open) return false
    const title =
      open === 'confirm'
        ? `${word} confirmed in place`
        : open === 'problem'
          ? `Problem with a ${word}`
          : `Change proposed to a ${word}`
    const body =
      open === 'confirm'
        ? `${request.title}. ${what.trim() || 'Confirmed as still in place.'}`
        : `${request.title}. ${what.trim()}`
    const ok = await note(title, body)
    if (!ok) {
      setProblem('That could not be written to the record. What you typed is still here.')
      return false
    }
    setWhat('')
    setOpen(null)
    return true
  })

  return (
    <Card tone={over ? 'decision' : 'shared'}>
      <div className="o-card-body">
        <h2 className="o-h3">{request.title}</h2>
        {request.requested_adjustment ? (
          <p className="o-body o-measure mt-3">Asked for: {request.requested_adjustment}</p>
        ) : null}
        {request.implementation ? (
          <p className="o-body o-measure mt-3">In place: {request.implementation}</p>
        ) : null}
        <p className="o-meta mt-3">
          {[
            request.raised_on ? `Agreed ${longDate(request.raised_on)}` : null,
            request.review_date ? `Review ${longDate(request.review_date)}` : 'No review date',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {/* Overdue in words as well as in the colour block. */}
        {over ? <p className="o-body mt-3 font-semibold">Due for review</p> : null}

        <div className="mt-6 flex flex-wrap gap-4">
          <button
            type="button"
            className={`o-btn o-btn-small ${open === 'confirm' ? 'o-btn-primary' : ''}`}
            aria-expanded={open === 'confirm'}
            onClick={() => setOpen(open === 'confirm' ? null : 'confirm')}
          >
            Confirm it is happening
          </button>
          <button
            type="button"
            className="o-btn o-btn-small"
            aria-expanded={open === 'problem'}
            onClick={() => setOpen(open === 'problem' ? null : 'problem')}
          >
            Report a problem
          </button>
          <button
            type="button"
            className="o-btn o-btn-small"
            aria-expanded={open === 'change'}
            onClick={() => setOpen(open === 'change' ? null : 'change')}
          >
            Propose a change
          </button>
        </div>

        <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
          <div inert={!open}>
            <label htmlFor={`reg-${request.id}`} className="o-h3 mb-3 mt-6 block">
              {open === 'confirm'
                ? 'Anything worth adding'
                : open === 'problem'
                  ? 'What is not happening'
                  : 'What you would change, and why'}
            </label>
            <textarea
              id={`reg-${request.id}`}
              className="o-input"
              rows={3}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              aria-invalid={problem ? true : undefined}
            />

            {problem ? (
              <p role="alert" className="o-body o-measure mt-4 o-panel p-5">
                {problem}
              </p>
            ) : null}

            <div className="mt-6">
              <ActionButton
                action={write}
                idle="Add this to the record"
                working="Saving…"
                done="Saved ✓"
                failed="Not saved"
                primary
                disabled={open !== 'confirm' && !what.trim()}
              />
            </div>

            <p className="o-meta o-measure mt-5">
              This goes into their record with your name on it, filed as reported by you. They can
              see it, and so can anyone they have shared their record with.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

/**
 * Exam arrangements — Ruth's, and term-critical.
 *
 * The one thing an accessibility adviser is judged on, with a deadline set by
 * an exams office rather than by anybody here, and no way to fix it afterwards.
 * It gets its own section for that reason and for no other.
 *
 * The three fields are the three that go wrong: extra time that was agreed and
 * not applied, a format that was agreed and not produced, and a room that was
 * agreed and then reallocated. Confirming with the exams office is a separate
 * act from setting the arrangement, because those are separate failures and
 * collapsing them means the second one is never noticed.
 */
function Exams({
  subjectName,
  note,
}: {
  subjectName: string
  note: (title: string, what: string) => Promise<boolean>
}) {
  const [time, setTime] = useState('')
  const [format, setFormat] = useState('')
  const [room, setRoom] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const anything = Boolean(time.trim() || format.trim() || room.trim())

  const save = useAction(async () => {
    setProblem(null)
    if (!anything) return false
    const ok = await note(
      'Exam arrangements',
      [
        time.trim() ? `Extra time: ${time.trim()}` : null,
        format.trim() ? `Format: ${format.trim()}` : null,
        room.trim() ? `Room: ${room.trim()}` : null,
        confirmed
          ? 'Confirmed with the exams office.'
          : 'Not yet confirmed with the exams office.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    if (!ok) {
      setProblem('That could not be written to the record. Everything you typed is still here.')
      return false
    }
    setTime('')
    setFormat('')
    setRoom('')
    setConfirmed(false)
    return true
  })

  return (
    <section className="o-section">
      <SectionHead>Exam arrangements</SectionHead>
      <p className="o-body o-measure">
        Set these and confirm them with the exams office. The deadline is theirs rather than
        yours, and an arrangement that is agreed here and not passed on cannot be fixed after the
        exam — so the two are recorded separately.
      </p>

      <label htmlFor="ex-time" className="o-h3 mb-3 mt-8 block">
        Extra time
      </label>
      <input
        id="ex-time"
        className="o-input"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />

      <label htmlFor="ex-format" className="o-h3 mb-3 mt-6 block">
        Alternative format
      </label>
      <input
        id="ex-format"
        className="o-input"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
      />

      <label htmlFor="ex-room" className="o-h3 mb-3 mt-6 block">
        Room
      </label>
      <input
        id="ex-room"
        className="o-input"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          aria-pressed={confirmed}
          onClick={() => setConfirmed((c) => !c)}
          className={`o-btn o-btn-small ${confirmed ? 'o-btn-primary' : ''}`}
        >
          Confirmed with the exams office
        </button>
      </div>
      <p className="o-meta o-measure mt-3">
        {confirmed
          ? 'This will be recorded as confirmed. Nothing is sent to the exams office from here — the confirmation is you saying you have done it.'
          : 'Recorded as not yet confirmed, which is what somebody looking at this later needs to know.'}
      </p>

      {problem ? (
        <p role="alert" className="o-body o-measure mt-6 o-panel p-5">
          {problem}
        </p>
      ) : null}

      <div className="mt-6">
        <ActionButton
          action={save}
          idle="Record these arrangements"
          working="Saving…"
          done="Saved ✓"
          failed="Not saved"
          primary
          disabled={!anything}
        />
      </div>

      <p className="o-meta o-measure mt-5">
        This goes into {subjectName || 'their'} record with your name on it, so they can see what
        was set and whether it was confirmed.
      </p>
    </section>
  )
}
