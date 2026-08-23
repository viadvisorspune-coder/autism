/**
 * Deciding, in the browser, what a message actually needs.
 *
 * Everything typed into ORCA used to go straight to the workflow service, and
 * the person waited. That was wrong in both directions. "Who is Tejas?" is a
 * lookup — the answer is in the record already loaded in this tab, and sending
 * it away to be reasoned about for three minutes, then answered with a PDF, is
 * a worse version of a question the browser could have answered instantly.
 * Meanwhile "ask my employer for a quiet room" genuinely does need the
 * workflow: it changes something, it reaches another person, and it has to pass
 * consent and authority checks that do not belong in a browser.
 *
 * So the front decides first, and it decides on the only distinction that
 * matters to the person waiting:
 *
 *   answer — the record can say this. Said here, now, with sources.
 *   act    — this asks for something to happen. Answered here, and the
 *            workflow is started quietly behind it.
 *   unsure — nothing in the record matched. Said plainly, and the person is
 *            offered the slow path rather than put on it.
 *
 * The classifier is deliberately conservative about `act`. Getting it wrong in
 * that direction starts work nobody asked for, which is the failure this whole
 * product exists to prevent; getting it wrong the other way costs one button
 * press. So an action needs both a verb that does something and a thing to do
 * it to or with — a recipient, or an artefact.
 */

export type Lane = 'answer' | 'act' | 'unsure'

/** Doing something, rather than knowing something. */
const ACT_VERB =
  /\b(send|share|ask|tell|email|write|draft|request|apply|book|arrange|schedule|notify|inform|submit|generate|produce|create|prepare|put together|set up|start|raise)\b/i

/** Somebody outside this record who would receive it. */
const RECIPIENT =
  /\b(employer|hr|manager|line manager|university|tutor|college|gp|doctor|clinic|clinician|psychologist|psychiatrist|therapist|occupational health|my team|them)\b/i

/** Something that has to be produced before it can be sent. */
const ARTEFACT =
  /\b(letter|report|summary|brief|document|plan|request|form|accommodation|adjustment|referral|note)\b/i

/** Asking for it, as opposed to asking about it. */
const INTENT = /\b(can you|could you|would you|please|i want to|i need to|i'?d like|help me|let'?s)\b/i

/** A question about what already happened is never an instruction. */
const LOOKUP_OPENER = /^\s*(who|what|when|where|why|how|which|is|are|was|were|do|does|did|has|have|can i)\b/i

export function laneFor(text: string, matched: boolean): Lane {
  const acts = ACT_VERB.test(text) && (RECIPIENT.test(text) || ARTEFACT.test(text))
  const asked = INTENT.test(text)

  // "What did my employer say" opens like a question and names a recipient, but
  // it is not an instruction and must not start anything.
  if (acts && (asked || !LOOKUP_OPENER.test(text))) return 'act'

  return matched ? 'answer' : 'unsure'
}

/**
 * What ORCA says when it has started something.
 *
 * Not the name of the service, not the step it is on, not how long the queue
 * is. What it is doing, that the person does not have to wait, and that
 * nothing has left ORCA yet — which is the thing they actually want to know
 * before a message goes to their employer.
 */
export function startedLine(concise: boolean): string {
  return concise
    ? 'I have started that. It will appear here — you do not have to wait.'
    : 'I have started working on that. It will turn up here when there is something to see, so you do not need to wait on this screen. Nothing has been sent to anyone yet — you will see it before they do.'
}
