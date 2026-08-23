/**
 * What a record actually says, derived rather than written down.
 *
 * The patient overview used to hold paragraphs of prose about one person —
 * "two strategy check-ins reported no benefit", "an OT visit took place on
 * 4 August" — rendered for whoever you opened. A clinician opening their
 * second patient read their first patient's month with the wrong name on top.
 * It looked like a working screen, which is the dangerous kind of wrong.
 *
 * Everything here is computed from that patient's own rows. Where there is
 * nothing to say it says nothing, because an empty record and a borrowed one
 * must not look the same.
 */
import {
  TODAY,
  appointmentsFor,
  documentsFor,
  eventsFor,
  personName,
  profileFor,
  requestsFor,
  sessionNotes,
  strategiesFor,
  tasks,
} from '../data/db'
import type { Role, TimelineEvent } from '../data/types'

const DAY = 86_400_000

/**
 * Who is entitled to the clinical shape of a record.
 *
 * Everything below takes a role, because this module feeds a screen that every
 * stakeholder now reaches. An employer opening the record hub was shown the
 * psychologist's check-in history, the university's request, the name of the
 * occupational therapist and a count of twelve timeline events they could not
 * open — the count itself being a disclosure, since "twelve things exist about
 * this person" is information they were never given.
 */
const CLINICAL = new Set<Role>(['psychologist', 'psychiatrist', 'therapist', 'ot', 'gp', 'clinic'])

export const daysBetween = (from: string, to: string = TODAY) =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY)

