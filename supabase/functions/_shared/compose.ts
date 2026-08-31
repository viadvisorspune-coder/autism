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

/**
 * `chat` is a third lane for the same job as `understand`.
 *
 * It exists because of a delivery constraint rather than a difference in
 * intent: the chat workflow is short, retrieves and rewrites, and — crucially —
 * has API connectors, so its answer can be written back into ORCA. UNDERSTAND
 * is locked after deployment with no connectors, and Yoxa has no runs API, so
 * its answers can only return through an approval gate. Same question, same
 * preamble; the difference is whether the answer can get home.
 */
import { artifactFrom, categoriesFrom, sinceFrom } from './hints.ts'

export type WorkflowName = 'understand' | 'produce' | 'chat' | 'fifteen'

export interface Identity {
  name: string
  role: string
  /** Who is asking — the id the connectors expect as `actor_id`. */
  actorId: string
  /** Whose record — the id the connectors expect as `patient_id`. */
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
    actorId: actor.id,
    subjectId,
    purpose: purposeFor(actor.role),
    today: longDate(),
  }
}

/**
 * The identifiers a workflow has to hand back, stated as labelled fields.
 *
 * A workflow whose connectors need `patient_id`, `actor_id` and
 * `workflow_run_id` can only get them from the trigger text — nothing else
 * reaches it. They were being described in prose ("subject pt-ananya") which a
 * model has to infer a field name from, so give it the field names directly.
 *
 * These are ORCA's own opaque identifiers, not personal data, and the workflow
 * only ever hands them back to ORCA. Naming them in the trigger does not widen
 * what the reader may see: `orca_can_access` still decides that, server-side,
 * from the actor the session resolved.
 */
