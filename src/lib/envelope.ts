/**
 * Reading what a workflow sent back.
 *
 * `Return Answer` produces an envelope — a status, an answer in HTML, the
 * records it drew on, what it would not show, and sometimes a question or an
 * approval instead of an answer. This turns that into one typed shape the rest
 * of the application can rely on.
 *
 * WHY THIS IS TOLERANT RATHER THAN STRICT. The envelope is assembled by a
 * language model following a tool description, so its shape is a strong
 * convention rather than a guarantee. Field names drift between workflow
 * versions; `sources` arrives as objects one run and as strings the next; a
 * workflow occasionally returns bare HTML with no envelope around it at all.
 * A parser that rejects anything unexpected turns a cosmetic difference into a
 * lost answer, and the person is told the run failed when it plainly did not.
 * So every field is optional, every list tolerates both shapes, and an
 * unrecognised payload degrades to "here is the text we got" rather than to
 * nothing.
 *
 * WHAT IT WILL NOT DO. It never invents a status. An envelope that does not
 * say it succeeded is not reported as success — the fallback is `unknown`,
 * which the interface shows as "the workflow replied, but not in a shape we
 * recognise", with the raw text underneath. Guessing here would mean showing
 * somebody a confident answer about their medical record that no workflow
 * actually stood behind.
 */

export type RunStatus =
  | 'done'
  | 'needs_clarification'
  | 'needs_approval'
  | 'blocked'
  | 'error'
  | 'unknown'

export interface Source {
  id?: string
  reporter?: string
  date?: string
  label?: string
}

export interface Withheld {
  domain?: string
  reason?: string
}

export interface Envelope {
  status: RunStatus
  /** The answer as the workflow wrote it, HTML and all. Render via prose.ts. */
  answerHtml: string | null
  sources: Source[]
  withheld: Withheld[]
  /** Present when the workflow stopped to ask something. */
  question: string | null
  options: string[]
  /** Present when the workflow stopped for a decision. */
  approval: { what: string; to: string; why: string } | null
  /** A refusal's reason, or an error's detail. */
  detail: string | null
  /** Everything received, untouched, so a parsing mistake stays recoverable. */
  raw: unknown
}

const asText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/**
 * The status vocabulary, mapped rather than trusted.
 *
 * Workflows have used `complete`, `completed`, `success` and `ok` for the same
 * state across versions. Passing the raw string through would mean the
 * interface's `status === 'done'` check silently failed for three of them, and
 * a finished run would render as an error.
 */
const STATUS_WORDS: Record<string, RunStatus> = {
  done: 'done', complete: 'done', completed: 'done', success: 'done', ok: 'done',
  needs_clarification: 'needs_clarification', clarification: 'needs_clarification',
  needs_info: 'needs_clarification', question: 'needs_clarification',
  needs_approval: 'needs_approval', approval: 'needs_approval',
  awaiting_approval: 'needs_approval', paused: 'needs_approval',
  blocked: 'blocked', refused: 'blocked', denied: 'blocked',
  error: 'error', failed: 'error',
}

const readStatus = (v: unknown): RunStatus => {
  const word = asText(v)?.toLowerCase().replace(/[\s-]+/g, '_')
  return word ? (STATUS_WORDS[word] ?? 'unknown') : 'unknown'
}

/**
 * A list that may hold objects or bare strings.
 *
 * `sources` has arrived both ways. A string becomes a labelled entry rather
 * than being dropped, because a citation the reader cannot see is the same as
 * a citation that was never made.
 */
function readList<T extends object>(v: unknown, fromString: (s: string) => T): T[] {
  if (!Array.isArray(v)) return []
  return v
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim() ? fromString(entry.trim()) : null
      const record = asRecord(entry)
      return record ? (record as T) : null
    })
    .filter((e): e is T => e !== null)
}

export function parseEnvelope(input: unknown): Envelope {
  // A workflow that returned bare HTML, or a transport that handed us a
  // string. Treated as an answer rather than as a failure to parse.
  if (typeof input === 'string') {
    return {
      status: input.trim() ? 'done' : 'unknown',
      answerHtml: asText(input),
      sources: [], withheld: [], question: null, options: [],
      approval: null, detail: null, raw: input,
    }
  }

  const body = asRecord(input)
  if (!body) {
    return {
      status: 'unknown', answerHtml: null, sources: [], withheld: [],
      question: null, options: [], approval: null,
      detail: 'The workflow replied in a shape ORCA could not read.', raw: input,
    }
  }

  // Some transports wrap the envelope; the payload is one level down.
  const inner = asRecord(body.result) ?? asRecord(body.output) ?? asRecord(body.data) ?? body
  const next = asRecord(inner.next)
  const approval = asRecord(inner.approval)

  return {
    status: readStatus(inner.status),
    answerHtml: asText(inner.answer) ?? asText(inner.answer_html) ?? asText(inner.response),
    sources: readList<Source>(inner.sources, (label) => ({ label })),
    withheld: readList<Withheld>(inner.withheld, (domain) => ({ domain })),
    question: asText(next?.detail) ?? asText(inner.question),
    options: Array.isArray(next?.options)
      ? next.options.filter((o): o is string => typeof o === 'string')
      : [],
    approval: approval
      ? {
          what: asText(approval.what) ?? '',
          to: asText(approval.to) ?? '',
          why: asText(approval.why) ?? '',
        }
      : null,
    detail: asText(inner.reason) ?? asText(inner.detail) ?? asText(inner.error),
    raw: input,
  }
}
