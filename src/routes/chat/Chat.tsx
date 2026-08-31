import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../../state/session'
import { type Block, htmlToBlocks, htmlToText } from '../../lib/prose'
import { type Identity, identityFrom, needsDocument, understandTrigger } from '../../lib/trigger'
import { type Attachment, type ConversationData, persistMessage, useLive } from '../../lib/live'
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
  path: string | null
  route_reason: string | null
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
  /**
   * Which of the five paths this took, and the sentence explaining it.
   *
   * Carried on the turn rather than looked up, because it is shown beside the
   * answer and has to survive the run row scrolling out of the poll window.
   */
  path?: string
  reason?: string
  /** Documents this run produced, matched to it by run id. */
  files?: Attachment[]
  /** True when this was rehearsed rather than run. */
  rehearsed?: boolean
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
  const [helpOpen, setHelpOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  /**
   * Whose record this conversation is about.
   *
   * No fallback. The previous default was the literal 'ANANYA-001', which is
   * not an id this system uses anywhere — the record is 'pt-ananya' — so a
   * session without a record composed a trigger naming a subject the
   * connectors could never resolve, and the workflow would have looked up
   * nothing and said so confidently.
   */
  const subjectId = patientId
  const identity: Identity = useMemo(
    () =>
      identityFrom(
        personName || option?.name || 'Unknown',
        role,
        subjectId ?? '',
        option?.personId ?? '',
      ),
    [personName, option?.name, role, subjectId],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, busy])

  async function send(text: string, dryRun = false) {
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
      dryRun,
    })
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, ...started } : x)))

    /**
     * The question, written into the record as well as the screen.
     *
     * Without this a reload loses the person's half of the conversation while
     * keeping ORCA's, which reads as though the answers arrived unprompted.
     * Fire-and-forget on purpose: a question that failed to save should not
     * stop the conversation being had.
     */
    // A rehearsal is not something the person asked, so it does not join the
    // conversation they will read back later.
    if (!dryRun && option?.personId && patientId) {
      persistMessage(patientId, option.personId, body, 'person', started.runId ?? null)
    }

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
  const { data: convoData } = useLive<ConversationData>('conversation')

  useEffect(() => {
    const rows = runData?.runs ?? []
    const said = convoData?.messages ?? []
    if (!rows.length && !said.length) return
    setTurns((current) => {
      let changed = false
      const next = current.map((t) => {
        if (t.state !== 'running' || !t.runId) return t

        /**
         * Two roads in, one turn.
         *
         * A workflow with API connectors answers by writing into the
         * conversation — that is the chat lane, and its reply arrives as a
         * message carrying this run's id. A workflow without them answers onto
         * its run row. Both are checked, because which one applies depends on
         * how a workflow was configured in Yoxa rather than on anything this
         * screen can see.
         */
        /**
         * A run's documents, wherever it ends up settling.
         *
         * The fifteen-step path produces a PDF and nothing else about a turn
         * says so — the answer text describes a document that, until now, the
         * person had no way to open. It was stored, signed and served the
         * whole time; the conversation simply never looked.
         */
        const files = (convoData?.attachments ?? []).filter((f) => f.workflow_run_id === t.runId)
        const withFiles = files.length ? { files } : {}

        const spoken = said.find((m) => m.author === 'orca' && m.workflow_run_id === t.runId)
        if (spoken) {
          changed = true
          return {
            ...t,
            ...withFiles,
            state: 'settled' as const,
            status: 'done' as const,
            answer: spoken.text,
          }
        }

        const row = rows.find((r) => r.id === t.runId)
        if (!row) return t
        const settled = settleFrom(row)
        if (!settled) return t
        changed = true
        return { ...t, ...withFiles, ...settled }
      })
      return changed ? next : current
    })
  }, [runData, convoData])

  /**
   * The conversation as it was left.
   *
   * Turns live in component state, so without this a reload shows an empty
   * screen while the record holds every question and answer. Somebody who
   * refreshed after asking about their own medical record would reasonably
   * conclude the question had been lost.
   *
   * Seeded once, and only into an empty screen: after that the live effect
   * above owns the turns, and re-seeding would duplicate everything on screen
   * each time the poll returned.
   */
  const seeded = useRef(false)
  useEffect(() => {
    const said = convoData?.messages ?? []
    if (seeded.current || !said.length || turns.length) return
    seeded.current = true

    const restored: Turn[] = []
    for (const m of said) {
      if (m.author === 'person') {
        restored.push({
          id: m.id,
          at: m.created_at,
          message: m.text,
          trigger: '',
          workflow: needsDocument(m.text) ? 'ORCA_PRODUCE' : 'ORCA_UNDERSTAND',
          state: 'settled',
          runId: m.workflow_run_id ?? undefined,
        })
        continue
      }
      // An answer attaches to the question above it. One that matches nothing
      // is still shown rather than dropped — an answer with no visible
      // question is confusing, but a silently discarded one is worse.
      const target = [...restored].reverse().find((t) => !t.answer)
      if (target) target.answer = m.text
      else
        restored.push({
          id: m.id,
          at: m.created_at,
          message: '',
          trigger: '',
          workflow: 'ORCA_UNDERSTAND',
          state: 'settled',
          status: 'done',
          answer: m.text,
        })
    }
    for (const t of restored) if (t.answer && !t.status) t.status = 'done'
    setTurns(restored)
  }, [convoData, turns.length])

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/*
        The heading says what the screen is for, not what it is called.

        It read "Workflow chat", which names ORCA's plumbing rather than the
        person's goal. A heading is a signpost: someone arriving here wants to
        know what they can do, and "workflow" is a word from our side of the
        screen.
      */}
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <h1 className="text-[1rem] font-semibold leading-snug">Ask about your record</h1>
            <p className="truncate text-[0.82rem] leading-relaxed text-muted">
              Signed in as {identity.name} · {String(identity.role)}
              {organisation ? ` · ${organisation}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/*
              Help sits in the same place on every screen, per the brief. It is
              a disclosure rather than a link away: leaving the page to find out
              how the page works is its own small cost.
            */}
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
              className="rounded-lg border border-line px-3 py-2 text-[0.85rem] font-medium text-ink-2 hover:bg-canvas"
            >
              Help
            </button>
            <Link
              to="/"
              className="rounded-lg border border-line px-3 py-2 text-[0.85rem] font-medium text-ink-2 hover:bg-canvas"
            >
              Sign out
            </Link>
          </div>
        </div>
        {helpOpen ? <Help /> : null}
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
                <Working state={t.state} since={t.at} />
              )}
            </li>
          ))}
        </ol>
        <div ref={endRef} />
      </main>

      <Composer
        value={message}
        onChange={setMessage}
        onSend={() => send(message)}
        onRehearse={() => send(message, true)}
        busy={busy}
        willProduce={needsDocument(message)}
      />
    </div>
  )
}

/**
 * Help, in the same place on every visit.
 *
 * Short, practical and about this screen only. It answers the four things
 * somebody actually wonders here — what this is, what happens to what they
 * type, how long it takes, and who to reach if it matters — rather than
 * documenting the product.
 */
function Help() {
  const items: [string, string][] = [
    ['What this screen does', 'You ask a question about your record. ORCA reads the record and answers here.'],
    [
      'What happens to your question',
      'It is sent with your name and role so the record knows who is asking. It is not shared with anyone else.',
    ],
    [
      'How long it takes',
      'Usually under a minute. You can leave this page and come back — the answer will be here.',
    ],
    [
      'If something needs your permission',
      'It appears at the top of this page with what would be shared and who would see it. Nothing goes anywhere until you choose.',
    ],
    [
      'If you want to speak to a person',
      'Your coordinator can be reached through the main ORCA screens. This page will not contact anyone for you.',
    ],
  ]
  return (
    <div className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-3xl px-5 py-4">
        <h2 className="text-[0.9rem] font-semibold text-ink">Help with this screen</h2>
        <dl className="mt-2 space-y-3">
          {items.map(([term, detail]) => (
            <div key={term}>
              <dt className="text-[0.85rem] font-medium text-ink">{term}</dt>
              <dd className="mt-0.5 text-[0.85rem] leading-relaxed text-ink-2">{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
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
      {/*
        A heading that says what is being asked, not what our system is doing.

        "A workflow is waiting on you" describes ORCA's state; the person needs
        to know a decision is theirs to make. This is also the screen's one
        important action while it is present, so it is a heading rather than a
        label.
      */}
      <h2 className="text-[0.9rem] font-semibold text-ink">Your permission is needed</h2>
      <p className="mt-1 text-[0.88rem] leading-relaxed text-ink-2">{approval.title}</p>
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

      {/*
        Targets sized for a real finger and a tired one.

        These were 28px tall. The brief asks for at least 24×24 CSS pixels with
        spacing between them, and this is the highest-consequence control on
        the screen — a mis-tap here shares somebody's medical information.
      */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {choices.map((c, i) => (
          <button
            key={`${c.id ?? c.label}-${i}`}
            disabled={sending}
            onClick={() => decide(c.id, c.message)}
            className={
              i === 0
                ? 'rounded-lg bg-brand px-4 py-2.5 text-[0.88rem] font-medium text-paper disabled:opacity-50'
                : 'rounded-lg border border-line-strong px-4 py-2.5 text-[0.88rem] font-medium text-ink-2 hover:bg-canvas disabled:opacity-50'
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-[0.82rem] leading-relaxed text-muted" aria-live="polite">
        {sending
          ? 'Sending your decision…'
          : failed
            ? failed
            : 'Nothing has been sent yet. This waits as long as you need.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- composer */

/**
 * One bordered surface: a label, the box, and the button.
 *
 * THE CREDENTIALS ARE NOT SHOWN HERE ANY MORE. They used to sit above the box,
 * on the reasoning that somebody asking about their own medical record is owed
 * sight of what is sent on their behalf. That reasoning was right about the
 * principle and wrong about the placement: name, role, subject, purpose, date
 * and three opaque identifiers are a form somebody has to read past to reach
 * the one field that is theirs, every single time. The brief asks for one goal
 * per screen and the smallest thing that works.
 *
 * The transparency stays, after the fact rather than in the way: every turn
 * carries "See exactly what was sent", showing the real composed trigger the
 * server returned. That is stronger than a preview, because it is what
 * actually left rather than what the page predicted would leave.
 */
function Composer({
  value, onChange, onSend, onRehearse, busy, willProduce,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  /**
   * Run the routing and composition without calling Yoxa.
   *
   * Deliberately a visible control rather than a hidden query parameter. It is
   * used most when a deployment is half-configured or a workflow is being
   * changed, which is exactly when somebody needs to see at a glance whether
   * what is on screen came from a real run.
   */
  onRehearse: () => void
  busy: boolean
  willProduce: boolean
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-5 py-4">
        <div className="overflow-hidden rounded-xl border border-line-strong bg-paper">
          {/*
            A visible label, not a placeholder.

            Placeholder text disappears the moment somebody types, taking the
            only description of the field with it — and it is the first thing
            lost by anyone who looks away mid-sentence.
          */}
          <div className="px-3.5 pt-3">
            <label htmlFor="orca-question" className="block text-[0.85rem] font-medium text-ink">
              Your question
            </label>
            <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">
              Ask about what is in your record, or ask for a document to be written. Nothing is
              sent to anyone else until you approve it.
            </p>
          </div>

          <textarea
            id="orca-question"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            rows={2}
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-ink outline-none"
          />

          <div className="flex items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
            {/*
              What will happen, in the person's words rather than ours.

              This named the deployments — "Will run ORCA_PRODUCE" — which is an
              internal identifier and tells somebody nothing about what they are
              about to get.
            */}
            <p className="text-[0.8rem] leading-relaxed text-muted">
              {value.trim()
                ? willProduce
                  ? 'Next: a draft is written. You see it first and decide whether it goes anywhere.'
                  : 'Next: your record is read and the answer appears here. Nothing is sent.'
                : 'Press Enter to send. Shift and Enter starts a new line.'}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onRehearse}
                disabled={busy || !value.trim()}
                title="Decide the route and compose the trigger, without running anything"
                className="rounded-lg border border-line-strong px-3.5 py-2 text-[0.85rem] font-medium text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
              >
                Rehearse
              </button>
              <button
                onClick={onSend}
                disabled={busy || !value.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-40"
              >
                {busy ? 'Running…' : 'Send'}
              </button>
            </div>
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
      <div className="mt-1.5 flex items-center justify-end gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="py-1 text-[0.8rem] font-medium text-brand hover:underline"
        >
          {open ? 'Hide what was sent' : 'See exactly what was sent'}
        </button>
        {/*
          What kind of request this was, in words.

          This printed the deployment name — ORCA_UNDERSTAND — which is an
          identifier from our configuration and means nothing to the person who
          asked. What they might want to know is whether this was a question or
          a document.
        */}
        <span className="text-[0.8rem] text-muted">
          {turn.workflow === 'ORCA_PRODUCE' ? 'Document' : 'Question'}
        </span>
      </div>
      {open ? (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[0.72rem] leading-relaxed text-ink-2">
          {turn.trigger}
        </pre>
      ) : null}
    </div>
  )
}

/**
 * How long a run may sit unanswered before the screen says something.
 *
 * Not a timeout — nothing is cancelled, and the run is still going at Yoxa.
 * It is the point at which continuing to show a spinner stops being honest.
 * Yoxa has no API for reading a finished run, so if a workflow ends without
 * passing through an approval gate, its answer has no way back into ORCA and
 * this screen will never learn it finished. A person watching dots forever
 * deserves to be told that, and told where the work actually went.
 */
const STALL_AFTER_MS = 3 * 60 * 1000

function Working({ state, since }: { state: 'sending' | 'running'; since?: string }) {
  // The stall notice depends on elapsed time, and nothing else on this screen
  // re-renders on a schedule, so it needs its own clock.
  const [, tick] = useState(0)
  useEffect(() => {
    if (state !== 'running') return
    const id = window.setInterval(() => tick((n) => n + 1), 15_000)
    return () => window.clearInterval(id)
  }, [state])

  const stalled =
    state === 'running' && since ? Date.now() - Date.parse(since) > STALL_AFTER_MS : false

  if (stalled) {
    return (
      <div className="rounded-xl border border-line bg-paper px-4 py-3">
        <p className="text-[0.85rem] text-ink">
          This is taking longer than usual.
        </p>
        {/*
          Plain about an odd situation, without explaining our plumbing.

          The person does not need to know which system holds the answer. They
          need to know nothing broke, nothing they did was wrong, and what they
          can do now.
        */}
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-ink-2">
          Your question was sent and is still being worked on. Nothing has failed and nothing has
          been lost. You can leave this page and come back. If anything needs your permission, it
          will appear at the top of this page.
        </p>
      </div>
    )
  }

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
        ? 'Starting'
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
/**
 * What ORCA decided to do, in one sentence, before it did it.
 *
 * The routing choice was being made, recorded and then never shown. That is a
 * loss on both sides of this product: a person handing over a question about
 * their medical record is owed the knowledge of what will happen to it, and a
 * reader watching over their shoulder cannot otherwise tell a system that
 * decides from one that guesses.
 *
 * The sentence comes from the server, which is the same place the decision was
 * made — so it cannot drift from the thing it describes.
 */
function Decision({ reason }: { reason: string }) {
  return (
    <p className="mb-2 border-l-2 border-line-strong pl-3 text-[0.83rem] leading-relaxed text-muted">
      {reason}
    </p>
  )
}

/**
 * What a person can reasonably do next, from where this turn ended.
 *
 * Offered rather than described. A finished answer usually raises the next
 * question, and the useful ones are predictable enough to put on a button —
 * which matters most for somebody who finds composing a follow-up from a blank
 * box the expensive part.
 *
 * Deliberately few, and never a bare verb. Each says what will happen, because
 * a button labelled "Share" on a page about somebody's medical record has to
 * be clearer than a button labelled "Share" anywhere else.
 */
function nextActions(turn: Turn): string[] {
  if (turn.status === 'error') return ['Try that again']
  if (turn.status === 'blocked') return ['What am I allowed to see?']
  if (turn.status !== 'done' || !turn.answer) return []

  // A draft that already exists needs deciding on, not extending.
  if (turn.workflow === 'ORCA_PRODUCE') {
    return ['Who would this go to?', 'What was left out of this?']
  }
  return [
    'Write this up for someone',
    'What has changed since then?',
    'Who can see this part of my record?',
  ]
}

/**
 * A document the run produced, offered rather than described.
 *
 * The fifteen-step path ends in a PDF. The answer text would say a document
 * had been prepared and the person had no way to open it — the file was
 * stored, signed and served the whole time, and the conversation was the only
 * place that never looked.
 *
 * The URL is signed and expires in half an hour, which is why this says so.
 * A dead link with no explanation reads as the document having been withdrawn.
 */
function Documents({ files }: { files: Attachment[] }) {
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-paper px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-[0.88rem] font-medium text-ink">{f.title}</p>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {f.file_type} · prepared {f.recorded_on}
            </p>
          </div>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-line-strong px-3.5 py-2 text-[0.83rem] font-medium text-ink-2 hover:border-brand hover:text-brand"
            >
              Open
            </a>
          ) : (
            <span className="shrink-0 text-[0.8rem] text-muted">Still being prepared</span>
          )}
        </div>
      ))}
      <p className="text-[0.78rem] text-muted">
        These links last about half an hour. Reload this page to get a fresh one.
      </p>
    </div>
  )
}

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

  const actions = nextActions(turn)

  return (
    <div className="space-y-3">
      {/*
        A rehearsal says so before anything else on the turn.
        
        Everything below it looks exactly like a real answer, because it came
        down the same road — same routing, same composition, same rendering.
        That fidelity is the point and also the hazard, so the label goes first,
        in the accent colour, above the reasoning rather than beside it.
      */}
      {turn.rehearsed ? (
        <p className="text-[0.8rem] font-semibold text-brand">
          Rehearsal — routed and composed, never sent. Nothing was read from the record.
        </p>
      ) : null}

      {turn.reason ? <Decision reason={turn.reason} /> : null}

      {turn.answer ? (
        <div className="rounded-xl rounded-bl-sm border border-line bg-paper px-4 py-3">
          <Prose html={turn.answer} />
        </div>
      ) : null}

      {turn.files?.length ? <Documents files={turn.files} /> : null}

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

      {/*
        Suggestions, and visibly so.

        Bordered and quiet rather than filled, because the primary action on
        this screen is the person's own next sentence. A row of solid buttons
        under an answer reads as instruction — pick one of these — and the
        point is the opposite: here are some things you might want, and you
        can ignore all of them.
      */}
      {actions.length ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => onPick(a)}
              className="rounded-lg border border-line-strong px-3.5 py-2 text-left text-[0.83rem] text-ink-2 hover:border-brand hover:text-brand"
            >
              {a}
            </button>
          ))}
        </div>
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
    return <p className="text-[0.9rem] italic text-muted">The answer came back empty. Nothing was left out on purpose.</p>
  }

  return (
    <div className="group/prose relative">
      <div className="space-y-2.5">
        {blocks.map((b, i) => {
          if (b.kind === 'heading')
            /*
              A real heading, in sentence case.

              This was uppercase small-caps styling, which suits a two-word
              label and not the headings an answer actually carries — "Records
              this drew on", "What was not shown". Setting a sentence in caps
              costs legibility for the readers this product is for, and the
              brief reserves caps for short labels. It is also an <h3>, so the
              structure the answer was written with survives for a screen
              reader instead of flattening into styled paragraphs.
            */
            return (
              <h3 key={i} className="pt-1.5 text-[0.88rem] font-semibold leading-snug text-ink">
                {b.text}
              </h3>
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
  dryRun?: boolean
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
        dry_run: args.dryRun ?? false,
      },
    })

    if (error || !data?.run_id) {
      // A refusal carries a reason worth showing; a network failure does not.
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : 'Your question could not be sent. Nothing was read from your record, and no answer has been invented in its place. Please try again.'
      return { state: 'settled', status: 'error', detail }
    }

    return {
      state: 'running',
      runId: String(data.run_id),
      path: typeof data.path === 'string' ? data.path : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
      rehearsed: data.dry_run === true,
      workflow: data.workflow === 'produce' ? 'ORCA_PRODUCE' : 'ORCA_UNDERSTAND',
      // The authoritative text, replacing the preview composed in the browser.
      trigger: typeof data.trigger_text === 'string' ? data.trigger_text : undefined,
    }
  } catch {
    return {
      state: 'settled',
      status: 'error',
      detail: 'Your question did not send. This is usually a connection problem. Check your connection, then send it again.',
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

  /**
   * The row's own state outranks the envelope's when the two disagree.
   *
   * Content that arrives attached to an approval gate has no envelope — it is
   * a description, so the parser reads a bare string and reasonably calls it
   * done. The run is not done: it is holding, waiting for a person, and
   * nothing has been sent. Showing "done" there would be the interface
   * asserting a consent decision that nobody has made yet, which is the one
   * thing this screen must never do.
   */
  const status: Status =
    row.status === 'Awaiting approval'
      ? 'needs_approval'
      : row.status === 'Awaiting information'
        ? 'needs_clarification'
        : envelope.status

  return {
    state: 'settled',
    status,
    path: row.path ?? undefined,
    reason: row.route_reason ?? undefined,
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
