import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/session'
import { useMaturity } from '../state/maturity'
import { useDraft } from '../lib/draft'
import { directReply } from '../lib/answer'
import type { LocalAction } from '../lib/answer'
import { laneFor, startedLine, type Lane } from '../lib/route'
import { followRun, startRun, waitingLabel } from '../lib/agent'
import type { RunState } from '../lib/agent'
import { markSeen, persistMessage, useLive } from '../lib/live'
import type { ConversationData } from '../lib/live'
import { documentsFor, eventsFor, strategiesFor } from '../data/db'

/**
 * The copilot rail — ORCA for the people working alongside the record.
 *
 * A deliberate departure from the patient interface, not an inconsistency.
 * Ananya's screens are calm because she is often reading them on a bad day;
 * a psychologist between appointments is at a workbench, and wants density,
 * a persistent rail, and an answer beside the thing it is about rather than
 * on another page.
 *
 * What it will not borrow from the genre: an answer without its sources. Every
 * reply names the records it drew on, because "3 relevant sources found" is
 * only reassuring if you can open all three — and in a clinical setting an
 * unsourced confident sentence is a liability rather than a feature.
 */

/** Every class written out, so the build can find them. */
const COPILOT_TONE = {
  patient: {
    badge: 'bg-brand',
    bubble: 'bg-brand-tint',
    label: 'text-brand',
    rule: '',
  },
  trusted: {
    badge: 'bg-brand',
    bubble: 'bg-brand-tint',
    label: 'text-brand',
    rule: '',
  },
  clinical: {
    badge: 'bg-clinical',
    bubble: 'bg-clinical-tint',
    label: 'text-clinical',
    rule: '',
  },
  organisation: {
    badge: 'bg-org',
    bubble: 'bg-org-tint',
    label: 'text-org',
    rule: '',
  },
  admin: {
    badge: 'bg-admin',
    bubble: 'bg-admin-tint',
    label: 'text-admin',
    rule: '',
  },
} as const

interface Source {
  label: string
  detail: string
  to: string
}

