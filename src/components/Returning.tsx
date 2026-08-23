import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardBody, Section, formatDate } from './ui'
import { PrepareSessionButton } from './PrepareSession'
import { useLive } from '../lib/live'
import type { ConversationData } from '../lib/live'
import { useSession } from '../state/session'
import type { Role } from '../data/types'
import { useRecordId } from '../state/record'
import {
  TODAY,
  appointmentsFor,
  documentsFor,
  memoryCandidates,
  patientName,
  patientsFor,
  personName,
  strategiesFor,
} from '../data/db'

/**
 * Coming back.
 *
 * Someone who has used ORCA before does not need to be reintroduced to it.
 * They need two things: what moved while they were away, and what is worth
 * doing next. Everything else on the screen is reference material they can
 * reach for when they want it.
 *
 * Both halves are deliberately hard to fill. "While you were away" only lists
 * things recorded after this person's last visit, so it is empty most of the
 * time and means something when it is not. "ORCA suggests" is derived from
 * dates and gaps in the record — a review that has come due, a check-in that
 * has not happened — never from a guess about what someone might like. If the
 * record gives no reason, nothing is suggested, because a suggestion nobody
 * can trace is just a button asking to be pressed.
 *
 * Neither repeats the work stream. Anything already waiting on somebody is
 * shown there once, and once is the whole point.
 */

const DAY = 86_400_000

/** Days from the record's today. Negative is overdue. */
function daysFromToday(iso: string): number {
  return Math.round((Date.parse(iso) - Date.parse(TODAY)) / DAY)
}

/* ------------------------------------------------ what changed while away */

