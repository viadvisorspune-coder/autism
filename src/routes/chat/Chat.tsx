import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/session'
import {
  type Identity,
  identityFrom,
  needsDocument,
  understandPreamble,
  understandTrigger,
} from '../../lib/trigger'

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

type Status = 'done' | 'needs_clarification' | 'needs_approval' | 'blocked' | 'error'

interface Turn {
  id: string
  at: string
  message: string
  trigger: string
  workflow: 'ORCA_UNDERSTAND' | 'ORCA_PRODUCE'
  state: 'sending' | 'settled'
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

    const settled = await runWorkflow(trigger, turn.workflow)
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, ...settled, state: 'settled' } : x)))
    setBusy(false)
  }

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
        {turns.length === 0 ? <Opening onPick={send} role={String(identity.role)} /> : null}
        <ol className="space-y-6">
          {turns.map((t) => (
            <li key={t.id}>
              <Asked turn={t} />
              {t.state === 'sending' ? <Working /> : <Answered turn={t} onPick={send} />}
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

function Working() {
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
      Running the workflow
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
          <p className="whitespace-pre-wrap text-[0.92rem] leading-relaxed text-ink">
            {turn.answer}
          </p>
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
  const [decision, setDecision] = useState<string | null>(null)
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
      {decision ? (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[0.82rem] text-ink-2">
          Recorded as <strong className="text-ink">{decision}</strong>. Nothing was sent —
          delivery is not built in this prototype.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {['Approve', 'Edit first', 'Decline'].map((d) => (
            <button
              key={d}
              onClick={() => setDecision(d.toLowerCase())}
              className={
                d === 'Approve'
                  ? 'rounded-lg bg-brand px-3.5 py-1.5 text-[0.82rem] font-medium text-paper'
                  : 'rounded-lg border border-line-strong px-3.5 py-1.5 text-[0.82rem] font-medium text-ink-2 hover:bg-canvas'
              }
            >
              {d}
            </button>
          ))}
        </div>
      )}
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
 * The one place the workflow is invoked.
 *
 * Deliberately the only function in this file that knows there is a backend at
 * all, so the screen above can be built and looked at before the orchestrator
 * exists. It calls `orca-chat` and, until that endpoint is deployed, says so
 * rather than inventing a reply — a chat interface that fabricates an answer
 * when the workflow did not run is worse than one that plainly failed.
 */
async function runWorkflow(trigger: string, workflow: string): Promise<Partial<Turn>> {
  try {
    const { isSupabaseConfigured, supabase } = await import('../../lib/supabase')
    if (!isSupabaseConfigured) {
      return { status: 'error', detail: 'No backend is configured in this build.' }
    }
    const { data, error } = await supabase.functions.invoke('orca-chat', {
      body: { trigger_text: trigger, workflow_name: workflow },
    })
    if (error) {
      return {
        status: 'error',
        detail:
          'The workflow could not be reached. Nothing was run, and no answer has been made up in its place.',
      }
    }
    return {
      status: (data?.status as Status) ?? 'error',
      answer: data?.answer,
      sources: data?.sources,
      withheld: data?.withheld,
      question: data?.next?.detail,
      options: data?.next?.options,
      approval: data?.approval,
      detail: data?.reason ?? data?.detail,
    }
  } catch {
    return { status: 'error', detail: 'The request failed before it reached the workflow.' }
  }
}
