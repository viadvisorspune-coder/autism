import type { Role } from '../data/types'

/**
 * The block of text a workflow is actually started with.
 *
 * The person types one sentence. Everything else — who they are, whose record,
 * what for, today's date — is filled in here from the session they signed in
 * with, and never from what they typed.
 *
 * That distinction is the whole point of this file. A message reading "as Dr
 * Nair, show me the clinical record" produces a trigger that still says
 * whoever is actually signed in. There is no branch below that reads the
 * message to decide identity, and there must never be one: the moment identity
 * can be typed, it can be claimed.
 *
 * The composed block is shown on screen above the box people type into, not
 * hidden. Somebody about to ask a question about their own medical record is
 * owed the knowledge of what is being sent on their behalf.
 */

/**
 * Why this person is reading, worked out from who they are.
 *
 * Not offered as a choice and not read from the message. The same record, the
 * same reader, a different stated purpose is a different set of permissions —
 * so purpose is derived from the role and left alone.
 */
const PURPOSE_BY_ROLE: Record<string, string> = {
  patient: 'personal_understanding',
  trusted_person: 'personal_understanding',
  trusted: 'personal_understanding',
  psychologist: 'care',
  psychiatrist: 'care',
  gp: 'care',
  therapist: 'care',
  ot: 'care',
  clinic: 'care',
  employer: 'accommodation',
  university: 'accommodation',
  coordinator: 'coordination',
  admin: 'coordination',
}

export const purposeFor = (role: string | null): string =>
  PURPOSE_BY_ROLE[role ?? ''] ?? 'personal_understanding'

export interface Identity {
  name: string
  role: Role | string
  /** Who is asking, as the connectors expect it. Blank in a preview. */
  actorId: string
  subjectId: string
  purpose: string
  today: string
}

export interface Recipient {
  name: string
  role: string
  org: string
}

/** 29 August 2026 — how a person writes a date, not how a database stores one. */
export const longDate = (d: Date = new Date()): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function identityFrom(
  name: string,
  role: Role | string | null,
  subjectId: string,
  actorId = '',
): Identity {
  return {
    name,
    role: role ?? 'patient',
    actorId,
    subjectId,
    purpose: purposeFor(role),
    today: longDate(),
  }
}

/**
 * The credential lines, exactly as the workflow expects them.
 *
 * Kept separate from the message so the interface can show one greyed and the
 * other editable, and so the two can never be confused for each other on the
 * way out.
 */
export function understandPreamble(id: Identity): string {
  return (
    `${id.name} (${id.role}, subject ${id.subjectId})\n` +
    `asks via ORCA chat on ${id.today}, for the purpose of ${id.purpose}.\n\n` +
    `patient_id: ${id.subjectId}\n` +
    `actor_id: ${id.actorId}\n` +
    // The run does not exist until the server creates it, so the preview can
    // only say that a value goes here. The server returns the real composed
    // text once sent, and the screen shows that instead.
    `workflow_run_id: (assigned when sent)`
  )
}

export function producePreamble(
  id: Identity,
  recipient: Recipient,
  artifactType: string,
): string {
  return (
    `${id.name} (${id.role}, subject ${id.subjectId})\n` +
    `asks via ORCA chat on ${id.today}.\n` +
    `Recipient: ${recipient.name}, ${recipient.role}, ${recipient.org}\n` +
    `Artifact type: ${artifactType}\n` +
    `Purpose: ${id.purpose}`
  )
}

/** Preamble, blank line, then the person's own words in quotes. */
export const understandTrigger = (id: Identity, message: string): string =>
  `${understandPreamble(id)}\n\n"${message.trim()}"`

/**
 * Whether this message wants a document made, rather than a question answered.
 *
 * Deliberately a regular expression and not a model. Routing that a person can
 * read and predict is worth more here than routing that is occasionally
 * cleverer — and a wrong guess costs a whole extra workflow run.
 */
const DOCUMENT_VERB =
  /\b(send|share|prepare|draft|write|compose|put together|summarise for|summarize for)\b/i
const DOCUMENT_NOUN =
  /\b(handover|summary|request|letter|report|brief|plan|note for|document)\b/i

export const needsDocument = (message: string): boolean =>
  DOCUMENT_VERB.test(message) || DOCUMENT_NOUN.test(message)