export function SinceYouWereHere({ patientId: given }: { patientId?: string }) {
  const patientId = useRecordId(given)
  const { data } = useLive<ConversationData>('conversation', patientId, 15000)
  if (!data?.last_seen_at) return null

  const { events, decisions, runs } = data.since_last_visit
  const total = events.length + decisions.length + runs.length
  if (total === 0) return null

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[0.95rem] font-semibold text-ink">Since you were last here</h2>
          <p className="text-[0.78rem] text-muted">
            Last visit {formatDate(data.last_seen_at.slice(0, 10))}
          </p>
        </div>
        <ul className="space-y-1.5">
          {decisions.map((d) => (
            <li key={d.id} className="text-[0.87rem] leading-relaxed text-ink-2">
              <span className="text-ink">{d.title}</span> — {d.decision ?? 'decided'}
            </li>
          ))}
          {/* Runs are collapsed by what they are and where they got to. Two
              messages sent a minute apart produce two runs at the same step,
              and listing both says the same thing twice while telling nobody
              anything. "Trigger received" is also a label for the engine, not
              a sentence for the person waiting on it. */}
          {collapseRuns(runs).map((r) => (
            <li key={r.key} className="text-[0.87rem] leading-relaxed text-ink-2">
              {r.line}
            </li>
          ))}
          {events.map((e) => (
            <li key={e.id} className="text-[0.87rem] leading-relaxed text-ink-2">
              <span className="text-ink">{e.title}</span> was added to the record
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/**
 * Runs, said once and in words.
 *
 * The raw fields are a type and a step name, both written for whoever is
 * debugging the engine. "End-to-end support coordination moved to trigger
 * received" is four words of jargon around one fact: ORCA started looking at
 * something. Said twice, it reads like a fault.
 */
function collapseRuns(
  runs: { id: string; type: string; status: string; current_step: string }[],
): { key: string; line: string }[] {
  const seen = new Map<string, number>()
  runs.forEach((r) => {
    const key = `${r.type}|${r.current_step}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  })

  return [...seen.entries()].map(([key, count]) => {
    const step = key.split('|')[1]
    const started = /trigger received/i.test(step)
    return {
      key,
      line: started
        ? `ORCA started looking at ${count === 1 ? 'something you asked' : `${count} things you asked`}`
        : `Work in progress: ${step.toLowerCase()}`,
    }
  })
}

/* ---------------------------------------------- what it did without asking */

/**
 * The decisions ORCA took on its own.
 *
 * Giving an assistant more autonomy is only defensible if the autonomy is
 * legible. A system that asks about everything is exhausting; one that asks
 * about nothing and shows nothing is worse, because the person has no way to
 * discover what was decided for them or to object to a rule they never saw.
 *
 * So every time the gate proceeds without asking, it writes an audit line
 * saying what it did and which consent it relied on. This is that list, in the
 * person's own interface, closed by default because on a good day it is
 * uninteresting — and one press away on the day it is not.
 */
export function DecidedWithoutAsking({ patientId: given }: { patientId?: string }) {
  const patientId = useRecordId(given)
  const { data } = useLive<{ entries: AuditRow[] }>('audit', patientId, 20000)
  const alone = (data?.entries ?? []).filter((e) => e.action === 'Proceeded without asking')
  if (!alone.length) return null

  return (
    <Section
      title="What ORCA did without asking"
      count={alone.length}
      summary="Each of these was already covered by something you had agreed to."
    >
      <Card>
        <CardBody>
          <ul className="space-y-3">
            {alone.slice(0, 6).map((e) => (
              <li key={e.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <p className="text-[0.87rem] text-ink">{e.record}</p>
                <p className="mt-0.5 text-[0.82rem] leading-relaxed text-ink-2">{e.why}</p>
                <p className="text-[0.77rem] text-muted">{formatDate(String(e.occurred_at).slice(0, 10))}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.82rem] leading-relaxed text-muted">
            If any of this should have stopped for you, narrow that connection and it will.
          </p>
        </CardBody>
      </Card>
    </Section>
  )
}

interface AuditRow {
  id: string
  action: string
  record: string
  why: string | null
  occurred_at: string
}

/* ------------------------------------------------------------ suggestions */

interface Suggestion {
  id: string
  text: string
  /** Why this is on the screen, in terms of the record rather than the model. */
  why: string
  to?: string
  action?: ReactNode
  /** Lower sorts first. Overdue beats due beats merely open. */
  order: number
}

export function OrcaSuggests({ patientId: given }: { patientId?: string }) {
  const patientId = useRecordId(given)
  const { role, option } = useSession()
  if (!role) return null

  const suggestions =
    role === 'patient' || role === 'trusted'
      ? forPatient(patientId)
      : forProfessional(role, option?.home ?? '')

  if (!suggestions.length) return null

  return (
    <Card className="mb-8">
      <CardBody>
        <h2 className="mb-3 text-[0.95rem] font-semibold text-ink">ORCA suggests</h2>
        <ul className="space-y-3">
          {suggestions.slice(0, 3).map((s) => (
            <li key={s.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                {s.to ? (
                  <Link
                    to={s.to}
                    className="text-[0.89rem] font-medium text-ink hover:underline"
                  >
                    {s.text}
                  </Link>
                ) : (
                  <span className="text-[0.89rem] font-medium text-ink">{s.text}</span>
                )}
                {s.action}
              </div>
              <Why>{s.why}</Why>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/**
 * "Why am I seeing this?"
 *
 * Closed by default, because most of the time the suggestion is obvious and
 * the reason is clutter. Open, it has to say something checkable — a date, a
 * count, a gap — rather than restate the suggestion in longer words.
 */
export function Why({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[0.78rem] text-muted underline-offset-2 hover:text-ink-2 hover:underline"
      >
        {open ? 'Hide' : 'Why am I seeing this?'}
      </button>
      {open ? (
        <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">{children}</p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------- rule sets */

function forPatient(patientId: string): Suggestion[] {
  const out: Suggestion[] = []

  strategiesFor(patientId)
    .filter((s) => s.status === 'Active')
    .forEach((s) => {
      const due = daysFromToday(s.reviewDate)
      if (due <= 7) {
        out.push({
          id: `rev-${s.id}`,
          text: `Review how ${s.title.toLowerCase()} is going`,
          why: `Its review date is ${formatDate(s.reviewDate)}${
            due < 0 ? ', which has passed' : ''
          }, and ${s.checkIns.length === 0 ? 'no check-ins have been added' : `there ${s.checkIns.length === 1 ? 'is 1 check-in' : `are ${s.checkIns.length} check-ins`} so far`}.`,
          to: `/patient/support/${s.id}`,
          order: due < 0 ? 0 : 1,
        })
        return
      }

      const last = s.checkIns.map((c) => c.date).sort().pop()
      const quiet = last ? -daysFromToday(last) : null
      if (quiet === null || quiet >= 10) {
        out.push({
          id: `ci-${s.id}`,
          text: `Add how ${s.title.toLowerCase()} has been`,
          why: last
            ? `The last check-in was ${formatDate(last)}, ${quiet} days ago. The outcome at review is only as good as what goes into it.`
            : 'It started without any check-ins yet, so there is nothing to judge it on at review.',
          to: `/patient/support/${s.id}`,
          order: 2,
        })
      }
    })

  appointmentsFor(patientId)
    .filter((a) => a.status !== 'Completed')
    .forEach((a) => {
      const away = daysFromToday(a.datetime.slice(0, 10))
      if (away < 0 || away > 10) return
      if (a.preparationStatus === 'Approved by patient' || a.preparationStatus === 'Shared') return
      out.push({
        id: `ap-${a.id}`,
        text: `Get ready for ${a.purpose.toLowerCase()} with ${personName(a.professionalId)}`,
        why: `It is on ${formatDate(a.datetime.slice(0, 10))}, ${away === 0 ? 'today' : `in ${away} days`}, and the brief is ${a.preparationStatus.toLowerCase()}. You see it before anyone else does.`,
        to: `/patient/care/appointments/${a.id}/prepare`,
        order: away <= 3 ? 0 : 2,
      })
    })

  documentsFor(patientId)
    .filter((d) => d.status === 'Awaiting review')
    .forEach((d) =>
      out.push({
        id: `doc-${d.id}`,
        text: `Check what was read out of ${d.title}`,
        why: `It was uploaded on ${formatDate(d.date)} and ${d.extracted.filter((e) => !e.accepted).length} extracted item(s) are still unaccepted. Nothing from it is in your record until you say so.`,
        to: `/patient/documents/${d.id}`,
        order: 3,
      }),
    )

  return out.sort((a, b) => a.order - b.order)
}

function forProfessional(role: Role, base: string): Suggestion[] {
  const out: Suggestion[] = []

  patientsFor(role).forEach((p) => {
    appointmentsFor(p.id)
      .filter((a) => a.status !== 'Completed')
      .forEach((a) => {
        const away = daysFromToday(a.datetime.slice(0, 10))
        if (away < 0 || away > 7) return
        out.push({
          id: `prep-${a.id}`,
          text: `Prepare for ${patientName(p.id)} — ${a.purpose.toLowerCase()}`,
          why: `${away === 0 ? 'Today' : `In ${away} days`}, ${formatDate(a.datetime.slice(0, 10))}. The brief is ${a.preparationStatus.toLowerCase()}.`,
          action: <PrepareSessionButton patientId={p.id} />,
          order: away <= 1 ? 0 : 1,
        })
      })

    strategiesFor(p.id)
      .filter((s) => s.status === 'Active' && daysFromToday(s.reviewDate) <= 7)
      .forEach((s) =>
        out.push({
          id: `srev-${s.id}`,
          text: `${patientName(p.id)} — ${s.title} is due for review`,
          why: `Review date ${formatDate(s.reviewDate)}, with ${s.checkIns.length} check-in(s) recorded. ${
            s.outcome?.proposedAdaptation
              ? 'An adaptation has already been proposed.'
              : 'No outcome has been written yet.'
          }`,
          to: `${base}/patients/${p.id}`,
          order: daysFromToday(s.reviewDate) < 0 ? 0 : 2,
        }),
      )
  })

  const patterns = memoryCandidates.filter((m) => m.raisedFor.includes(role))
  if (patterns.length) {
    out.push({
      id: 'patterns',
      text: `Confirm or reject ${patterns.length} proposed pattern${patterns.length === 1 ? '' : 's'}`,
      why: 'These are ORCA’s readings of repeated observations. None of them is in anyone’s record until a person confirms it.',
      to: `${base}/memory`,
      order: 3,
    })
  }

  return out.sort((a, b) => a.order - b.order)
}
