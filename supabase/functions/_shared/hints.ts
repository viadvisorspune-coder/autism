/**
 * Turning a phrase in the question into a value the retrieval can filter on.
 *
 * The chatbot's tool description asks its agent to work out `since` from a
 * time period and `categories` from a topic — by reading the question and
 * inferring them. Those are the two least suitable things to leave to
 * inference. "Since May" has exactly one correct ISO date given today's date,
 * and "about work" maps to exactly one category in a fixed list. A model
 * asked to derive them will usually be right and occasionally silently wrong,
 * and a wrong `since` narrows a medical record without telling anybody it did.
 *
 * So they are derived here, deterministically, and passed in the trigger as
 * labelled fields alongside the identifiers. The agent stops guessing and
 * starts copying, which is the same move that fixed identity.
 *
 * AMBIGUITY MEANS SILENCE. Every function below returns null rather than a
 * best guess when the phrase is unclear. An omitted hint leaves the agent to
 * read the question as it always did; a confidently wrong hint quietly
 * excludes part of somebody's record from an answer that then reports what it
 * found as though that were everything. Those failures are not comparable, so
 * the bar for emitting one is high.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const iso = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * The date a question means by "since ...", anchored to the day it was asked.
 *
 * Anchored rather than taken from the clock because a trigger states its own
 * date, and a run replayed or re-read later must resolve to the same window it
 * did originally. A relative period that drifts is a filter that silently
 * changes what an answer was based on.
 */
export function sinceFrom(message: string, asOf: Date): string | null {
  const m = message.toLowerCase()

  // "since May", "since May 2026", "from March"
  const named = m.match(
    /\b(?:since|from|after)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/,
  )
  if (named) {
    const month = MONTHS.indexOf(named[1])
    const year = named[2] ? Number(named[2]) : asOf.getUTCFullYear()
    const candidate = new Date(Date.UTC(year, month, 1))
    /**
     * A bare month name means the most recent one that has already happened.
     *
     * "Since May" asked in March means last May, not a date seven weeks in the
     * future. Reading it forwards produces an empty window and an answer that
     * says nothing has changed, which is a confident lie rather than an error.
     */
    if (!named[2] && candidate > asOf) candidate.setUTCFullYear(year - 1)
    return iso(candidate)
  }

  // "in the last three months", "over the past 6 weeks"
  const WORD_NUMBERS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
  }
  const relative = m.match(
    /\b(?:last|past|previous)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month|year)s?\b/,
  )
  if (relative) {
    const n = Number(relative[1]) || WORD_NUMBERS[relative[1]]
    if (!n) return null
    const d = new Date(asOf)
    if (relative[2] === 'day') d.setUTCDate(d.getUTCDate() - n)
    if (relative[2] === 'week') d.setUTCDate(d.getUTCDate() - n * 7)
    if (relative[2] === 'month') d.setUTCMonth(d.getUTCMonth() - n)
    if (relative[2] === 'year') d.setUTCFullYear(d.getUTCFullYear() - n)
    return iso(d)
  }

  // "in the last month", "over the past week" — the same, with n implied as 1.
  const singular = m.match(/\b(?:last|past|previous)\s+(day|week|month|year)\b/)
  if (singular) {
    const d = new Date(asOf)
    if (singular[1] === 'day') d.setUTCDate(d.getUTCDate() - 1)
    if (singular[1] === 'week') d.setUTCDate(d.getUTCDate() - 7)
    if (singular[1] === 'month') d.setUTCMonth(d.getUTCMonth() - 1)
    if (singular[1] === 'year') d.setUTCFullYear(d.getUTCFullYear() - 1)
    return iso(d)
  }

  /**
   * "Recently" and "lately" are deliberately not resolved.
   *
   * They have no single correct answer — a fortnight to one person, six months
   * to another — and picking one silently narrows the record. Better to send
   * no window and let the retrieval return what it holds.
   */
  return null
}

/**
 * The record categories a question is about.
 *
 * Matched against the vocabulary the record actually uses, not a general topic
 * model. A word that maps to no category yields nothing, which returns the
 * whole record rather than an arbitrary slice of it.
 */
const CATEGORY_WORDS: [RegExp, string][] = [
  [/\bwork\b|\bjob\b|\bemployer\b|\boffice\b|\bcommute\b|\bworkplace\b|\bmanager\b/, 'Work'],
  [/\buniversity\b|\buni\b|\bcourse\b|\blecture\b|\bstudy\b|\bacademic\b|\bcampus\b/, 'University'],
  [/\bmedication\b|\bdiagnosis\b|\bclinical\b|\bdose\b|\bprescription\b|\bappointment\b/, 'Clinical'],
  [/\bsupport\b|\bstrateg|\badjustment\b|\baccommodation\b/, 'Support'],
  [/\bsleep\b|\bmorning\b|\broutine\b|\benergy\b|\bconcentration\b|\bsensory\b|\bovervhelm/, 'Functional'],
  [/\bfamily\b|\bhome\b|\bpersonal\b|\bfriend\b/, 'Personal'],
]

export function categoriesFrom(message: string): string[] {
  const m = message.toLowerCase()
  const hit = CATEGORY_WORDS.filter(([pattern]) => pattern.test(m)).map(([, name]) => name)
  /**
   * Three or more matches means the question was broad, not specific.
   *
   * "How have work, uni and my medication been?" is asking across the record,
   * and narrowing to three named categories would exclude everything else
   * while looking deliberate. Past two, sending nothing is the more faithful
   * reading of the question.
   */
  return hit.length && hit.length <= 2 ? [...new Set(hit)] : []
}

/**
 * What kind of document is being asked for.
 *
 * Only ever used on a lane that produces one, and only when the word is in the
 * request. The fallback stays "summary", which is what it has always been —
 * this replaces a fixed default with the person's own word where they used one.
 */
const ARTIFACT_WORDS: [RegExp, string][] = [
  [/\bhandover\b/, 'handover'],
  [/\bletter\b/, 'letter'],
  [/\breport\b/, 'report'],
  [/\bbrief\b/, 'brief'],
  [/\bplan\b/, 'support plan'],
  [/\brequest\b/, 'request'],
  [/\bsummary\b|\bsummarise\b|\bsummarize\b/, 'summary'],
]

export function artifactFrom(message: string): string | null {
  const m = message.toLowerCase()
  for (const [pattern, name] of ARTIFACT_WORDS) if (pattern.test(m)) return name
  return null
}