const identifierBlock = (
  id: Identity,
  runId?: string | null,
  hints?: { since?: string | null; categories?: string[] },
): string =>
  [
    `patient_id: ${id.subjectId}`,
    `actor_id: ${id.actorId}`,
    runId ? `workflow_run_id: ${runId}` : null,
    `purpose: ${id.purpose}`,
    /**
     * Derived filters, stated rather than left to be inferred.
     *
     * "Since May" has one correct ISO date given the trigger's own date, and
     * "about work" maps to one category in a fixed list. A model asked to work
     * those out will usually be right and occasionally silently wrong — and a
     * wrong `since` narrows a medical record without telling anybody, so the
     * answer then reports what it found as though that were everything.
     *
     * Absent when the phrase was ambiguous, which leaves the agent reading the
     * question as it otherwise would.
     */
    hints?.since ? `since: ${hints.since}` : null,
    hints?.categories?.length ? `categories: ${hints.categories.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

export const understandPreamble = (
  id: Identity,
  runId?: string | null,
  hints?: { since?: string | null; categories?: string[] },
): string =>
  `${id.name} (${id.role}, subject ${id.subjectId})\n` +
  `asks via ORCA chat on ${id.today}, for the purpose of ${id.purpose}.\n\n` +
  `${identifierBlock(id, runId, hints)}`

export const producePreamble = (
  id: Identity,
  recipient: Recipient,
  artifactType: string,
  runId?: string | null,
  hints?: { since?: string | null; categories?: string[] },
): string =>
  `${id.name} (${id.role}, subject ${id.subjectId})\n` +
  `asks via ORCA chat on ${id.today}.\n` +
  `Recipient: ${recipient.name}, ${recipient.role}, ${recipient.org}\n` +
  `Artifact type: ${artifactType}\n\n` +
  `${identifierBlock(id, runId, hints)}`

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

/**
 * Which lane a message belongs in, from the message alone.
 *
 * CHATBOT IS NOT DECIDED HERE, DELIBERATELY. It replays output that already
 * exists, scoped to this actor and purpose — it does no retrieval and no
 * reasoning. Whether a question has already been answered is a fact about the
 * record, not about the wording, so it cannot be read off the text and is
 * decided in `orca-chat`, which can look.
 *
 * An earlier version sent every question to the chat lane whenever it was
 * configured, on the mistaken belief that it retrieved and rewrote like
 * UNDERSTAND does. That would have replayed a stale answer to a fresh
 * question and presented it as current — the worst failure this system has
 * available to it, because it is silent and it is about somebody's medical
 * record.
 */
export function routeFor(message: string): WorkflowName {
  return DOCUMENT_VERB.test(message) || DOCUMENT_NOUN.test(message)
    ? 'produce'
    : 'understand'
}

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
  /** ORCA's run id, so a workflow with connectors can write back against it. */
  runId?: string | null
}): string {
  const { workflow, identity, message, previous, runId } = args

  /**
   * Which preamble, by what the lane produces rather than by its name.
   *
   * PRODUCE and the 15-step both end in a document for somebody, so both need
   * the recipient and the artifact type stated. The 15-step was getting the
   * question preamble — no recipient, no artifact type — which is the one lane
   * where those are least optional: it exists to send a formal document to an
   * external party, and a workflow told none of that has to guess who it is
   * writing to.
   */
  const makesDocument = workflow === 'produce' || workflow === 'fifteen'

  /**
   * Filters worked out from the question rather than left to be inferred.
   *
   * Anchored to the trigger's own date, so a run re-read later resolves to the
   * same window it did when it ran. A relative period that drifts is a filter
   * that silently changes what an answer was based on.
   */
  const hints = {
    since: sinceFrom(message, new Date()),
    categories: categoriesFrom(message),
  }

  const head = makesDocument
    ? producePreamble(
        identity,
        args.recipient ?? { name: identity.name, role: identity.role, org: 'ORCA' },
        // The person's own word for what they want, where they used one.
        args.artifactType ?? artifactFrom(message) ?? 'summary',
        runId,
        hints,
      )
    : understandPreamble(identity, runId, hints)

  const parts = [head, '', `"${message.trim()}"`]

  /**
   * A file that came with the question, stated after it.
   *
   * The workflow cannot open it — it reads text — but being told one exists,
   * what kind, and what it is called lets it say so, rather than answering as
   * though nothing had been provided. Somebody who attaches a letter and gets
   * an answer that ignores it will reasonably conclude the attachment did not
   * work.
   */
  if (args.attached) parts.push('', args.attached)

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
export type DeploymentLookup =
  | { ok: true; deployment: Deployment }
  | { ok: false; reason: string }

/** Whether a string is actually a URL we could POST to. */
function usableUrl(raw: string): string | null {
  // Quotes and stray whitespace survive a copy-paste into a secrets field and
  // are invisible there. `new URL` rejects them, so trim before judging.
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(cleaned)) return null
  try {
    new URL(cleaned)
  } catch {
    return null
  }
  // A pasted URL may or may not already end in /trigger. Both are meant the
  // same way, and guessing wrong produces a 404 that reads as a dead deployment.
  return cleaned.endsWith('/trigger') ? cleaned : `${cleaned}/trigger`
}

const PREFIX: Record<WorkflowName, string> = {
  understand: 'YOXA_UNDERSTAND',
  produce: 'YOXA_PRODUCE',
  chat: 'YOXA_CHAT',
  // The original end-to-end coordination workflow. Its variables predate the
  // per-lane naming, so the plain YOXA_ names are its.
  fifteen: 'YOXA',
}

/** Whether a lane is configured at all, without building anything. */
export const isConfigured = (workflow: WorkflowName): boolean =>
  Boolean(
    Deno.env.get(`${PREFIX[workflow]}_DEPLOYMENT_SECRET`) &&
      (Deno.env.get(`${PREFIX[workflow]}_TRIGGER_URL`) ||
        Deno.env.get(`${PREFIX[workflow]}_DEPLOYMENT_ID`)),
  )

export function deploymentFor(workflow: WorkflowName): DeploymentLookup {
  const prefix = PREFIX[workflow]
  const secret = Deno.env.get(`${prefix}_DEPLOYMENT_SECRET`)
  if (!secret) return { ok: false, reason: `${prefix}_DEPLOYMENT_SECRET is not set.` }

  const rawUrl = Deno.env.get(`${prefix}_TRIGGER_URL`)
  const url = rawUrl ? usableUrl(rawUrl) : null
  if (url) return { ok: true, deployment: { id: idFromUrl(url) ?? '', secret, url } }

  const id = Deno.env.get(`${prefix}_DEPLOYMENT_ID`)?.trim()
  if (id) {
    return {
      ok: true,
      deployment: {
        id,
        secret,
        url: `${TRIGGER_ORIGIN}/api/v1/public/workflow-deployments/${id}/trigger`,
      },
    }
  }

  /**
   * Naming which variable is wrong, not just that something is.
   *
   * A value set to the wrong thing is far more likely than a value left
   * unset — a secret pasted into the URL field, or the other way round, is a
   * two-second mistake that previously surfaced as `yoxa_unreachable` from a
   * fetch three layers down. That message sent people to check their network
   * and their deployment, which were both fine.
   */
  return {
    ok: false,
    reason: rawUrl
      ? `${prefix}_TRIGGER_URL is set but is not a URL — it should start with ` +
        `https:// and look like ` +
        `https://yoxa.ai/api/v1/public/workflow-deployments/<id>/trigger. ` +
        `Check the secret and the URL have not been pasted into each other's field.`
      : `Set ${prefix}_TRIGGER_URL (the whole URL from Yoxa's Integrate tab) ` +
        `or ${prefix}_DEPLOYMENT_ID.`,
  }
}