/** Human date without importing the whole formatting layer. */
function on(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/**
 * What has moved in this record lately, in sentences, from the rows.
 *
 * Ordered by recency and capped, because a "what changed" list of fourteen
 * things has not summarised anything.
 */
export function whatChanged(patientId: string, role: Role, withinDays = 45): string[] {
  const lines: string[] = []
  const clinical = CLINICAL.has(role)

  // A strategy has no per-role visibility of its own, so anybody outside the
  // clinical team gets none of them here. Their own agreed adjustments still
  // appear, through the lens below, which is scoped to what they asked for.
  for (const s of clinical ? strategiesFor(patientId) : []) {
    const recent = s.checkIns.filter((c) => daysBetween(c.date) <= withinDays)
    if (!recent.length) continue
    const unhelpful = recent.filter((c) => c.helpfulness === 'Did not help')
    if (unhelpful.length) {
      lines.push(
        `${s.title}: ${unhelpful.length} of ${recent.length} ${recent.length === 1 ? 'check-in' : 'check-ins'} reported no benefit, most recently ${on(unhelpful[unhelpful.length - 1].date)}.`,
      )
    } else {
      lines.push(
        `${s.title}: ${recent.length} ${recent.length === 1 ? 'check-in' : 'check-ins'}, all reporting some benefit.`,
      )
    }
  }

  for (const r of requestsFor(patientId)) {
    if (r.status === 'Completed') continue
    // A request to somebody else is that person's business, not this reader's.
    if (!clinical && r.destinationRole !== role) continue
    lines.push(`${r.title} is ${String(r.status).toLowerCase()}.`)
  }

  for (const e of visibleEvents(patientId, role).slice(0, 6)) {
    if (daysBetween(e.date) > withinDays) continue
    if (e.category === 'Support' || e.category === 'Documents') continue
    lines.push(`${e.title} — ${on(e.date)}, from ${sourceLabel(e)}.`)
  }

  return lines.slice(0, 5)
}

const sourceLabel = (e: TimelineEvent) => (e.sourceId === 'orca' ? 'ORCA' : personName(e.sourceId))

/** The only way this module reads a timeline. Scoped at the source. */
export const visibleEvents = (patientId: string, role: Role) =>
  eventsFor(patientId).filter((e) => e.visibleTo.includes(role))

/**
 * The last time anybody wrote into this record, and who.
 *
 * "Last contact" on a caseload row used to be a literal date string for one
 * patient and an em-dash for everybody else.
 */
export function lastContact(patientId: string, role: Role): { date: string; by: string } | null {
  const events = visibleEvents(patientId, role)
  if (!events.length) return null
  const newest = [...events].sort((a, b) => b.date.localeCompare(a.date))[0]
  return { date: newest.date, by: sourceLabel(newest) }
}

/**
 * The one thing this role opened the record to find.
 *
 * Every role used to get the same six-row clinical panel whether they were
 * entitled to it or not. This asks the record instead, and returns nothing
 * when the record holds nothing — which is a truthful answer.
 */
export function roleLens(
  role: Role,
  patientId: string,
): { title: string; items: { label: string; value: string }[] } | null {
  const events = visibleEvents(patientId, role)
  const strategies = strategiesFor(patientId)
  const notes = sessionNotes.filter((n) => n.patientId === patientId)
  const profile = profileFor(patientId)
  // An employer must not read the request that went to the university, even
  // as a title — "functional summary for university adjustment review" tells
  // them this person is a student and is asking for help there.
  const open = requestsFor(patientId).filter(
    (r) => r.status !== 'Completed' && (CLINICAL.has(role) || r.destinationRole === role),
  )

  const clinical = events.filter((e) => e.category === 'Clinical')
  const functional = events.filter((e) => e.category === 'Functional')
  const goals = profile.filter((p) => p.section === 'Current goals')

  const say = (xs: string[]) => (xs.length ? xs.join(' · ') : 'Nothing recorded')

  switch (role) {
    case 'psychiatrist':
      return {
        title: 'Clinical overview',
        items: [
          { label: 'Clinical history', value: say(clinical.slice(0, 3).map((e) => `${e.title} (${on(e.date)})`)) },
          { label: 'Functional context', value: say(functional.slice(0, 2).map((e) => e.title)) },
          { label: 'Current concerns', value: say(goals.slice(0, 2).map((g) => g.text)) },
          { label: 'Professional input', value: say(notes.map((n) => `${personName(n.professionalId)}, ${on(n.date)}`)) },
        ],
      }
    case 'gp':
      return {
        title: 'Relevant health summary',
        items: [
          { label: 'Relevant history', value: say(clinical.slice(0, 2).map((e) => e.title)) },
          { label: 'Current concerns', value: say(goals.slice(0, 2).map((g) => g.text)) },
          { label: 'Who else is involved', value: say([...new Set(notes.map((n) => personName(n.professionalId)))]) },
          { label: 'Open with others', value: say(open.map((r) => r.title)) },
        ],
      }
    case 'ot':
      return {
        title: 'Functional and environmental picture',
        items: [
          { label: 'Environment', value: say(functional.slice(0, 3).map((e) => `${e.title} (${on(e.date)})`)) },
          { label: 'Adaptations in place', value: say(strategies.filter((s) => s.status !== 'Completed').map((s) => s.title)) },
          { label: 'What helps', value: say(profile.filter((p) => p.section === 'What helps me').slice(0, 2).map((p) => p.text)) },
        ],
      }
    case 'employer':
    case 'university':
      return {
        title: role === 'university' ? 'Agreed academic adjustments' : 'Agreed adjustments',
        items: [
          { label: 'Open requests', value: say(open.map((r) => `${r.title} (${r.status})`)) },
          { label: 'In place', value: say(strategies.filter((s) => s.status === 'Active').map((s) => s.title)) },
          { label: 'Shared with you', value: `${documentsFor(patientId).filter((d) => d.access.includes(role)).length} documents` },
        ],
      }
    case 'psychologist':
    case 'therapist':
      return {
        title: 'Where the work is',
        items: [
          { label: 'Current goals', value: say(goals.map((g) => g.text)) },
          { label: 'Live strategies', value: say(strategies.filter((s) => s.status !== 'Completed').map((s) => s.title)) },
          { label: 'Last session', value: notes.length ? `${personName(notes[0].professionalId)}, ${on(notes[0].date)}` : 'None recorded' },
          { label: 'Open tasks', value: String(tasks.filter((t) => t.patientId === patientId).length) },
        ],
      }
    default:
      return null
  }
}

/**
 * Next thing in the diary, for readers who are entitled to a diary.
 *
 * An employer does not get "Review of workplace transitions, with Dr Kavita
 * Nair" — the purpose and the clinician's name together say more about
 * somebody's care than an employer has any business reading.
 */
export const nextAppointment = (patientId: string, role: Role) =>
  CLINICAL.has(role) || role === 'patient'
    ? appointmentsFor(patientId).find((a) => a.status !== 'Completed') ?? null
    : null

/**
 * What is actually waiting on this person, from their own record.
 *
 * The home screen carried three follow-ups written into the markup — a
 * strategy id, an appointment id and a fixed date — so every patient was shown
 * the same three chores about somebody else's week, two of which linked to
 * rows they did not own. A to-do list that is wrong is worse than no to-do
 * list, because it is the part of the screen people trust most.
 */
export function followUps(patientId: string): { text: string; due: string; to: string }[] {
  const out: { text: string; due: string; to: string; sort: string }[] = []

  for (const s of strategiesFor(patientId)) {
    if (s.status === 'Completed') continue
    const last = s.checkIns[s.checkIns.length - 1]
    // Nothing said about it for a fortnight is the thing worth asking about.
    if (!last || daysBetween(last.date) >= 14) {
      out.push({
        text: `Say how ${s.title.toLowerCase()} is going`,
        due: last ? `Last noted ${on(last.date)}` : 'Not started yet',
        to: `/patient/support/${s.id}`,
        sort: last?.date ?? '0000-00-00',
      })
    }
    if (daysBetween(s.reviewDate) > -14 && daysBetween(s.reviewDate) < 0) {
      out.push({
        text: `${s.title} comes up for review`,
        due: `Due ${on(s.reviewDate)}`,
        to: `/patient/support/${s.id}`,
        sort: s.reviewDate,
      })
    }
  }

  for (const a of appointmentsFor(patientId)) {
    if (a.status === 'Completed') continue
    if (!a.questions.length) {
      out.push({
        text: `Add anything you want to raise at ${a.purpose.toLowerCase()}`,
        due: `Before ${on(a.datetime)}`,
        to: `/patient/care/appointments/${a.id}`,
        sort: a.datetime,
      })
    }
  }

  for (const r of requestsFor(patientId)) {
    for (const c of r.clarifications ?? []) {
      if (c.answer) continue
      out.push({
        text: `Answer a question about ${r.title.toLowerCase()}`,
        due: 'Somebody is waiting',
        to: `/patient/requests/${r.id}`,
        sort: '0000-00-00',
      })
    }
  }

  return out
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .slice(0, 4)
    .map(({ text, due, to }) => ({ text, due, to }))
}

/** Counts for the hub's tab bar, so a tab can say how much is behind it. */
export function recordCounts(patientId: string, role: Role) {
  const clinical = CLINICAL.has(role) || role === 'patient'
  return {
    timeline: visibleEvents(patientId, role).length,
    support: clinical ? strategiesFor(patientId).filter((s) => s.status !== 'Completed').length : 0,
    documents: documentsFor(patientId).filter((d) => d.access.includes(role)).length,
    requests: requestsFor(patientId).filter(
      (r) => r.status !== 'Completed' && (clinical || r.destinationRole === role),
    ).length,
    calendar: clinical ? appointmentsFor(patientId).filter((a) => a.status !== 'Completed').length : 0,
  }
}

/** Which tabs this role has any business opening at all. */
export function visibleTabs(role: Role): string[] {
  if (CLINICAL.has(role) || role === 'patient') {
    return ['Overview', 'Timeline', 'Support', 'Documents', 'Requests', 'Diary']
  }
  // An employer, a university, a trusted person: what was asked of them, what
  // they were given, and the part of the history that names them.
  return ['Overview', 'Timeline', 'Documents', 'Requests']
}
