/**
 * Building the text a workflow is actually started with — on the server.
 *
 * The browser has a copy of this logic in `src/lib/trigger.ts`, and that copy
 * exists to SHOW the person what is about to be sent. This one exists to
 * decide it. The difference matters: a preamble composed in the page is a
 * preamble the page can change, and the preamble is the entire statement of
 * who is asking and what they are permitted to ask for. So the page's version
 * is a preview, this version is the fact, and `orca-chat` returns the text it
 * actually sent so the two can never quietly disagree.
 *
 * Identity is read from the resolved actor — a real session where there is
 * one, otherwise an asserted id checked against the users table. It is never
 * read from the message. There is no branch below that looks at what the
 * person typed to decide who they are, and adding one would undo the point of
 * the file.
 */

export type WorkflowName = 'understand' | 'produce'

export interface Identity {
  name: string
  role: string
  subjectId: string
  purpose: string
  today: string
}

export interface Recipient {
  name: string
  role: string
  org: string
}

/**
 * Why this person is reading, derived from what they are.
 *
 * Not offered as a choice and not taken from the request body. The same
 * record and the same reader under a different stated purpose is a different
 * set of permissions, so letting the caller name its own purpose would let it
 * pick its own access.
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

/** 30 August 2026 — how a person writes a date, not how a database stores one. */
export const longDate = (d: Date = new Date()): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function identityFor(
  actor: { id: string; name: string; role: string },
  subjectId: string,
): Identity {
  return {
    name: actor.name,
    role: actor.role,
    subjectId,
    purpose: purposeFor(actor.role),
    today: longDate(),
  }
}

export const understandPreamble = (id: Identity): string =>
  `${id.name} (${id.role}, subject ${id.subjectId})\n` +
  `asks via ORCA chat on ${id.today}, for the purpose of ${id.purpose}:`

export const producePreamble = (
  id: Identity,
  recipient: Recipient,
  artifactType: string,
): string =>
  `${id.name} (${id.role}, subject ${id.subjectId})\n` +
  `asks via ORCA chat on ${id.today}.\n` +
  `Recipient: ${recipient.name}, ${recipient.role}, ${recipient.org}\n` +
  `Artifact type: ${artifactType}\n` +
  `Purpose: ${id.purpose}`

/* ------------------------------------------------------------- routing */

/**
 * Whether this turn wants a document made or a question answered.
 *
 * A regular expression rather than a model, deliberately. Routing a person can
 * read and predict is worth more here than routing that is occasionally
 * cleverer: a wrong guess costs a whole extra workflow run, and a rule nobody
 * can inspect is a rule nobody can correct. The interface shows which workflow
 * will run before it runs, which is the real safeguard against the times this
 * is wrong.
 */
const DOCUMENT_VERB =
  /\b(send|share|prepare|draft|write|compose|put together|summarise for|summarize for)\b/i
const DOCUMENT_NOUN =
  /\b(handover|summary|request|letter|report|brief|plan|note for|document)\b/i

export const routeFor = (message: string): WorkflowName =>
  DOCUMENT_VERB.test(message) || DOCUMENT_NOUN.test(message) ? 'produce' : 'understand'

/* ------------------------------------------------------------ chaining */

const HANDOFF_HEADING = 'Material from an earlier ORCA step (not raw record content)'

/**
 * The previous run's answer, carried across whole.
 *
 * Never condensed on the way. A summary of a summary is where details about
 * somebody's record quietly stop being true, and nothing downstream could tell
 * that it had happened. The label is load-bearing too: the second workflow has
 * to know this is a prior ORCA answer rather than record content, or it will
 * cite hearsay as though it were a source.
 */
