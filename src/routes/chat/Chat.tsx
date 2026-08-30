import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/session'
import { type Block, htmlToBlocks, htmlToText } from '../../lib/prose'
import {
  type Identity,
  identityFrom,
  needsDocument,
  understandPreamble,
  understandTrigger,
} from '../../lib/trigger'
import { useLive } from '../../lib/live'
import { respondToApproval } from '../../lib/approvals'
import { type RunStatus, parseEnvelope } from '../../lib/envelope'
import type { PendingApproval } from '../../components/ApprovalPanel'

/** One row of `workflow_runs`, as `app-read` returns it. */
interface RunRow {
  id: string
  status: string
  current_step: string
  workflow_name: string | null
  answer_html: string | null
  result: unknown
  trigger_text: string | null
}

/**
 * The workflow chat.
 *
 * A deliberately plain screen, added beside the product rather than into it,
 * for finding out whether a Yoxa workflow works at all. Nothing else in ORCA
 * changes; this is reachable from the sign-in page and from nowhere else.
 *
 * The one idea it is built around: THE PERSON TYPES A QUESTION, AND SEES
 * EVERYTHING ELSE THAT WILL BE SENT WITH IT. The credential lines sit above the
 * box, filled in from the session, greyed because they are not editable. That
 * is not decoration. Somebody about to ask a question about their own medical
 * record is owed the knowledge of what is being sent on their behalf — and the
 * greying is the honest way to say "this part is not yours to change", which is
 * exactly right, because identity that can be edited can be claimed.
 */

type Status = RunStatus

interface Turn {
  id: string
  at: string
  message: string
  trigger: string
  workflow: 'ORCA_UNDERSTAND' | 'ORCA_PRODUCE'
  /**
   * Three states, not two, because Yoxa is asynchronous.
   *
   * `sending` is the moment between pressing the button and Yoxa accepting the
   * trigger — seconds. `running` is everything after: the run is queued or
   * working, and may stay there for a minute or stop for a person's approval.
   * Collapsing the two would mean showing a spinner that means "we are still
   * talking to the server" for something that is actually "your question is
   * being worked on and you can close this tab".
   */
  state: 'sending' | 'running' | 'settled'
  /** ORCA's own run id, which is how a result finds its way back to this turn. */
  runId?: string
  status?: Status
  answer?: string
  sources?: { id?: string; reporter?: string; date?: string; label?: string }[]
  withheld?: { domain?: string; reason?: string }[]
  question?: string
  options?: string[]
  approval?: { what: string; to: string; why: string }
  detail?: string
}

