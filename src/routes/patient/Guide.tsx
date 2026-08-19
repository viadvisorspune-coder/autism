import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button, Card, CardBody, PageHeader } from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { guideConversation, guidePrompts } from '../../data/db'
import type { GuideMessage } from '../../data/types'
import { useUI } from '../../state/ui'

/**
 * 4.1 ORCA Guide.
 *
 * One conversational surface that launches the underlying workflows — it is not
 * a separate AI product bolted onto the side of the app.
 */
export default function PatientGuide() {
  const location = useLocation() as { state?: { message?: string } }
  const { say } = useUI()
  const [messages, setMessages] = useState<GuideMessage[]>(guideConversation)
  const [draft, setDraft] = useState('')
  const seeded = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  const send = (text: string) => {
    if (!text.trim()) return
    const user: GuideMessage = {
      id: `gm-u-${Date.now()}`,
      from: 'patient',
      time: 'Just now',
      text: text.trim(),
    }
    const reply = replyFor(text)
    setMessages((m) => [...m, user, reply])
    setDraft('')
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

      <div className="space-y-4">
        {messages.map((message) =>
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
          <Button type="submit" variant="primary">
            Send
          </Button>
        </form>
      </div>
    </div>
  )
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