export function handoffBlock(previous: {
  answerText?: string | null
  sources?: unknown
  withheld?: unknown
}): string | null {
  const text = (previous.answerText ?? '').trim()
  if (!text) return null

  const lines = [`${HANDOFF_HEADING}:`, '', text]

  const cited = Array.isArray(previous.sources)
    ? previous.sources
        .map((s) => {
          if (typeof s === 'string') return s
          const r = (s ?? {}) as Record<string, unknown>
          return [r.id, r.reporter, r.date].filter(Boolean).join(' — ') || String(r.label ?? '')
        })
        .filter(Boolean)
    : []
  if (cited.length) {
    lines.push('', 'Records the earlier step drew on:', ...cited.map((c) => `- ${c}`))
  }

  const held = Array.isArray(previous.withheld)
    ? previous.withheld
        .map((w) => {
          if (typeof w === 'string') return w
          const r = (w ?? {}) as Record<string, unknown>
          return [r.domain, r.reason].filter(Boolean).join(': ')
        })
        .filter(Boolean)
    : []
  if (held.length) {
    lines.push('', 'Withheld from that step:', ...held.map((h) => `- ${h}`))
  }

  return lines.join('\n')
}

export function composeTrigger(args: {
  workflow: WorkflowName
  identity: Identity
  message: string
  recipient?: Recipient | null
  artifactType?: string | null
  previous?: { answerText?: string | null; sources?: unknown; withheld?: unknown } | null
}): string {
  const { workflow, identity, message, previous } = args
  const head =
    workflow === 'understand'
      ? understandPreamble(identity)
      : producePreamble(
          identity,
          args.recipient ?? { name: identity.name, role: identity.role, org: 'ORCA' },
          args.artifactType ?? 'summary',
        )

  const parts = [head, '', `"${message.trim()}"`]
  const handoff = previous ? handoffBlock(previous) : null
  if (handoff) parts.push('', handoff)
  return parts.join('\n')
}

/* ---------------------------------------------------------- deployments */

export interface Deployment {
  id: string
  secret: string
  url: string
}

const TRIGGER_ORIGIN = Deno.env.get('YOXA_ORIGIN') ?? 'https://yoxa.ai'

/** The deployment id out of a full trigger URL, for when that is what was set. */
const idFromUrl = (url: string): string | null =>
  url.match(/workflow-deployments\/([0-9a-f-]{36})/i)?.[1] ?? null

/**
 * Which deployment a workflow name points at.
 *
 * Configured EITHER as a deployment id or as the whole trigger URL, because
 * the URL is what Yoxa's Integrate tab puts on your clipboard and pasting it
 * is the obvious thing to do. Accepting only the id meant a correct-looking
 * configuration produced "workflow not configured", and the message named a
 * variable the person had, in spirit, already set.
 *
 * Two deployments, two secrets, and deliberately no default between them.
 * Falling back from a missing PRODUCE configuration to the UNDERSTAND
 * deployment would send a document request to a workflow that answers
 * questions, and the failure would read as a bad answer rather than a bad
 * setting.
 */
export function deploymentFor(workflow: WorkflowName): Deployment | null {
  const prefix = workflow === 'understand' ? 'YOXA_UNDERSTAND' : 'YOXA_PRODUCE'
  const secret = Deno.env.get(`${prefix}_DEPLOYMENT_SECRET`)
  if (!secret) return null

  const explicitUrl = Deno.env.get(`${prefix}_TRIGGER_URL`)
  if (explicitUrl) {
    // A pasted URL may or may not already end in /trigger. Both are meant the
    // same way, and guessing wrong here produces a 404 that looks like a dead
    // deployment.
    const url = explicitUrl.replace(/\/+$/, '')
    return {
      id: idFromUrl(url) ?? '',
      secret,
      url: url.endsWith('/trigger') ? url : `${url}/trigger`,
    }
  }

  const id = Deno.env.get(`${prefix}_DEPLOYMENT_ID`)
  if (!id) return null
  return {
    id,
    secret,
    url: `${TRIGGER_ORIGIN}/api/v1/public/workflow-deployments/${id}/trigger`,
  }
}
