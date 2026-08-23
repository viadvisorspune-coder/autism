import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, PageHeader } from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { guideConversation, guidePrompts } from '../../data/db'
import type { GuideMessage } from '../../data/types'
import { useUI } from '../../state/ui'
import { useSession } from '../../state/session'
import { isSupabaseConfigured } from '../../lib/supabase'
import { followRun, isWaitingOnAPerson, startRun, waitingLabel } from '../../lib/agent'
import { markSeen, persistMessage, useLive } from '../../lib/live'
import type { ConversationData } from '../../lib/live'
import type { RunState } from '../../lib/agent'
import { RunProgress } from '../../components/RunProgress'
import { useDraft } from '../../lib/draft'
import { directReply } from '../../lib/answer'
import { laneFor, startedLine, type Lane } from '../../lib/route'
import { useMaturity } from '../../state/maturity'
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

  // First poll replaces the thread with the real one. Every poll after that
  // merges in anything new — which is how a message written by a workflow, on
  // the server, minutes after the question was asked, arrives here without a
  // reload. Before this the history was read once and then frozen, so an agent
  // could answer into a conversation nobody was watching any more.
  useEffect(() => {
    const incoming = stored.data?.messages
    if (!incoming?.length) return

    if (!loadedHistory) {
      setLoadedHistory(true)
      setHistoryCount(incoming.length)
      setMessages(incoming.map(asGuideMessage))
      return
    }

    setMessages((current) => {
      const ids = new Set(current.map((m) => m.id))
      // Also matched on text: a message this browser sent is written to the
      // server without its id coming back, so it returns from the next poll
      // looking like a new one.
      const texts = new Set(current.map((m) => m.text.trim()))
      const fresh = incoming.filter((m) => !ids.has(m.id) && !texts.has(m.text.trim()))
      return fresh.length ? [...current, ...fresh.map(asGuideMessage)] : current
    })
  }, [stored.data, loadedHistory])

  // Leaving stamps the visit, so the next arrival can say what changed.
  useEffect(() => {
    return () => {
      if (option?.personId) markSeen('pt-ananya', option.personId)
    }
  }, [option?.personId])
  const { value: draft, setValue: setDraft, clear: clearDraft, restored } = useDraft(
    `guide.${option?.personId ?? 'anon'}`,
  )
  const { verbosity } = useMaturity()
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
  // The most recent thing the person said in their own words, which is what a
  // request should be built out of.
  const lastSaid = [...messages].reverse().find((m) => m.from === 'patient')?.text ?? ''

  const say2 = (text: string, extra?: Partial<GuideMessage>) => {
    setMessages((m) => [
      ...m,
      {
        id: `gm-o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: 'orca',
        time: 'Just now',
        text,
        ...extra,
      },
    ])
    // Only the answer is kept. The detail and the buttons are rebuilt from the
    // record whenever it is read, so storing them would be storing a stale copy.
    persistMessage('pt-ananya', option?.personId ?? 'u-ananya', text, 'orca')
  }

  /**
   * Send, and let the front decide what that means.
   *
   * The order here is the whole change. Every message used to go straight to
   * the workflow service and the person waited — for a question the record in
   * this tab could have answered in a hundred milliseconds, and which came
   * back, minutes later, as a PDF. Now the browser answers first, every time,
   * and the workflow is started underneath only when the message asks for
   * something to actually happen: a letter written, a request sent, somebody
   * else told.
   *
   * Nothing about that machinery reaches the conversation. No step names, no
   * vendor, no queue position. If the run needs a decision from this person
   * they hear about the decision; if it produces something they see the thing.
   * Everything in between is ORCA's problem, not theirs.
   *
   * `force` is the one door to the slow path, and only a person opens it: the
   * button on an unmatched answer that says think this through properly.
   */
  const send = (text: string, force = false) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const user: GuideMessage = {
      id: `gm-u-${Date.now()}`,
      from: 'patient',
      time: 'Just now',
      text: trimmed,
    }
    setMessages((m) => [...m, user])
    clearDraft()
    persistMessage('pt-ananya', option?.personId ?? 'u-ananya', trimmed, 'person')

    // Without a backend there is nothing to send to, so the prototype's own
    // replies stand in — and the panel below says which of the two it is.
    if (!isSupabaseConfigured) {
      setMessages((m) => [...m, replyFor(trimmed)])
      return
    }

    // 1. Answer, from the record, here. This is not a fallback any more.
    const local = directReply(trimmed, 'pt-ananya', 'patient')
    const lane: Lane = force ? 'act' : laneFor(trimmed, local.matched !== false)
    const escalating = lane === 'act'

    const actions: NonNullable<GuideMessage['actions']> = (local.actions ?? []).map((a) => ({
      label: a.label,
      href: a.to,
      ask: a.ask,
    }))
    // 2. Nothing matched, and nothing is being started. Offer the slow path
    //    rather than putting somebody on it: a run takes minutes, and choosing
    //    to wait is theirs to make.
    if (lane === 'unsure') {
      actions.unshift({ label: 'Think this through properly', think: trimmed })
    }

    say2(escalating ? `${local.text}\n\n${startedLine(verbosity === 'concise')}` : local.text, {
      detail: local.detail,
      actions,
    })

    if (!escalating) return

    // 3. Something has to happen. That part goes to the workflow, quietly.
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
        // The status code and the support reference go to the panel below,
        // which is where somebody maintaining this would look. What ORCA says
        // is that it could not start, and the answer above still stands.
        setRunError(error ?? 'The workflow could not be started.')
        say2(
          'I could not start that part. What I told you above still holds — it came from your record — but nothing has been sent to anyone, and you can try again whenever you like.',
        )
        return
      }

      // Only things that concern this person become messages. A step name is
      // an internal label; it is not news.
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

        state.approvals.forEach((a) => {
          if (spoken.has(`ap:${a.request_id}`)) return
          spoken.add(`ap:${a.request_id}`)
          say2(`I have stopped, because this needs you rather than me. ${a.title}`)
        })

        if (isWaitingOnAPerson(state.run.status) && !spoken.has('stopped')) {
          const waiting = waitingLabel(state.run.waiting_for)
          // Only when it is genuinely with a *person*. Waiting on machinery is
          // not something to tell somebody about; it is something to finish.
          if (waiting.isPerson) {
            spoken.add('stopped')
            say2(`I have gone as far as I can on my own. ${waiting.text}`)
          }
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
              <div className="max-w-[85%] rounded-[20px] rounded-br-sm bg-brand px-4 py-3 text-[0.92rem] leading-relaxed text-white">
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
                        className="rounded-[20px]  border-line px-4 py-3"
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

                {message.detail ? <MoreDetail text={message.detail} /> : null}

                {message.actions?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {message.actions.map((action) =>
                      action.href ? (
                        <Link
                          key={action.label}
                          to={action.href}
                          className="rounded-2xl bg-surface-2 px-3 py-2 text-[0.84rem] text-ink hover:bg-brand-tint"
                        >
                          {action.label}
                        </Link>
                      ) : (
                        <button
                          key={action.label}
                          onClick={() => {
                            if (action.think) send(action.think, true)
                            else if (action.ask) send(action.ask)
                          }}
                          className={`rounded-2xl px-3 py-2 text-[0.84rem] ${
                            action.think
                              ? 'bg-brand-tint text-brand-ink hover:bg-brand hover:text-white'
                              : 'bg-surface-2 text-ink hover:bg-brand-tint'
                          }`}
                        >
                          {action.label}
                        </button>
                      ),
                    )}
                    <button
                      onClick={() => say('A message has been sent to Dr Kavita Nair.')}
                      className="rounded-2xl  border-line-strong px-3 py-2 text-[0.84rem] text-ink hover:bg-surface-2"
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

      {/* Behind the fold, deliberately.
          There is a real machine under this and somebody occasionally wants to
          see it — but it is not part of anyone's care, and putting its step
          names in front of a person who asked when their appointment is makes
          them responsible for understanding an architecture. Closed unless
          asked for, and never opened by a failure. */}
      {run || runError ? (
        <details className="mt-6 rounded-[20px] bg-surface-2 px-5 py-4">
          <summary className="cursor-pointer text-[0.83rem] font-medium text-ink-2">
            What ORCA is doing behind this
          </summary>
          <div className="mt-3">
            <RunProgress starting={starting} state={run} error={runError} />
          </div>
        </details>
      ) : null}

      <ContinueAsRequest lastSaid={lastSaid} />

      {/* ------------------------------------------------------ composer */}
      <div className="sticky bottom-0 mt-6 border-t border-line bg-canvas pt-4 pb-6">
        <div className="mb-2 flex flex-wrap gap-2">
          {guidePrompts.slice(0, 4).map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              className="rounded-full  bg-surface-2 px-3 py-1.5 text-[0.8rem] text-ink-2 hover:text-ink"
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
            className="min-w-0 flex-1 rounded-2xl  bg-surface-2 px-4 py-3 text-[0.92rem] leading-relaxed outline-none placeholder:text-muted"
          />
          <Button onClick={() => say('Attach a document — the file picker is not wired up in this prototype.')}>
            Attach
          </Button>
          <Button type="submit" variant="primary">
            Send
          </Button>
        </form>
        {restored && draft ? (
          <p className="mt-2 text-[0.79rem] text-state-wait">
            This was still here from last time. Nothing was sent.
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** One stored row as the conversation renders it. */
function asGuideMessage(m: { id: string; author: string; text: string; created_at: string }): GuideMessage {
  return {
    id: m.id,
    from: m.author === 'orca' ? 'orca' : 'patient',
    time: relativeDay(m.created_at),
    text: m.text,
  }
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


/* ------------------------------------------------ conversation into a request */

/**
 * The handoff.
 *
 * The gap this closes is the one people give up in. Somebody explains their
 * situation properly, in their own words, once — and is then shown a form and
 * asked to explain it again in fields. Most people stop there, and the request
 * that would have helped them never gets made.
 *
 * So the conversation carries. What they wrote becomes the first field of the
 * request, marked as theirs, editable, and nothing is sent from here: the
 * builder still ends with the whole thing on screen before it goes anywhere.
 * Continuity is about not retyping, never about skipping the review.
 */
function ContinueAsRequest({ lastSaid }: { lastSaid: string }) {
  const navigate = useNavigate()
  if (lastSaid.trim().length < 25) return null

  return (
    <div className="mt-6 rounded-[20px]  bg-surface-2 px-5 py-4">
      <p className="text-[0.89rem] font-medium text-ink">Turn this into a request?</p>
      <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-2">
        What you have written here can start a request to your employer or university without
        typing it again. You will see exactly what would be sent before anyone else does.
      </p>
      <Button
        variant="primary"
        onClick={() => navigate('/patient/work/request', { state: { from: lastSaid } })}
      >
        Start a request from this
      </Button>
    </div>
  )
}


/**
 * The rest of it, behind one press.
 *
 * The answer is the answer. Everything a person might want next — the dates,
 * the scopes, the check-in notes — is real and worth keeping, but putting it
 * in front of the answer is how a two-line reply became a paragraph nobody
 * finished reading. Closed by default; the label says roughly how much is
 * inside so nobody has to press it to find out whether it was worth pressing.
 */
function MoreDetail({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const blocks = text.split('\n\n').filter(Boolean)

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[0.84rem] font-medium text-brand underline-offset-2 hover:underline"
      >
        {open ? 'Show less' : `More detail (${blocks.length})`}
      </button>
      {open ? (
        <div className="mt-2 space-y-2.5 rounded-[20px] bg-canvas px-4 py-3">
          {blocks.map((block) => (
            <p key={block} className="whitespace-pre-line text-[0.86rem] leading-relaxed text-ink-2">
              {block}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
