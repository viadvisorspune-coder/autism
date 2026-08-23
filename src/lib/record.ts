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
export function whatChanged(patientId: string, withinDays = 45): string[] {
  const lines: string[] = []

  for (const s of strategiesFor(patientId)) {
    const recent = s.checkIns.filter((c) => daysBetween(c.date) <= withinDays)
    if (!recent.length) continue
    const unhelpful = recent.filter((c) => c.helpfulness === 'Did not help')
    if (unhelpful.length) {
      lines.push(
        `${s.title}: ${unhelpful.length} of ${recent.length} check-ins reported no benefit, most recently ${on(unhelpful[unhelpful.length - 1].date)}.`,
      )
    } else {
      lines.push(`${s.title}: ${recent.length} check-ins, all reporting some benefit.`)
    }
  }

  for (const r of requestsFor(patientId)) {
    if (r.status === 'Completed') continue
    lines.push(`${r.title} is ${String(r.status).toLowerCase()}.`)
  }

  for (const e of eventsFor(patientId).slice(0, 6)) {
    if (daysBetween(e.date) > withinDays) continue
    if (e.category === 'Support' || e.category === 'Documents') continue
    lines.push(`${e.title} — ${on(e.date)}, from ${sourceLabel(e)}.`)
  }

  return lines.slice(0, 5)
}

const sourceLabel = (e: TimelineEvent) => (e.sourceId === 'orca' ? 'ORCA' : personName(e.sourceId))

/**
 * The last time anybody wrote into this record, and who.
 *
 * "Last contact" on a caseload row used to be a literal date string for one
 * patient and an em-dash for everybody else.
 */
export function lastContact(patientId: string): { date: string; by: string } | null {
  const events = eventsFor(patientId)
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
  const events = eventsFor(patientId)
  const strategies = strategiesFor(patientId)
  const notes = sessionNotes.filter((n) => n.patientId === patientId)
  const profile = profileFor(patientId)
  const open = requestsFor(patientId).filter((r) => r.status !== 'Completed')

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

/** Next thing in the diary that has not already happened. */
export const nextAppointment = (patientId: string) =>
  appointmentsFor(patientId).find((a) => a.status !== 'Completed') ?? null

/** Counts for the hub's tab bar, so a tab can say how much is behind it. */
export function recordCounts(patientId: string, role: Role) {
  return {
    timeline: eventsFor(patientId).length,
    support: strategiesFor(patientId).filter((s) => s.status !== 'Completed').length,
    documents: documentsFor(patientId).filter((d) => d.access.includes(role)).length,
    requests: requestsFor(patientId).filter((r) => r.status !== 'Completed').length,
    calendar: appointmentsFor(patientId).filter((a) => a.status !== 'Completed').length,
  }
}
