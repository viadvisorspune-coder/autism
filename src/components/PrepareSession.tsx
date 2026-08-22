import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from './ui'
import { useSession } from '../state/session'
import type { WorkflowStatus } from '../data/types'
import {
  appointmentsFor,
  eventsFor,
  patientName,
  personName,
  requestsFor,
  reviewItems,
  sessionNotes,
  strategiesFor,
} from '../data/db'

/**
 * Prepare for session.
 *
 * The five minutes before an appointment are the point at which a clinician
 * most needs the record and has least time to read it. This is the one thing
 * they are trying to do — so it gets a button rather than a path through the
 * navigation, and the answer arrives assembled instead of as somewhere to
 * start looking.
 *
 * Everything in it is quoted from the record and says where it came from. It
 * proposes no clinical judgement and writes nothing: assembling what is
 * already known is a clerical job, and worth automating precisely because it
 * is the part that carries no risk. The questions at the end are gaps in the
 * record, phrased as questions — a check-in that reports "partly helped" with
 * no note is a thing to ask about, not a thing to conclude from.
 *
 * A sheet rather than a page, because it is read alongside the caseload and
 * closed again, and because losing your place on the way to a session is the
 * exact cost this is meant to remove.
 */

/** Finished, one way or the other. Everything else is still somebody's problem. */
const SETTLED = new Set<WorkflowStatus>(['Completed', 'Cancelled'])