export function WorkflowChat() {
  const { option, role, patientId, personName, organisation } = useSession()
  const [message, setMessage] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const subjectId = patientId ?? 'ANANYA-001'
  const identity: Identity = useMemo(
    () => identityFrom(personName || option?.name || 'Unknown', role, subjectId),
    [personName, option?.name, role, subjectId],
  )
  const preamble = understandPreamble(identity)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, busy])

  async function send(text: string) {
    const body = text.trim()
    if (!body || busy) return
    const trigger = understandTrigger(identity, body)
    const turn: Turn = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      message: body,
      trigger,
      workflow: needsDocument(body) ? 'ORCA_PRODUCE' : 'ORCA_UNDERSTAND',
      state: 'sending',
    }
    setTurns((t) => [...t, turn])
    setMessage('')
    setBusy(true)

    const started = await startRun({
      message: body,
      actorId: option?.personId ?? null,
      patientId: patientId ?? null,
    })
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, ...started } : x)))
    // Only the handshake blocks the composer. Once a run is queued the person
    // is free to ask something else — the answer finds its own turn by run id.
    setBusy(false)
  }

  /**
   * Answers finding their way back to the turn that asked.
   *
   * A run's result is written to its row by whatever transport delivered it,
   * minutes after the request that started it returned. So the conversation
   * reconciles against the record rather than waiting on a promise: every poll,
   * any turn still running is matched by run id and settled if its row now has
   * an answer.
   *
   * Doing it this way rather than awaiting inside `send` means a reload, a
   * second question asked while the first is working, or a tab left in the
   * background all behave correctly without any of them being special cases.
   */
  const { data: runData } = useLive<{ runs: RunRow[] }>('workflow_runs')
  useEffect(() => {
    const rows = runData?.runs ?? []
    if (!rows.length) return
    setTurns((current) => {
      let changed = false
      const next = current.map((t) => {
        if (t.state !== 'running' || !t.runId) return t
        const row = rows.find((r) => r.id === t.runId)
        if (!row) return t
        const settled = settleFrom(row)
        if (!settled) return t
        changed = true
        return { ...t, ...settled }
      })
      return changed ? next : current
    })
  }, [runData])

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <h1 className="text-[0.95rem] font-semibold">Workflow chat</h1>
            <p className="truncate text-[0.8rem] text-muted">
              Signed in as {identity.name} · {String(identity.role)}
              {organisation ? ` · ${organisation}` : ''}
            </p>
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[0.82rem] font-medium text-ink-2 hover:bg-canvas"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-56 pt-6">
        <LiveApprovals actorId={option?.personId ?? null} />
        {turns.length === 0 ? <Opening onPick={send} role={String(identity.role)} /> : null}
        <ol className="space-y-6">
          {turns.map((t) => (
            <li key={t.id}>
              <Asked turn={t} />
              {t.state === 'settled' ? (
                <Answered turn={t} onPick={send} />
              ) : (
                <Working state={t.state} />
              )}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
      </main>

      <Composer
        preamble={preamble}
        value={message}
        onChange={setMessage}
        onSend={() => send(message)}
        busy={busy}
        willProduce={needsDocument(message)}
      />
    </div>
  )
}

/* ------------------------------------------------------- live approvals */

/**
 * Approvals a workflow is currently stopped on, in the conversation.
 *
 * These do not arrive in the reply to anything. Yoxa is asynchronous: a run
 * that reaches an approval gate parks, and the trigger response has long since
 * returned. The gate comes back by a different road entirely — Yoxa posts a
 * signed event to `hitl-receiver`, which stores it — so the only way this
 * screen learns about it is by looking.
 *
 * WHY POLLING AND NOT A CHANGE STREAM. Postgres change streams are filtered by
 * row-level security, and `hitl_requests` is readable only by someone who owns
 * or is connected to the patient. ORCA has no sign-in, so every browser here is
 * anonymous and would subscribe successfully and then receive nothing, for
 * ever, with no error to explain it. `app-read` runs as the service role and
 * decides scope itself, which is both simpler and keeps the permission
 * decision in one place rather than two.
 *
 * It sits above the conversation rather than inside it because a parked run is
 * blocking someone, and because it may have been raised by a turn from a
 * previous session — or by another person entirely.
 */
function LiveApprovals({ actorId }: { actorId: string | null }) {
  const { data, refresh } = useLive<{ approvals: PendingApproval[] }>('approvals')
  const waiting = (data?.approvals ?? []).filter((a) => a.status === 'Awaiting approval')
  if (!waiting.length) return null
  return (
    <section className="mb-6 space-y-3">
      {waiting.map((a) => (
        <LiveApprovalCard key={a.request_id} approval={a} actorId={actorId} onDecided={refresh} />
      ))}
    </section>
  )
}

function LiveApprovalCard({
  approval, actorId, onDecided,
}: {
  approval: PendingApproval
  actorId: string | null
  onDecided: () => void
}) {
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  /**
   * Yoxa names its own options, so they are rendered rather than assumed. A
   * gate that offers "Send redacted" and "Send in full" must not be flattened
   * into Approve/Decline — the whole point of stopping was the choice. When it
   * offers nothing, the two plain answers are the honest fallback, sent as
   * free text because `hitl-respond` requires an option id or a message and
   * there is no id to give.
   */
  const choices = approval.options.length
    ? approval.options.map((o) => ({ id: o.id, label: o.label, message: null as string | null }))
    : [
        { id: null, label: 'Approve', message: 'Approved.' },
        { id: null, label: 'Decline', message: 'Declined.' },
      ]

  async function decide(optionId: string | null, message: string | null) {
    if (sending) return
    setSending(true)
    setFailed(null)
    const problem = await respondToApproval(approval.request_id, optionId, message, actorId)
    if (problem) {
      setFailed(problem)
      setSending(false)
      return
    }
    // The row is now Answered. Re-read rather than hiding it locally, so what
    // is on screen is what the record says.
    onDecided()
    setSending(false)
  }

  return (
    <div className="rounded-xl border border-line-strong bg-paper p-4">
      <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
        A workflow is waiting on you
      </p>
      <p className="mt-1.5 text-[0.9rem] font-medium text-ink">{approval.title}</p>
      {/*
        The description, rendered rather than printed.

        For a gate that asks "here is the draft — send it?", this field IS the
        draft: paragraphs, headings, a list of what would be disclosed, often
        several hundred words of HTML. Printing it into a single <p> ran it all
        together into one unreadable block and asked somebody to approve a
        disclosure they could not actually read. The same converter the answers
        use turns it back into something a person can judge.
      */}
      {approval.description ? (
        <div className="mt-2">
          <Prose html={approval.description} />
        </div>
      ) : null}

      {approval.recipient ? (
        <p className="mt-2 text-[0.83rem] text-ink-2">
          <span className="text-muted">To </span>
          {approval.recipient}
        </p>
      ) : null}
      {approval.will_send?.length ? (
        <ul className="mt-2 space-y-0.5">
          {approval.will_send.map((w) => (
            <li key={w} className="text-[0.83rem] text-ink-2">
              <span className="text-muted">Would disclose </span>
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {approval.withheld?.length ? (
        <p className="mt-1.5 text-[0.83rem] text-muted">
          Held back: {approval.withheld.join(', ')}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((c, i) => (
          <button
            key={`${c.id ?? c.label}-${i}`}
            disabled={sending}
            onClick={() => decide(c.id, c.message)}
            className={
              i === 0
                ? 'rounded-lg bg-brand px-3.5 py-1.5 text-[0.82rem] font-medium text-paper disabled:opacity-50'
                : 'rounded-lg border border-line-strong px-3.5 py-1.5 text-[0.82rem] font-medium text-ink-2 hover:bg-canvas disabled:opacity-50'
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {sending ? <p className="mt-2 text-[0.82rem] text-muted">Sending your decision…</p> : null}
      {failed ? <p className="mt-2 text-[0.82rem] text-ink">{failed}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------- composer */

/**
 * One bordered surface: the credentials, then the box, then the button.
 *
 * The preamble is a real part of the composer rather than a note beside it,
 * because it is a real part of what gets sent. Rendering it as help text would
 * suggest it were optional.
 */
function Composer({
  preamble, value, onChange, onSend, busy, willProduce,
}: {
  preamble: string
  value: string
  onChange: (v: string) => void
  onSend: () => void
  busy: boolean
  willProduce: boolean
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-5 py-4">
        <div className="overflow-hidden rounded-xl border border-line-strong bg-paper">
          <div className="border-b border-line bg-canvas px-3.5 py-2.5">
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
              Sent with every message · from your sign-in, not editable
            </p>
            <pre className="whitespace-pre-wrap font-mono text-[0.74rem] leading-relaxed text-ink-2">
              {preamble}
            </pre>
          </div>

          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            rows={2}
            placeholder="Ask about the record, or ask for a document to be drafted…"
            className="w-full resize-none bg-transparent px-3.5 py-3 text-[0.92rem] text-ink outline-none placeholder:text-muted"
          />

          <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
            <p className="text-[0.75rem] text-muted">
              {value.trim()
                ? willProduce
                  ? 'Will run ORCA_PRODUCE — a draft, seen by you before anything else'
                  : 'Will run ORCA_UNDERSTAND — answers only, nothing is sent'
                : 'Enter to send · Shift + Enter for a new line'}
            </p>
            <button
              onClick={onSend}
              disabled={busy || !value.trim()}
              className="shrink-0 rounded-lg bg-brand px-4 py-1.5 text-[0.85rem] font-medium text-paper disabled:opacity-40"
            >
              {busy ? 'Running…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- a turn */

function Asked({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3">
      <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-brand-tint px-4 py-2.5">
        <p className="whitespace-pre-wrap text-[0.92rem] text-ink">{turn.message}</p>
      </div>
      <div className="mt-1 flex items-center justify-end gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[0.72rem] font-medium text-brand hover:underline"
        >
          {open ? 'Hide what was sent' : 'See exactly what was sent'}
        </button>
        <span className="text-[0.72rem] text-muted">{turn.workflow}</span>
      </div>
      {open ? (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[0.72rem] leading-relaxed text-ink-2">
          {turn.trigger}
        </pre>
      ) : null}
    </div>
  )
}

function Working({ state }: { state: 'sending' | 'running' }) {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-[0.85rem] text-muted">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-line-strong motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {/*
        Two different waits, said differently. "Starting" is a handshake and
        lasts seconds; "working on it" can last minutes and may pause for an
        approval, so it also says the tab can be closed — otherwise people sit
        and watch a spinner that has no reason to be watched.
      */}
      {state === 'sending'
        ? 'Starting the workflow'
        : 'Working on it — this can take a minute, and you can leave this page'}
    </div>
  )
}

/**
 * Everything a settled turn can be.
 *
 * Four statuses, four shapes, and an unexpected one shown as a failure rather
 * than quietly rendered as an answer. A status nobody planned for is the case
 * most likely to be wrong, so it is the case shown most loudly.
 */
function Answered({ turn, onPick }: { turn: Turn; onPick: (s: string) => void }) {
  if (turn.status === 'blocked' || turn.status === 'error') {
    return (
      <div className="rounded-xl border border-line-strong bg-paper p-4">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
          {turn.status === 'blocked' ? 'Refused' : 'Did not run'}
        </p>
        <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink">
          {turn.detail ?? 'No reason was given.'}
        </p>
        <p className="mt-2 text-[0.78rem] text-muted">
          Nothing was retried and nothing else was run in its place.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {turn.answer ? (
        <div className="rounded-xl rounded-bl-sm border border-line bg-paper px-4 py-3">
          <Prose html={turn.answer} />
        </div>
      ) : null}

      {turn.sources?.length ? (
        <details className="rounded-lg border border-line bg-canvas px-3.5 py-2.5">
          <summary className="cursor-pointer text-[0.78rem] font-medium text-ink-2">
            {turn.sources.length} source{turn.sources.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1">
            {turn.sources.map((s, i) => (
              <li key={i} className="text-[0.78rem] text-muted">
                {s.label ?? s.id} · {s.reporter} · {s.date}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {turn.withheld?.length ? (
        <p className="rounded-lg border border-line bg-canvas px-3.5 py-2 text-[0.78rem] text-ink-2">
          Withheld: {turn.withheld.map((w) => w.domain).join(', ')} — not shown to your role.
          What it contained is not stated.
        </p>
      ) : null}

      {turn.status === 'needs_clarification' ? (
        <Clarify question={turn.question} options={turn.options} onPick={onPick} />
      ) : null}

      {turn.status === 'needs_approval' && turn.approval ? (
        <ApprovalCard approval={turn.approval} />
      ) : null}
    </div>
  )
}

/**
 * A question back, with its plausible answers as buttons.
 *
 * Retyping an answer the system could have offered is friction with no purpose,
 * and the free-text box stays for everything the buttons did not anticipate.
 */
function Clarify({
  question, options, onPick,
}: { question?: string; options?: string[]; onPick: (s: string) => void }) {
  return (
    <div className="rounded-xl border border-brand/40 bg-brand-tint/40 p-4">
      <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-brand">
        One thing first
      </p>
      <p className="mt-1.5 text-[0.92rem] leading-relaxed text-ink">
        {question ?? 'Something is missing before this can be answered.'}
      </p>
      {options?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => onPick(o)}
              className="rounded-lg border border-brand bg-paper px-3 py-1.5 text-[0.82rem] font-medium text-brand hover:bg-brand-tint"
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The approval, in the conversation rather than somewhere else.
 *
 * An approval on another screen is an approval that gets given without being
 * read. It shows exactly what would be disclosed, to whom and why — and says
 * plainly that approving sends nothing, because in this prototype it does not,
 * and a card that implies otherwise would be the most consequential lie the
 * interface could tell.
 */
function ApprovalCard({ approval }: { approval: { what: string; to: string; why: string } }) {
  return (
    <div className="rounded-xl border border-line-strong bg-paper p-4">
      <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-muted">
        Needs your approval
      </p>
      <dl className="mt-2 space-y-1.5">
        {[['Would disclose', approval.what], ['To', approval.to], ['Why', approval.why]].map(
          ([k, v]) => (
            <div key={k} className="flex gap-2 text-[0.85rem]">
              <dt className="w-28 shrink-0 text-muted">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ),
        )}
      </dl>
      {/*
        No buttons here, deliberately.

        This card is built from what the trigger response said the run intends
        to disclose. It carries no request id, because at this point Yoxa has
        not yet raised the gate — so there is nothing a decision could be sent
        against, and a button here would be a button that does nothing. The
        answerable card appears at the top of the screen the moment the webhook
        delivers, usually within a few seconds.
      */}
      <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[0.82rem] text-ink-2">
        Nothing has been sent. The run has paused, and the decision will appear at the top of
        this screen as soon as it reaches you.
      </p>
    </div>
  )
}

/**
 * The workflow's HTML, drawn as conversation.
 *
 * Every block is a React element built from text — no markup from the workflow
 * ever reaches the DOM. See lib/prose.ts for why that matters more here than
 * it looks: the HTML is model-authored, and a record can legitimately contain
 * something shaped like a tag.
 *
 * Headings are set as small labels rather than headings. In a document a
 * heading organises a page; in a chat bubble it shouts. The words are worth
 * keeping and the volume is not.
 */
function Prose({ html }: { html: string }) {
  const blocks: Block[] = htmlToBlocks(html)
  const [copied, setCopied] = useState(false)

  if (!blocks.length) {
    return <p className="text-[0.9rem] italic text-muted">The workflow returned an empty answer.</p>
  }

  return (
    <div className="group/prose relative">
      <div className="space-y-2.5">
        {blocks.map((b, i) => {
          if (b.kind === 'heading')
            return (
              <p
                key={i}
                className="pt-1 text-[0.72rem] font-semibold uppercase tracking-wide text-muted"
              >
                {b.text}
              </p>
            )
          if (b.kind === 'list')
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[0.9rem] leading-relaxed text-ink">
                    <span aria-hidden className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          if (b.kind === 'quote')
            return (
              <p
                key={i}
                className="border-l-2 border-line-strong pl-3 text-[0.9rem] italic leading-relaxed text-ink-2"
              >
                {b.text}
              </p>
            )
          return (
            <p key={i} className="text-[0.92rem] leading-relaxed text-ink">
              {b.text}
            </p>
          )
        })}
      </div>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(htmlToText(html))
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        }}
        className="absolute right-0 top-0 rounded-md px-2 py-1 text-[0.72rem] text-muted opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover/prose:opacity-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------- opening */

/** What this person can usefully ask, in their own words rather than the system's. */
function Opening({ onPick, role }: { onPick: (s: string) => void; role: string }) {
  const prompts = STARTERS[role] ?? STARTERS.patient
  return (
    <div className="mb-8 rounded-xl border border-line bg-paper p-5">
      <h2 className="text-[0.95rem] font-semibold text-ink">Ask the record something</h2>
      <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-2">
        Your name, role, subject and purpose go with every message — they are shown above
        the box and come from your sign-in. You type the question.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-left text-[0.82rem] text-ink-2 hover:border-brand hover:text-brand"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

const STARTERS: Record<string, string[]> = {
  patient: [
    'What has changed for me since May?',
    'What could I try to make my commute less overwhelming?',
    'Write a handover for my OT.',
  ],
  psychologist: [
    'What has changed since the last session?',
    'What strategies have been tried and how did they go?',
    'Draft a handover for the OT.',
  ],
  employer: [
    'What has changed for Ananya in the last three months?',
    'What adjustments are currently in place?',
  ],
  university: ['What academic adjustments are in place?'],
  trusted: ['How has Ananya been recently?'],
}

/* ------------------------------------------------------------ the call */

/**
 * Starting a run.
 *
 * Sends the person's sentence and who they are — not a composed trigger. The
 * preamble is built on the server from the actor it resolves, because a
 * preamble composed in the page is a preamble the page can change, and the
 * preamble is the whole statement of who is asking and what they may ask for.
 * The screen shows a preview of it before sending; the server returns the text
 * it actually used, and that is the one displayed afterwards.
 *
 * This returns as soon as Yoxa has accepted the trigger, which is long before
 * there is an answer. What comes back is a run id.
 */
async function startRun(args: {
  message: string
  actorId: string | null
  patientId: string | null
}): Promise<Partial<Turn>> {
  try {
    const { isSupabaseConfigured, supabase } = await import('../../lib/supabase')
    if (!isSupabaseConfigured) {
      return { state: 'settled', status: 'error', detail: 'No backend is configured in this build.' }
    }

    const { data, error } = await supabase.functions.invoke('orca-chat', {
      body: {
        message: args.message,
        actor_id: args.actorId,
        patient_id: args.patientId,
      },
    })

    if (error || !data?.run_id) {
      // A refusal carries a reason worth showing; a network failure does not.
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : 'The workflow could not be started. Nothing was run, and no answer has been made up in its place.'
      return { state: 'settled', status: 'error', detail }
    }

    return {
      state: 'running',
      runId: String(data.run_id),
      workflow: data.workflow === 'produce' ? 'ORCA_PRODUCE' : 'ORCA_UNDERSTAND',
      // The authoritative text, replacing the preview composed in the browser.
      trigger: typeof data.trigger_text === 'string' ? data.trigger_text : undefined,
    }
  } catch {
    return {
      state: 'settled',
      status: 'error',
      detail: 'The request failed before it reached the workflow.',
    }
  }
}

/**
 * Whether a run row has become an answer yet, and what that answer is.
 *
 * Returns null while there is still nothing to show, which is what keeps a
 * queued run looking queued instead of flickering into an empty reply. A run
 * that ended without an answer still settles — "Blocked" with no text is a
 * real outcome and the person is owed it, rather than a spinner that never
 * stops.
 */
function settleFrom(row: RunRow): Partial<Turn> | null {
  const finished = ['Completed', 'Blocked', 'Escalated', 'Cancelled'].includes(row.status)
  if (!row.answer_html && !finished) return null

  const envelope = parseEnvelope(row.result ?? row.answer_html ?? null)
  return {
    state: 'settled',
    status: envelope.status,
    answer: envelope.answerHtml ?? row.answer_html ?? undefined,
    sources: envelope.sources,
    withheld: envelope.withheld,
    question: envelope.question ?? undefined,
    options: envelope.options,
    approval: envelope.approval ?? undefined,
    detail:
      envelope.detail ??
      (finished && !row.answer_html
        ? `The run ended at "${row.current_step}" without producing an answer.`
        : undefined),
  }
}
