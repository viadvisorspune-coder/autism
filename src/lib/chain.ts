/**
 * Turning one workflow's answer into the next one's trigger.
 *
 * Four shapes of work reach this file: a question on its own, a document on
 * its own, a question whose answer then becomes a document, and a document
 * that somebody then asks about. The two chained cases are the only ones that
 * need anything built — and what they need is a faithful hand-off, not a
 * clever one.
 *
 * NOTHING HERE SUMMARISES. The previous answer is carried across whole, as
 * text, under a heading that says where it came from. It would be easy, and
 * wrong, to compress it first: a summary of a summary is where details about
 * somebody's medical record quietly stop being true, and neither the person
 * nor the second workflow would be able to tell that it had happened. If the
 * hand-off is long, it is long.
 *
 * PROVENANCE IS PART OF THE FORMAT. The second workflow is told explicitly
 * that this material is a previous ORCA answer rather than record content. It
 * matters: PRODUCE citing "R038" from the record is a citation, and PRODUCE
 * citing a sentence an earlier run wrote about R038 is hearsay. Labelling it
 * is what lets the workflow treat it correctly, and what lets a reader see the
 * chain afterwards.
 *
 * HTML BECOMES TEXT ON THE WAY OUT. A trigger is prose a workflow reads, not a
 * document it renders. Passing markup through would spend the model's
 * attention on tags and risk the second workflow echoing them into its own
 * output.
 */

import type { Envelope } from './envelope'
import { htmlToText } from './prose'
import type { Identity, Recipient } from './trigger'
import { producePreamble, understandPreamble } from './trigger'

export type WorkflowName = 'understand' | 'produce'

/** What the person's turn is asking for, decided before anything is sent. */
export interface Plan {
  workflow: WorkflowName
  /** The run whose answer feeds this one, when there is one. */
  chainedFrom: string | null
}

/**
 * The heading a hand-off travels under.
 *
 * Written as something a reader would recognise rather than as a field name,
 * because the workflow reading it is a language model and the person auditing
 * it is not a programmer.
 */
const HANDOFF_HEADING = 'Material from an earlier ORCA step (not raw record content)'

function handoffBlock(previous: Envelope): string | null {
  const text = previous.answerHtml ? htmlToText(previous.answerHtml).trim() : ''
  if (!text) return null

  const lines = [`${HANDOFF_HEADING}:`, '', text]

  // Citations travel with the material. Without them the second workflow has
  // an assertion and no way to attribute it, and anything it writes inherits
  // that gap.
  const cited = previous.sources
    .map((s) => [s.id, s.reporter, s.date].filter(Boolean).join(' — ') || s.label)
    .filter((s): s is string => Boolean(s))
  if (cited.length) {
    lines.push('', 'Records the earlier step drew on:', ...cited.map((c) => `- ${c}`))
  }

  // What was held back stays held back, and saying so stops the second
  // workflow reading a gap as an absence of evidence.
  if (previous.withheld.length) {
    const held = previous.withheld
      .map((w) => [w.domain, w.reason].filter(Boolean).join(': '))
      .filter(Boolean)
    if (held.length) lines.push('', 'Withheld from that step:', ...held.map((h) => `- ${h}`))
  }

  return lines.join('\n')
}

/** A question, on its own. */
export const understandOnly = (id: Identity, message: string): string =>
  `${understandPreamble(id)}\n\n"${message.trim()}"`

/** A document, on its own. */
export const produceOnly = (
  id: Identity,
  recipient: Recipient,
  artifactType: string,
  message: string,
): string => `${producePreamble(id, recipient, artifactType)}\n\n"${message.trim()}"`

/**
 * A question that has been answered, now becoming a document.
 *
 * The person's original words are kept alongside the answer. The answer says
 * what is true; only the request says what they actually wanted made, and a
 * workflow given the answer alone tends to write a report about the answer
 * rather than the letter that was asked for.
 */
export function understandToProduce(
  id: Identity,
  recipient: Recipient,
  artifactType: string,
  message: string,
  previous: Envelope,
): string {
  const handoff = handoffBlock(previous)
  const parts = [producePreamble(id, recipient, artifactType), '', `"${message.trim()}"`]
  if (handoff) parts.push('', handoff)
  return parts.join('\n')
}

/**
 * A document that has been drafted, now being asked about.
 *
 * The draft is quoted as the subject of the question rather than as context,
 * because "is this accurate?" and "what does the record say?" are different
 * questions and only the first one is being asked here.
 */
export function produceToUnderstand(
  id: Identity,
  message: string,
  previous: Envelope,
): string {
  const handoff = handoffBlock(previous)
  const parts = [understandPreamble(id), '', `"${message.trim()}"`]
  if (handoff) parts.push('', handoff)
  return parts.join('\n')
}

/**
 * The one entry point, so a caller never has to pick a composer.
 *
 * Every branch produces a preamble from `id` and a body from `message`, and
 * `previous` only ever adds a labelled block. There is deliberately no path
 * through this function where the message can affect the preamble.
 */
export function composeTrigger(args: {
  workflow: WorkflowName
  identity: Identity
  message: string
  recipient?: Recipient
  artifactType?: string
  previous?: Envelope | null
}): string {
  const { workflow, identity, message, previous } = args

  if (workflow === 'understand') {
    return previous
      ? produceToUnderstand(identity, message, previous)
      : understandOnly(identity, message)
  }

  // A recipient is required by the produce preamble and is not guessable from
  // the message. Falling back to the person themselves is the honest default:
  // a document with no stated recipient is a draft for the person who asked.
  const recipient: Recipient = args.recipient ?? {
    name: identity.name,
    role: String(identity.role),
    org: 'ORCA',
  }
  const artifactType = args.artifactType ?? 'summary'

  return previous
    ? understandToProduce(identity, recipient, artifactType, message, previous)
    : produceOnly(identity, recipient, artifactType, message)
}