export function Copilot({
  onClose,
  question,
  onQuestionUsed,
}: {
  onClose: () => void
  /** A question pushed in from a shortcut elsewhere in the app. */
  question?: string | null
  onQuestionUsed?: () => void
}) {
  const { role, option, experience } = useSession()
  const { verbosity } = useMaturity()
  // Written out rather than composed, because Tailwind can only see class
  // names that appear literally in the source — a template string produces
  // classes that exist at runtime and were never generated.
  const tone = COPILOT_TONE[experience] ?? COPILOT_TONE.clinical
  const patientId = 'pt-ananya'

  const stored = useLive<ConversationData>('conversation', patientId, 8000)
  const [thread, setThread] = useState<
    {
      id: string
      from: 'you' | 'orca'
      text: string
      sources?: Source[]
      detail?: string
      actions?: LocalAction[]
    }[]
  >([])
  const [loaded, setLoaded] = useState(false)
  const { value: draft, setValue: setDraft, clear: clearDraft, restored } = useDraft(
    `copilot.${option?.personId ?? 'anon'}`,
  )
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const stopFollowing = useRef<(() => void) | null>(null)

  // Same as the patient Guide: load once, then merge. A workflow writing an
  // answer server-side has to be able to reach a panel that is already open.
  useEffect(() => {
    const incoming = stored.data?.messages
    if (!incoming?.length) return

    const asMessage = (m: { id: string; author: string; text: string }) => ({
      id: m.id,
      from: (m.author === 'orca' ? 'orca' : 'you') as 'orca' | 'you',
      text: m.text,
    })

    if (!loaded) {
      setLoaded(true)
      setThread(incoming.map(asMessage))
      return
    }

    setThread((current) => {
      const ids = new Set(current.map((m) => m.id))
      const texts = new Set(current.map((m) => m.text.trim()))
      const fresh = incoming.filter((m) => !ids.has(m.id) && !texts.has(m.text.trim()))
      return fresh.length ? [...current, ...fresh.map(asMessage)] : current
    })
  }, [stored.data, loaded])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread])

  // A question pushed in from a shortcut. Sent once, then released, so
  // reopening the panel does not ask it again.
  const asked = useRef<string | null>(null)
  useEffect(() => {
    if (!question || asked.current === question) return
    asked.current = question
    onQuestionUsed?.()
    void send(question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question])

  useEffect(() => {
    return () => {
      stopFollowing.current?.()
      if (option?.personId) markSeen(patientId, option.personId)
    }
  }, [option?.personId])

  const orca = (
    text: string,
    sources?: Source[],
    extra?: { detail?: string; actions?: LocalAction[] },
  ) => {
    setThread((t) => [
      ...t,
      { id: `o-${Date.now()}-${Math.random()}`, from: 'orca', text, sources, ...extra },
    ])
    persistMessage(patientId, option?.personId ?? '', text, 'orca')
  }

  /**
   * Answer here; start work only when work is what was asked for.
   *
   * The old order sent every message to the workflow and narrated the wait —
   * so "who is Tejas?" produced "Reading the record", then a line about the
   * platform, and eventually a PDF. The record is in this tab. It answers now,
   * and the workflow runs underneath only when something has to happen.
   */
  async function send(text: string, force = false) {
    const trimmed = text.trim()
    if (!trimmed) return

    setThread((t) => [...t, { id: `y-${Date.now()}`, from: 'you', text: trimmed }])
    persistMessage(patientId, option?.personId ?? '', trimmed, 'person')
    clearDraft()

    const local = directReply(trimmed, patientId, role ?? null)
    const lane: Lane = force ? 'act' : laneFor(trimmed, local.matched !== false)

    const actions: LocalAction[] = [...(local.actions ?? [])]
    if (lane === 'unsure') actions.unshift({ label: 'Think this through properly', think: trimmed })

    // The same rule as the guide: forcing the slow path is an answer to "I
    // could not match that", so do not lead with it again.
    const shrugged = force && local.matched === false
    const opener = shrugged ? 'Let me think about this one properly.' : local.text

    orca(
      lane === 'act' ? `${opener}\n\n${startedLine(verbosity === 'concise')}` : opener,
      shrugged ? [] : local.sources.length ? local.sources : sourcesFor(trimmed, patientId),
      { detail: shrugged ? undefined : local.detail, actions: shrugged ? [] : actions },
    )

    if (lane !== 'act') return

    setBusy(true)
    const { runId, error } = await startRun(trimmed, patientId, option?.personId ?? '')
    setBusy(false)

    if (error || !runId) {
      if (error) console.warn('workflow trigger failed:', error)
      orca(
        'I could not start that part. What I said above came from the record and still holds — but nothing has been sent to anyone.',
      )
      return
    }

    const spoken = new Set<string>()
    stopFollowing.current = followRun(runId, (state: RunState) => {
      state.activity
        .filter((a) => a.result === 'Denied')
        .forEach((a) => {
          if (spoken.has(a.id)) return
          spoken.add(a.id)
          orca(`I did not do this: ${a.action}.${a.why ? ` ${a.why}` : ''}`)
        })

      // Only announce a wait that a person could act on. "Still processing"
      // is not news, and the vendor's name is not hers to learn.
      const waiting = waitingLabel(state.run.waiting_for)
      if (waiting.isPerson && !spoken.has('waiting')) {
        spoken.add('waiting')
        orca(waiting.text)
      }
    })
  }

  return (
    <aside className="frost flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`flex h-6 w-6 items-center justify-center rounded-2xl ${tone.badge} text-[0.7rem] font-bold text-white`}
          >
            O
          </span>
          <span className="text-[0.9rem] font-semibold text-ink">{role === 'patient' ? 'Talk to ORCA' : 'ORCA copilot'}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close copilot"
          className="rounded-2xl px-2 py-1 text-[0.8rem] text-muted hover:bg-canvas hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {thread.length === 0 ? (
          <div className="rounded-[20px]  border-line bg-canvas px-4 py-3">
            <p className="text-[0.86rem] leading-relaxed text-ink-2">
              {role === 'patient'
                ? 'Tell me what is going on, in your own words. I will use what you have already told me, show you where anything I say comes from, and stop to ask before anything is shared.'
                : 'Ask about this person’s record and I will answer from what is in it, with the sources I used. I will tell you what I could not see as readily as what I could.'}
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          {thread.map((m) =>
            m.from === 'you' ? (
              <div key={m.id}>
                <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">
                  You
                </p>
                <p className="text-[0.88rem] leading-relaxed text-ink">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className={`rounded-[20px] px-4 py-3 ${tone.bubble}`}>
                <p className={`mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] ${tone.label}`}>
                  ORCA
                </p>
                <p className="whitespace-pre-line text-[0.88rem] leading-relaxed text-ink">{m.text}</p>

                {m.detail ? <Expandable text={m.detail} /> : null}

                {m.actions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.actions.map((a) =>
                      a.to ? (
                        <Link
                          key={a.label}
                          to={a.to}
                          className="rounded-full bg-surface px-2.5 py-1 text-[0.78rem] text-ink hover:bg-canvas"
                        >
                          {a.label}
                        </Link>
                      ) : (
                        <button
                          key={a.label}
                          onClick={() => {
                            if (a.think) void send(a.think, true)
                            else if (a.ask) void send(a.ask)
                          }}
                          className={`rounded-full px-2.5 py-1 text-[0.78rem] ${
                            a.think
                              ? 'bg-brand-tint text-brand-ink hover:bg-brand hover:text-white'
                              : 'bg-surface text-ink hover:bg-canvas'
                          }`}
                        >
                          {a.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}

                {m.sources?.length ? (
                  <div className={`mt-3 border-t pt-2.5 ${tone.rule}`}>
                    <p className="mb-1.5 text-[0.75rem] text-muted">
                      {m.sources.length} {m.sources.length === 1 ? 'source' : 'sources'} used
                    </p>
                    <ul className="space-y-1">
                      {m.sources.map((s) => (
                        <li key={s.label}>
                          <Link
                            to={s.to}
                            className="block text-[0.82rem] text-ink hover:underline"
                            title={s.detail}
                          >
                            {s.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {promptsFor(role ?? 'psychologist').map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              disabled={busy}
              className="rounded-full  bg-surface-2 px-2.5 py-1 text-[0.76rem] text-ink-2 hover:text-ink disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
          className="flex items-end gap-2"
        >
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a follow-up question…"
            className="min-w-0 flex-1 rounded-2xl  bg-surface-2 px-3 py-2 text-[0.86rem] leading-relaxed outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={`rounded-2xl px-3.5 py-2 text-[0.84rem] font-medium text-white disabled:opacity-50 ${tone.badge}`}
          >
            {busy ? '…' : 'Ask'}
          </button>
        </form>
        {restored && draft ? (
          <p className="mt-1.5 text-[0.74rem] text-state-wait">
            Picked up where you left off — this was still here from last time.
          </p>
        ) : null}
        <p className="mt-1.5 text-[0.74rem] leading-relaxed text-muted">
          Nothing here is shared with anyone. Anything that would leave the record stops for the
          patient first.
        </p>
      </div>
    </aside>
  )
}

/* --------------------------------------------------------------- sources */

/**
 * What the answer was drawn from, named and openable.
 *
 * Matched from the record rather than invented: if a question mentions notice
 * or a strategy, the strategies that exist are what get cited. A source list
 * nobody can open is decoration, and decoration that looks like evidence is
 * worse than none.
 */
function sourcesFor(question: string, patientId: string): Source[] {
  const q = question.toLowerCase()
  const sources: Source[] = []

  strategiesFor(patientId)
    .filter((s) => q.split(/\s+/).some((word) => word.length > 4 && s.title.toLowerCase().includes(word)))
    .slice(0, 2)
    .forEach((s) =>
      sources.push({ label: s.title, detail: `${s.status} · ${s.phase}`, to: `/patient/support/${s.id}` }),
    )

  if (/document|report|letter|evidence/.test(q)) {
    documentsFor(patientId)
      .slice(0, 2)
      .forEach((d) => sources.push({ label: d.title, detail: d.category, to: `/patient/documents/${d.id}` }))
  }

  if (sources.length < 3) {
    eventsFor(patientId)
      .slice(0, 3 - sources.length)
      .forEach((e) => sources.push({ label: e.title, detail: e.category, to: `/patient/story/${e.id}` }))
  }

  return sources
}

/** What each role tends to need, in their own words rather than the system's. */
function promptsFor(role: string): string[] {
  if (role === 'patient') {
    return ['Something has been difficult recently', 'Prepare for an appointment', 'Understand a pattern']
  }
  if (role === 'employer' || role === 'university') {
    return ['What am I allowed to see?', 'What has been requested?', 'What do I need to decide?']
  }
  if (role === 'admin') {
    return ['Which runs are stuck?', 'What was refused today?', 'Who has access to what?']
  }
  if (role === 'trusted') {
    return ['What has she chosen to share?', 'How can I help right now?']
  }
  return ['What changed since I last saw them?', 'Is the current strategy working?', 'What am I missing?']
}


/** The rest of an answer, one press away. Same rule as the patient Guide. */
function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const blocks = text.split('\n\n').filter(Boolean)
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[0.79rem] font-medium text-ink-2 underline-offset-2 hover:underline"
      >
        {open ? 'Show less' : `More detail (${blocks.length})`}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-2 rounded-[16px] bg-surface px-3 py-2.5">
          {blocks.map((b) => (
            <p key={b} className="whitespace-pre-line text-[0.82rem] leading-relaxed text-ink-2">
              {b}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
