/**
 * Choosing which of the five paths a request takes.
 *
 * The paths, and what each is for:
 *
 *   UNDERSTAND alone         a question about the record. Answer read in chat,
 *                            nothing produced, nothing sent.
 *   PRODUCE alone            a document, when evidence already exists from a
 *                            recent run. No retrieval, no reasoning — draft,
 *                            review, approve.
 *   UNDERSTAND → PRODUCE     a document requested cold. Both fire in sequence
 *                            and the person sees one result.
 *   15-step                  a formal document for an external party, where
 *                            the whole governance chain runs and the output is
 *                            a PDF.
 *   CHATBOT                  something already answered. Replays stored output
 *                            scoped to this actor and purpose. No reasoning.
 *
 * TWO OF THESE CANNOT BE DECIDED FROM THE WORDING. "Already answered" and
 * "evidence already exists" are facts about the record, not about the
 * sentence — so this file takes them as inputs and the caller, which can
 * query, supplies them. Trying to read them off the text is how a replay lane
 * ends up serving a stale answer to a new question.
 *
 * NO MODEL DECIDES THIS. Routing that a person can read and predict is worth
 * more than routing that is occasionally cleverer: a wrong guess costs a whole
 * extra workflow run, the interface shows the choice before it acts, and a
 * rule nobody can inspect is a rule nobody can correct.
 */

export type Path =
  | 'understand_only'
  | 'produce_only'
  | 'understand_then_produce'
  | 'fifteen_step'
  | 'chatbot_replay'

export type Lane = 'understand' | 'produce' | 'chat' | 'fifteen'

export interface Plan {
  path: Path
  /** The lane to start now. */
  lane: Lane
  /** The lane to run when that one finishes, for a chained path. */
  then: Lane | null
  /** One sentence, in plain words, shown to the person before anything runs. */
  reason: string
}

/* --------------------------------------------------------------- signals */

const DOCUMENT_VERB =
  /\b(send|share|prepare|draft|write|compose|put together|summarise for|summarize for)\b/i
const DOCUMENT_NOUN =
  /\b(handover|summary|request|letter|report|brief|plan|note for|document)\b/i

export const wantsDocument = (message: string): boolean =>
  DOCUMENT_VERB.test(message) || DOCUMENT_NOUN.test(message)

/**
 * Roles outside the care relationship.
 *
 * A document going to one of these is a disclosure to an organisation rather
 * than a note between people looking after the same person, which is what the
 * full governance chain exists for. The list is roles, not judgement about the
 * request: an employer receiving a one-line note is still an employer.
 */
const EXTERNAL_ROLES = new Set(['employer', 'university', 'statutory', 'clinic'])

/**
 * Words that mark a document as formal regardless of who receives it.
 *
 * Kept small on purpose. Every term here escalates a request to the longest
 * and most expensive path, so a loose list would send ordinary handovers
 * through a fifteen-step governance chain and make the product feel heavy for
 * no benefit.
 */
const FORMAL = /\b(formal|official|statutory|legal|tribunal|occupational health|pdf|on letterhead)\b/i

export interface RoutingFacts {
  /** Whose eyes: used only to tell an external disclosure from an internal note. */
  recipientRole?: string | null
  /**
   * A completed run for this actor and subject, recent enough that its
   * retrieval still stands. Supplied by the caller from the record.
   */
  recentEvidenceRunId?: string | null
  /**
   * A completed run whose question matches this one closely enough to replay,
   * for this actor and purpose. Supplied by the caller from the record.
   */
  alreadyAnsweredRunId?: string | null
  /** Lanes that are actually configured, so a plan never names a dead one. */
  available: (lane: Lane) => boolean
}

/* ------------------------------------------------------------ the choice */

export function planFor(message: string, facts: RoutingFacts): Plan {
  const external = EXTERNAL_ROLES.has((facts.recipientRole ?? '').toLowerCase())

  if (wantsDocument(message)) {
    // Formal disclosure to an organisation: the whole chain, ending in a file.
    if ((external || FORMAL.test(message)) && facts.available('fifteen')) {
      return {
        path: 'fifteen_step',
        lane: 'fifteen',
        then: null,
        reason:
          'This is a formal document for someone outside your care team, so it goes through ' +
          'the full checks and comes back as a file you approve before it is sent.',
      }
    }

    // Evidence is already on the record from a recent look, so do not look again.
    if (facts.recentEvidenceRunId) {
      return {
        path: 'produce_only',
        lane: 'produce',
        then: null,
        reason:
          'A draft will be written from what was just found, so nothing needs looking up ' +
          'again. You see it before anyone else.',
      }
    }

    // Cold. Look first, then draft — one request, two runs, one answer shown.
    if (facts.available('understand')) {
      return {
        path: 'understand_then_produce',
        lane: 'understand',
        then: 'produce',
        reason:
          'Your record will be read first, then a draft written from what is found. ' +
          'You see the draft before anyone else.',
      }
    }

    return {
      path: 'produce_only',
      lane: 'produce',
      then: null,
      reason: 'A draft will be written. You see it before anyone else.',
    }
  }

  /**
   * A question that has already been answered.
   *
   * Replay is offered only when the caller found a real prior answer for this
   * actor and purpose. Scoped to the actor because the same question from two
   * people is two different answers — what may be shown depends on who is
   * asking — and replaying across that boundary would disclose one person's
   * answer to another.
   */
  if (facts.alreadyAnsweredRunId && facts.available('chat')) {
    return {
      path: 'chatbot_replay',
      lane: 'chat',
      then: null,
      reason: 'You have asked this before, so the earlier answer is being brought back.',
    }
  }

  return {
    path: 'understand_only',
    lane: 'understand',
    then: null,
    reason: 'Your record will be read and the answer shown here. Nothing is sent to anyone.',
  }
}

/* -------------------------------------------------- has this been asked? */

const STOP = new Set([
  'a','an','the','is','are','was','were','be','been','do','does','did','has','have','had',
  'i','me','my','you','your','it','its','of','to','in','on','for','and','or','what','which',
  'that','this','these','those','with','about','can','could','would','should','me','please',
])

const terms = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

/**
 * How closely two questions match, as a number between 0 and 1.
 *
 * Jaccard overlap on content words. Deliberately blunt and deliberately not a
 * model: replaying a previous answer instead of reading the record is a
 * consequential decision, and it should be one a person can predict and
 * explain rather than one that depends on an embedding nobody can inspect.
 *
 * Stop words are removed first, or "what has changed for me" and "what could I
 * try" score as similar on their shared scaffolding while sharing no meaning.
 */
export function similarity(a: string, b: string): number {
  const x = terms(a)
  const y = terms(b)
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const t of x) if (y.has(t)) shared++
  return shared / (x.size + y.size - shared)
}

/**
 * The bar for calling two questions the same.
 *
 * High on purpose. A false match replays a stale answer and presents it as
 * current, which is silent and wrong; a missed match costs one extra workflow
 * run, which is merely slower. Those are not symmetric, so the threshold sits
 * where it only fires on near-restatements.
 */
export const SAME_QUESTION = 0.72