export function PrepareSessionButton({
  patientId,
  variant = 'quiet',
}: {
  patientId: string
  variant?: 'primary' | 'quiet'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === 'primary'
            ? 'rounded-lg bg-clinical px-4 py-2 text-[0.87rem] font-medium text-white hover:bg-clinical-ink'
            : 'rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-[0.85rem] font-medium text-ink hover:bg-surface-2'
        }
      >
        Prepare for session
      </button>
      {open ? <SessionBrief patientId={patientId} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function SessionBrief({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { option, role } = useSession()
  const base = option?.home ?? ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const next = appointmentsFor(patientId)
    .filter((a) => a.status !== 'Completed')
    .sort((a, b) => a.datetime.localeCompare(b.datetime))[0]

  const lastNote = sessionNotes
    .filter((n) => n.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]

  // "Since the last session" is measured from the last session, not from an
  // arbitrary fortnight. If there has never been one, everything is new.
  const since = lastNote?.date ?? '0000-00-00'
  const changes = eventsFor(patientId)
    .filter((e) => e.date > since)
    .sort((a, b) => b.date.localeCompare(a.date))

  const strategies = strategiesFor(patientId).filter(
    (s) => s.status === 'Active' || s.phase === 'Outcome' || s.phase === 'Adaptation',
  )

  const openRequests = requestsFor(patientId).filter((r) => !SETTLED.has(r.status))
  const openReviews = reviewItems.filter(
    (r) => r.patientId === patientId && !SETTLED.has(r.status),
  )

  const questions = questionsFor(patientId, next?.questions ?? [])

  const sources = [
    lastNote ? `Session note, ${formatDate(lastNote.date)}` : null,
    changes.length ? `${changes.length} record entries since then` : null,
    strategies.length ? `${strategies.length} support strategies` : null,
    openRequests.length ? `${openRequests.length} open requests` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close brief" onClick={onClose} className="flex-1 bg-ink/25" />

      <div
        role="dialog"
        aria-label={`Session brief for ${patientName(patientId)}`}
        className="h-full w-[34rem] max-w-full overflow-y-auto border-l border-line bg-surface"
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface px-6 py-4">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Session brief
            </p>
            <h2 className="text-[1.15rem] font-semibold tracking-[-0.01em] text-ink">
              {patientName(patientId)}
            </h2>
            <p className="mt-0.5 text-[0.83rem] text-muted">
              {next
                ? `${formatDate(next.datetime.slice(0, 10))} · ${next.purpose} · ${personName(next.professionalId)}`
                : 'No appointment scheduled'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[0.82rem] text-muted hover:bg-canvas hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-5">
          <Block
            title="Since the last session"
            meta={lastNote ? formatDate(lastNote.date) : 'No previous session on record'}
          >
            {changes.length ? (
              <ul className="space-y-2">
                {changes.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`${base}/patients/${patientId}`}
                      className="text-[0.87rem] font-medium text-ink hover:underline"
                    >
                      {e.title}
                    </Link>
                    <p className="text-[0.82rem] leading-relaxed text-ink-2">{e.summary}</p>
                    <p className="text-[0.77rem] text-muted">
                      {formatDate(e.date)} · {e.category} · {e.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing has been added to the record since then.</Empty>
            )}
          </Block>

          <Block title="What has been tried, and what happened" meta={`${strategies.length} strategies`}>
            {strategies.length ? (
              <ul className="space-y-3">
                {strategies.map((s) => {
                  const last = [...s.checkIns].sort((a, b) => a.date.localeCompare(b.date)).pop()
                  return (
                    <li key={s.id}>
                      <p className="text-[0.87rem] font-medium text-ink">{s.title}</p>
                      <p className="text-[0.82rem] leading-relaxed text-ink-2">{s.goal}</p>
                      <p className="mt-0.5 text-[0.8rem] text-muted">
                        {s.phase} · started {formatDate(s.start)} · review {formatDate(s.reviewDate)}
                        {' · '}
                        {s.checkIns.length} check-in{s.checkIns.length === 1 ? '' : 's'}
                      </p>
                      {last ? (
                        <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">
                          Most recent, {formatDate(last.date)} — <em>{last.helpfulness}.</em>{' '}
                          {last.note}
                        </p>
                      ) : null}
                      {s.outcome ? (
                        <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">
                          Outcome: {s.outcome.summary}
                          {s.outcome.proposedAdaptation
                            ? ` Proposed adaptation: ${s.outcome.proposedAdaptation}`
                            : ''}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>No active strategies.</Empty>
            )}
          </Block>

          <Block
            title="Still unresolved"
            meta={`${openRequests.length + openReviews.length} open`}
          >
            {openRequests.length || openReviews.length ? (
              <ul className="space-y-2">
                {openReviews.map((r) => (
                  <li key={r.id}>
                    <p className="text-[0.87rem] font-medium text-ink">{r.title}</p>
                    <p className="text-[0.82rem] leading-relaxed text-ink-2">
                      Waiting on {r.assignedTo.join(' or ')} since {formatDate(r.raised)}.
                    </p>
                  </li>
                ))}
                {openRequests.map((r) => {
                  const unanswered = r.clarifications.filter((c) => !c.answer)
                  return (
                    <li key={r.id}>
                      <p className="text-[0.87rem] font-medium text-ink">{r.title}</p>
                      <p className="text-[0.82rem] leading-relaxed text-ink-2">
                        With {r.currentOwner} since {formatDate(r.raised)}.
                        {unanswered.length
                          ? ` ${unanswered.length} question(s) unanswered: “${unanswered[0].question}”`
                          : ''}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>Nothing outstanding.</Empty>
            )}
          </Block>

          <Block title="Worth asking" meta="Gaps in the record, not conclusions">
            {questions.length ? (
              <ul className="list-disc space-y-1.5 pl-5">
                {questions.map((q) => (
                  <li key={q} className="text-[0.86rem] leading-relaxed text-ink">
                    {q}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>The record has no obvious gaps to raise.</Empty>
            )}
          </Block>

          <div className="mt-5 rounded-[10px] border border-line bg-canvas px-4 py-3">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Assembled from
            </p>
            <ul className="mt-1 space-y-0.5">
              {sources.map((s) => (
                <li key={s} className="text-[0.82rem] text-ink-2">
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.79rem] leading-relaxed text-muted">
              Nothing here was written by ORCA and nothing has been shared. This is the record you
              already have access to, gathered into one place for the next twenty minutes.
            </p>
          </div>

          {role !== 'gp' ? (
            <Link
              to={`${base}/session`}
              onClick={onClose}
              className="mt-4 inline-block rounded-lg bg-clinical px-4 py-2 text-[0.87rem] font-medium text-white hover:bg-clinical-ink"
            >
              Open session workspace
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Block({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6 border-b border-line pb-5 last:border-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.9rem] font-semibold text-ink">{title}</h3>
        {meta ? <span className="text-[0.78rem] text-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.84rem] text-muted">{children}</p>
}

/**
 * Questions worth asking, derived from what the record does not say.
 *
 * A check-in marked "partly helped" with no note, a strategy past its review
 * with no outcome, a clarification nobody answered — these are holes, and a
 * hole is a question. Anything the patient has already written down for this
 * appointment comes first, because they thought of it before anyone else did.
 */
function questionsFor(patientId: string, theirs: string[]): string[] {
  const out = [...theirs]

  strategiesFor(patientId).forEach((s) => {
    const vague = s.checkIns.filter((c) => c.helpfulness === 'Partly helped' && c.note.length < 60)
    if (vague.length) {
      out.push(
        `${s.title}: "partly helped" was recorded on ${formatDate(vague[0].date)} — what was different about the times it did not?`,
      )
    }
    if (s.status === 'Active' && !s.outcome && Date.parse(s.reviewDate) < Date.parse('2026-08-19')) {
      out.push(`${s.title} passed its review date on ${formatDate(s.reviewDate)} with no outcome written.`)
    }
    if (s.outcome?.proposedAdaptation) {
      out.push(`Is the proposed adaptation to ${s.title.toLowerCase()} still the right one?`)
    }
  })

  requestsFor(patientId).forEach((r) =>
    r.clarifications
      .filter((c) => !c.answer)
      .forEach((c) => out.push(`${r.destination} asked, and nobody has answered: “${c.question}”`)),
  )

  return Array.from(new Set(out)).slice(0, 6)
}
