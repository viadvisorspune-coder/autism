/**
 * The question a clinician actually has between appointments.
 *
 * Never "tell me about Ananya" — they know about Ananya. It is "which of these
 * twelve needs me first", and until now the only way to answer it was to open
 * twelve records in turn, which is not answering it.
 *
 * What comes back is counts and dates, never content. Enough to decide who to
 * open; opening them goes through the ordinary per-record path with its
 * ordinary checks. And every count is scoped to what that particular patient
 * shared with this particular person — twelve patients means twelve separate
 * consent decisions, and they do not agree with each other.
 *
 * `null` is load-bearing here. A count this person may not see comes back
 * absent, not zero, and is said as "not shared with you" rather than "none".
 * Zero is a claim about somebody's record; null is an honest refusal.
 */

export interface CaseloadRow {
  patient_id: string
  name: string
  relationship: string
  purpose: string
  scope: string[]
  active_strategies: number | null
  stale_strategy: { title: string; since: string | null } | null
  open_requests: number | null
  requests_needing_them: number | null
  next_appointment: { at: string; status: string; brief: string } | null
  waiting_on_you: number
  last_activity: string | null
  review_due: string | null
}

export interface Caseload {
  patients: CaseloadRow[]
  as_of: string
}

/** Questions that are about the caseload rather than about one person. */
const ABOUT_EVERYONE =
  /\b(my (patients|caseload|clients|students|employees|list)|everyone|all of them|which (patient|one|of them)|who (needs|is|should)|anyone|any of (them|my)|across (my|the) (caseload|patients))\b/i

export function asksAboutCaseload(question: string): boolean {
  return ABOUT_EVERYONE.test(question)
}

const DAY = 86_400_000

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / DAY)
}

export interface Flag {
  row: CaseloadRow
  /** Said the way a colleague would say it, not as a field name. */
  reason: string
  weight: number
}

/**
 * Who needs this person, and why, in one sentence each.
 *
 * Ordered by what it costs to ignore. A decision sitting in somebody's queue
 * blocks a workflow and another person's day; a strategy nobody has checked on
 * in three weeks is quietly producing no evidence; an unprepared appointment
 * tomorrow is a wasted hour that is already booked.
 *
 * A row with nothing wrong produces nothing. A caseload summary that finds
 * something to say about all twelve people is a list, and a list is what this
 * exists to replace.
 */
export function needsAttention(caseload: Caseload | null): Flag[] {
  const flags: Flag[] = []

  for (const row of caseload?.patients ?? []) {
    if (row.waiting_on_you > 0) {
      flags.push({
        row,
        reason: `${row.waiting_on_you} decision${row.waiting_on_you === 1 ? '' : 's'} waiting on you`,
        weight: 100,
      })
      continue
    }

    if (row.requests_needing_them && row.requests_needing_them > 0) {
      flags.push({
        row,
        reason: `${row.requests_needing_them} request${row.requests_needing_them === 1 ? ' has' : 's have'} an unanswered question`,
        weight: 80,
      })
      continue
    }

    const soon = row.next_appointment ? daysSince(row.next_appointment.at) : null
    if (row.next_appointment && soon !== null && soon >= -2 && soon <= 0) {
      if (row.next_appointment.brief === 'Not started') {
        flags.push({
          row,
          reason: soon === 0 ? 'seeing you today, and the brief is not started' : 'seeing you within two days, brief not started',
          weight: 70,
        })
        continue
      }
    }

    // A running strategy nobody has checked on is producing no evidence, and
    // will be reviewed on a date that arrives with nothing to review.
    if (row.stale_strategy) {
      const quiet = daysSince(row.stale_strategy.since)
      if (quiet === null) {
        flags.push({
          row,
          reason: `${row.stale_strategy.title.toLowerCase()} has no check-ins at all`,
          weight: 60,
        })
        continue
      }
      if (quiet >= 14) {
        flags.push({
          row,
          reason: `${row.stale_strategy.title.toLowerCase()} — nothing recorded for ${quiet} days`,
          weight: 40 + Math.min(quiet, 60) / 4,
        })
        continue
      }
    }

    const quiet = daysSince(row.last_activity)
    if (quiet !== null && quiet >= 45) {
      flags.push({ row, reason: `nothing in the record for ${quiet} days`, weight: 20 })
    }
  }

  return flags.sort((a, b) => b.weight - a.weight)
}

/** Whose consent is about to lapse — a different kind of urgent. */
export function lapsingSoon(caseload: Caseload | null, withinDays = 30): CaseloadRow[] {
  return (caseload?.patients ?? []).filter((row) => {
    if (!row.review_due) return false
    const days = -(daysSince(row.review_due) ?? 0)
    return days >= 0 && days <= withinDays
  })
}
