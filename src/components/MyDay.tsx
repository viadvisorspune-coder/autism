import { Link } from 'react-router-dom'
import { Card, CardBody, formatDate } from './ui'
import { PrepareSessionButton } from './PrepareSession'
import { PersonLink } from './shared'
import { useSession } from '../state/session'
import {
  TODAY,
  appointments,
  patientName,
  patientsFor,
  personName,
  requestsFor,
  strategiesFor,
} from '../data/db'

/**
 * My day.
 *
 * A clinician arriving at nine wants one screen that answers "what am I doing
 * today, and what is about to become a problem". Not a caseload, not a set of
 * filters over a caseload — the actual day, in order, with the preparation
 * attached to each item rather than three clicks away from it.
 *
 * The second half is the part worth having: work that is not yet late.
 * "Three patients have outcomes due this week" is a sentence no list view ever
 * produces, because a list shows you rows and leaves the counting to you. This
 * counts across the caseload and states the finding, which is the difference
 * between a database and an assistant.
 *
 * Every number is arrived at from dates in the record and says which patients
 * it means, because a count you cannot expand is a claim you cannot check.
 */

const DAY = 86_400_000
const daysOut = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / DAY)

interface Finding {
  id: string
  headline: string
  who: string[]
  to: string
}

export function MyDay() {
  const { role, option } = useSession()
  if (!role || !option) return null
  const base = option.home

  const mine = patientsFor(role)
  const ids = new Set(mine.map((p) => p.id))

  const today = appointments
    .filter((a) => a.datetime.startsWith(TODAY) && ids.has(a.patientId))
    .sort((a, b) => a.datetime.localeCompare(b.datetime))

  const findings = findingsFor(mine.map((p) => p.id), base)

  if (!today.length && !findings.length) return null

  return (
    <div className="mb-8 grid gap-5 lg:grid-cols-2">
      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.95rem] font-semibold text-ink">My day</h2>
            <span className="text-[0.79rem] text-muted">{formatDate(TODAY)}</span>
          </div>

          {today.length ? (
            <ul className="space-y-3">
              {today.map((a) => (
                <li key={a.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.89rem] font-medium text-ink">
                        {a.datetime.slice(11, 16)} · <PersonLink patientId={a.patientId} />
                      </p>
                      <p className="text-[0.83rem] leading-relaxed text-ink-2">{a.purpose}</p>
                      <p className="text-[0.78rem] text-muted">
                        {a.location} · brief {a.preparationStatus.toLowerCase()}
                      </p>
                    </div>
                    <PrepareSessionButton patientId={a.patientId} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.85rem] leading-relaxed text-muted">
              No appointments today. The findings beside this are the work that is not yet late.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-1 text-[0.95rem] font-semibold text-ink">Coming down the line</h2>
          <p className="mb-3 text-[0.83rem] leading-relaxed text-muted">
            Counted across your caseload from dates in the record. None of it is overdue yet.
          </p>

          {findings.length ? (
            <ul className="space-y-3">
              {findings.map((f) => (
                <li key={f.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <Link to={f.to} className="text-[0.89rem] font-medium text-ink hover:underline">
                    {f.headline}
                  </Link>
                  <p className="mt-0.5 text-[0.82rem] leading-relaxed text-ink-2">
                    {f.who.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.85rem] text-muted">Nothing falls due in the next week.</p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

/**
 * The counting.
 *
 * Each finding names the patients behind it. A dashboard number nobody can
 * expand into the rows that produced it is how people end up trusting a figure
 * that was wrong for a fortnight.
 */
function findingsFor(patientIds: string[], base: string): Finding[] {
  const out: Finding[] = []

  const outcomesDue: string[] = []
  const quiet: string[] = []
  const unanswered: string[] = []

  patientIds.forEach((id) => {
    strategiesFor(id).forEach((s) => {
      if (s.status !== 'Active') return
      const due = daysOut(s.reviewDate)
      if (due >= 0 && due <= 7) outcomesDue.push(`${patientName(id)} — ${s.title}`)

      const last = s.checkIns.map((c) => c.date).sort().pop()
      if (!last || -daysOut(last) >= 14) quiet.push(`${patientName(id)} — ${s.title}`)
    })

    requestsFor(id).forEach((r) =>
      r.clarifications
        .filter((c) => !c.answer)
        .forEach(() => unanswered.push(`${patientName(id)} — ${r.destination}`)),
    )
  })

  if (outcomesDue.length) {
    out.push({
      id: 'outcomes',
      headline: `${outcomesDue.length} outcome${outcomesDue.length === 1 ? '' : 's'} due this week`,
      who: outcomesDue,
      to: `${base}/outcomes`,
    })
  }

  if (quiet.length) {
    out.push({
      id: 'quiet',
      headline: `${quiet.length} strateg${quiet.length === 1 ? 'y has' : 'ies have'} gone quiet`,
      who: quiet.map((q) => `${q} — no check-in in a fortnight`),
      to: `${base}/strategies`,
    })
  }

  if (unanswered.length) {
    out.push({
      id: 'unanswered',
      headline: `${unanswered.length} question${unanswered.length === 1 ? '' : 's'} nobody has answered`,
      who: unanswered,
      to: `${base}/coordination`,
    })
  }

  return out
}

/** Kept so the dashboard can name who is on the list without importing db. */
export const dayPeople = personName
