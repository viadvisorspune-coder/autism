import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button, Card, CardBody, PageHeader } from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { guideConversation, guidePrompts } from '../../data/db'
import type { GuideMessage } from '../../data/types'
import { useUI } from '../../state/ui'
import { useSession } from '../../state/session'
import { isSupabaseConfigured } from '../../lib/supabase'
import { followRun, isWaitingOnAPerson, startRun } from '../../lib/agent'
import { markSeen, persistMessage, useLive } from '../../lib/live'
import type { ConversationData } from '../../lib/live'
import type { RunState } from '../../lib/agent'
import { RunProgress } from '../../components/RunProgress'
import {
  ContextBanner,
  ContextChoice,
  recapFor,
  useContextMode,
} from '../../components/ContextChoice'

/**
 * 4.1 ORCA Guide.
 *
 * One conversational surface that launches the underlying workflows — it is not
 * a separate AI product bolted onto the side of the app.
 */
export default function PatientGuide() {
  const location = useLocation() as { state?: { message?: string } }
  const { say } = useUI()
  const { option } = useSession()
  const [messages, setMessages] = useState<GuideMessage[]>(guideConversation)
  const [loadedHistory, setLoadedHistory] = useState(false)
  // Whether this conversation is carrying the record in with it. Asked once,
  // and the answer changes what is sent, not just what is drawn.
  const { mode, choose } = useContextMode('pt-ananya')
  const [showEarlier, setShowEarlier] = useState(false)
  const [historyCount, setHistoryCount] = useState(0)

  // The thread as it actually is, not as it was the first time anyone opened
  // this page. Polls too, so a reply written on another device turns up here.
  const stored = useLive<ConversationData>('conversation', 'pt-ananya', 8000)

  useEffect(() => {
    if (loadedHistory || !stored.data?.messages?.length) return
    setLoadedHistory(true)
    setHistoryCount(stored.data.messages.length)
    setMessages(
      stored.data.messages.map((m) => ({
        id: m.id,
        from: m.author === 'orca' ? 'orca' : 'patient',
        time: relativeDay(m.created_at),
        text: m.text,
      })),
    )
  }, [stored.data, loadedHistory])

  // Leaving stamps the visit, so the next arrival can say what changed.
  useEffect(() => {
    return () => {
      if (option?.personId) markSeen('pt-ananya', option.personId)
    }
  }, [option?.personId])
  const [draft, setDraft] = useState('')
  const [run, setRun] = useState<RunState | null>(null)
  const [starting, setStarting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const seeded = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const stopFollowing = useRef<(() => void) | null>(null)

  useEffect(() => () => stopFollowing.current?.(), [])

  // What "my previous context" means concretely, today, in this record.
  const recap = recapFor(
    'pt-ananya',
    (stored.data?.messages ?? []).filter((m) => m.author === 'person').map((m) => m.text),
  )
  const storedCount = stored.data?.messages?.length ?? 0
  const visible = mode === 'fresh' && !showEarlier ? messages.slice(historyCount) : messages

  const say2 = (text: string) => {
    setMessages((m) => [
      ...m,
      { id: `gm-o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from: 'orca', time: 'Just now', text },
    ])
    persistMessage('pt-ananya', option?.personId ?? 'u-ananya', text, 'orca')
  }

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || starting) return

    const user: GuideMessage = {
      id: `gm-u-${Date.now()}`,
      from: 'patient',
      time: 'Just now',
      text: trimmed,
    }
    setMessages((m) => [...m, user])
    setDraft('')
    persistMessage('pt-ananya', option?.personId ?? 'u-ananya', trimmed, 'person')

    // Without a backend there is nothing to send to, so the prototype's own
    // replies stand in — and the panel below says which of the two it is.
    if (!isSupabaseConfigured) {
      setMessages((m) => [...m, replyFor(trimmed)])
      return
    }

    setStarting(true)
    setRunError(null)
    setRun(null)
    stopFollowing.current?.()

    // The recap goes to the workflow, never into the thread as if the person
    // had typed it. What it contains is on screen above, verbatim.
    const outbound = mode === 'previous' && recap.preamble ? `${recap.preamble}${trimmed}` : trimmed

    void startRun(outbound, 'pt-ananya', option?.personId ?? 'u-ananya').then(({ runId, error }) => {
      setStarting(false)
      if (error || !runId) {
        setRunError(error ?? 'The workflow could not be started.')
        return
      }
      say2('Let me look at your record. This usually takes a few minutes — you do not need to wait here.')

      // Every change in the run becomes something ORCA says, so the
      // conversation is where the work appears rather than a panel beside it.
      const spoken = new Set<string>()
      stopFollowing.current = followRun(runId, (state) => {
        setRun(state)

        state.activity
          .filter((a) => a.result === 'Denied')
          .forEach((a) => {
            if (spoken.has(a.id)) return
            spoken.add(a.id)
            say2(`I did not do this: ${a.action}.${a.why ? ` ${a.why}` : ''}`)
          })

        const step = state.run.current_step
        if (step && step !== 'Trigger received' && !spoken.has(`step:${step}`)) {
          spoken.add(`step:${step}`)
          say2(narrate(step))
        }

        state.approvals.forEach((a) => {
          if (spoken.has(`ap:${a.request_id}`)) return
          spoken.add(`ap:${a.request_id}`)
          say2(`I have stopped, because this needs you rather than me. ${a.title}`)
        })

        if (isWaitingOnAPerson(state.run.status) && !spoken.has('stopped')) {
          spoken.add('stopped')
          say2(
            `I have gone as far as I can on my own. This is now waiting for ${state.run.waiting_for ?? 'a person'}, and nothing will move until they decide.`,
          )
        }
      })
    })
  }

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    if (location.state?.message) send(location.state.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="ORCA Guide"
        description="Tell me what is happening. I will use what you have already told ORCA, and I will show you where every suggestion comes from."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'ORCA Guide' }]}
      />

      {stored.data?.since_last_visit ? <SinceYouWereHere data={stored.data} /> : null}

      {storedCount > 0 ? (
        mode === null ? (
          <ContextChoice
            patientId="pt-ananya"
            recentMessages={(stored.data?.messages ?? [])
              .filter((m) => m.author === 'person')
              .map((m) => m.text)}
            onChoose={choose}
          />
        ) : (
          <ContextBanner mode={mode} count={recap.lines.length} onChange={() => choose(mode === 'previous' ? 'fresh' : 'previous')} />
        )
      ) : null}

      {/* Starting fresh folds the old thread away rather than deleting it. It
          is still one click back, because "I do not want to talk about that
          today" is not the same as "I never said it". */}
      {mode === 'fresh' && historyCount > 0 && !showEarlier ? (
        <button
          onClick={() => setShowEarlier(true)}
          className="mb-4 text-[0.83rem] text-muted underline-offset-2 hover:text-ink-2 hover:underline"
        >
          Show earlier conversation ({historyCount} message{historyCount === 1 ? '' : 's'})
        </button>
      ) : null}

      <div className="space-y-4">
        {visible.map((message) =>
          message.from === 'patient' ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[10px] rounded-br-sm bg-brand px-4 py-3 text-[0.92rem] leading-relaxed text-white">
                {message.text}
                <span className="mt-1 block text-[0.72rem] text-white/70">{message.time}</span>
              </div>
            </div>
          ) : (
            <Card key={message.id}>
              <CardBody>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
                    ORCA
                  </span>
                  <span className="text-[0.75rem] text-muted">{message.time}</span>
                </div>
                <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-ink">
                  {message.text}
                </p>

                {message.options?.length ? (
                  <ul className="mt-4 space-y-2">
                    {message.options.map((option, i) => (
                      <li
                        key={option.label}
                        className="rounded-[10px] border border-line px-4 py-3"
                      >
                        <p className="text-[0.9rem] font-medium text-ink">
                          {i + 1}. {option.label}
                        </p>
                        <p className="mt-0.5 text-[0.84rem] leading-relaxed text-ink-2">
                          {option.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {message.evidence ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <WhyButton title="ORCA Guide response" bundle={message.evidence} />
                    <span className="text-[0.78rem] text-muted">
                      Based on 3 of your reports and 2 professional observations
                    </span>
                  </div>
                ) : null}

                {message.actions?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {message.actions.map((action) => (
                      <Link
                        key={action.label}
                        to={action.href}
                        className="rounded-lg border border-line-strong px-3 py-2 text-[0.84rem] text-ink hover:bg-surface-2"
                      >
                        {action.label}
                      </Link>
                    ))}
                    <button
                      onClick={() => say('A message has been sent to Dr Kavita Nair.')}
                      className="rounded-lg border border-line-strong px-3 py-2 text-[0.84rem] text-ink hover:bg-surface-2"
                    >
                      Ask a person instead
                    </button>
                  </div>
                ) : null}

                {message.evidence ? <AiProvenance /> : null}
              </CardBody>
            </Card>
          ),
        )}
        <div ref={endRef} />
      </div>

      {starting || run || runError ? (
        <div className="mt-6">
          <RunProgress starting={starting} state={run} error={runError} />
        </div>
      ) : null}

      {/* ------------------------------------------------------ composer */}
      <div className="sticky bottom-0 mt-6 border-t border-line bg-canvas pt-4 pb-6">
        <div className="mb-2 flex flex-wrap gap-2">
          {guidePrompts.slice(0, 4).map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8rem] text-ink-2 hover:border-line-strong hover:text-ink"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write as much or as little as you like"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[0.92rem] leading-relaxed outline-none placeholder:text-muted"
          />
          <Button onClick={() => say('Attach a document — the file picker is not wired up in this prototype.')}>
            Attach
          </Button>
          <Button type="submit" variant="primary" disabled={starting}>
            {starting ? 'Sending…' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  )
}

/**
 * A step name is a label for the agent that produced it, not a sentence for the
 * person waiting on it. This says what each one means to them.
 */
function narrate(step: string): string {
  const map: Record<string, string> = {
    'Access, Purpose and Data Scope':
      'I am checking what can be shared here, and with whom. This is the part that decides what I am allowed to say.',
    'Longitudinal Context Retrieval':
      'I am reading back through your record — what you have told me, what your clinicians have documented, and what you have already tried.',
    'Evidence, Provenance and Uncertainty Analysis':
      'I am working out how solid each piece of this is, and where I am not certain.',
    'Current Need and Goal Formulation':
      'I am trying to state clearly what you actually need here, so the rest follows from that rather than from my guess.',
    'Clarification and Information Gap Resolution':
      'There is something I do not know yet, and I would rather ask than assume.',
    'Consequence and Authority Decision':
      'I am checking who has the authority to decide this. It may not be me, and it may not be them.',
  }
  return map[step] ?? `Working on: ${step.toLowerCase()}.`
}

/* -------------------------------------------------------------- canned replies */

function replyFor(input: string): GuideMessage {
  const text = input.toLowerCase()
  const base = { id: `gm-o-${Date.now()}`, from: 'orca' as const, time: 'Just now' }

  if (text.includes('appointment') || text.includes('prepare')) {
    return {
      ...base,
      text: 'Your next appointment is with Dr Kavita Nair on 25 August at 10:30. I can put together what has changed since 28 July, the outcome of the advance-notice strategy, and the two questions you already noted.\n\nYou will see the brief before anyone else does.',
      actions: [
        { label: 'Prepare the brief', href: '/patient/care/appointments/ap-1/prepare' },
        { label: 'Open the appointment', href: '/patient/care/appointments/ap-1' },
      ],
    }
  }

  if (text.includes('accommodation') || text.includes('work') || text.includes('employer')) {
    return {
      ...base,
      text: 'A request to your employer is already open and waiting on HR. They have asked one clarification question.\n\nIf you want to ask for something new instead, I can build a separate request. Either way, you decide exactly what leaves ORCA — your diagnosis and clinical notes are never included.',
      actions: [
        { label: 'Open the current request', href: '/patient/requests/rq-1' },
        { label: 'Start a new request', href: '/patient/work/request' },
      ],
    }
  }

  if (text.includes('document') || text.includes('understand a document')) {
    return {
      ...base,
      text: 'You have four documents saved. The employer handbook extract you uploaded on 14 August is still waiting for you to check what I pulled out of it — nothing from it has gone into your record yet.',
      actions: [
        { label: 'Review the extraction', href: '/patient/documents/doc-3' },
        { label: 'Open documents', href: '/patient/documents' },
      ],
    }
  }

  if (text.includes('pattern') || text.includes('understand')) {
    return {
      ...base,
      text: 'Across June, July and August, difficulty appears when a change arrives with little warning, in three different settings — work twice, university once. Written notice given several hours ahead was followed by ordinary days.\n\nThis is a pattern I have noticed, not a fact about you. It only becomes part of your record if you confirm it.',
      evidence: guideConversation[1].evidence,
      actions: [
        { label: 'See the proposed memory', href: '/patient/profile' },
        { label: 'Open my story', href: '/patient/story' },
      ],
    }
  }

  if (text.includes('strategy') || text.includes('try')) {
    return {
      ...base,
      text: 'The quiet-workspace trial is running until 2 September and has two check-ins so far. The advance-notice strategy needs adapting — it helps for planned changes but not same-hour ones.\n\nWould you like to add a check-in, or look at adapting the notice strategy?',
      actions: [
        { label: 'Add a check-in', href: '/patient/support/st-2' },
        { label: 'Review the notice strategy', href: '/patient/support/st-1' },
      ],
    }
  }

  return {
    ...base,
    text: 'Thank you for telling me. I have not saved this as part of your record — nothing is stored as a fact about you unless you confirm it.\n\nI can look for anything similar in your history, help you prepare for your next appointment, or turn this into a support strategy to try.',
    evidence: guideConversation[1].evidence,
    actions: [
      { label: 'Look for a pattern', href: '/patient/story' },
      { label: 'Try something', href: '/patient/support' },
      { label: 'Prepare for my appointment', href: '/patient/care/appointments/ap-1/prepare' },
    ],
  }
}


/* ------------------------------------------------- what changed while away */

/**
 * "Since you were last here" only earns its place if everything in it is
 * genuinely new. One that repeats what somebody has already read teaches them
 * to skip it, and then it is worse than nothing.
 */
function SinceYouWereHere({ data }: { data: ConversationData }) {
  const { events, decisions, runs } = data.since_last_visit
  const total = events.length + decisions.length + runs.length
  if (!data.last_seen_at || total === 0) return null

  return (
    <div className="mb-6">
      <Card>
        <CardBody>
          <p className="text-[0.88rem] font-medium text-ink">
            While you were away{total > 1 ? ` — ${total} things` : ''}
          </p>
          <ul className="mt-2 space-y-1.5">
            {decisions.map((d) => (
              <li key={d.id} className="text-[0.85rem] leading-relaxed text-ink-2">
                {d.title} — {d.decision ?? 'decided'}
              </li>
            ))}
            {runs.map((r) => (
              <li key={r.id} className="text-[0.85rem] leading-relaxed text-ink-2">
                {r.type} moved to {r.current_step.toLowerCase()}
              </li>
            ))}
            {events.map((e) => (
              <li key={e.id} className="text-[0.85rem] leading-relaxed text-ink-2">
                {e.title} was added to your record
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

/** Yesterday and "3 days ago" read better than a timestamp in a chat. */
function relativeDay(iso: string): string {
  const then = new Date(iso)
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}
