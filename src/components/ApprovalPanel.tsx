import { useEffect, useState } from 'react'
import { Button, Callout } from './ui'
import { Drawer } from '../app/shell/Panels'

/**
 * The decision panel.
 *
 * A workflow has stopped and is waiting on a person. This is where that person
 * decides. It is built on three assumptions about the moment it appears in:
 *
 *   1. Nothing has happened yet, and the panel says so before it says anything
 *      else. The most common fear at an approval screen is that the thing has
 *      already gone.
 *   2. Every option states what it will cause, in the same sentence structure,
 *      so the choice is a comparison rather than an interpretation.
 *   3. Choosing is two presses — select, then send — and the second press is
 *      labelled with what it does rather than with "Confirm". Nothing is
 *      irreversible by accident, and nothing is hurried. There is no timer.
 *
 * What is being withheld is shown as prominently as what is being sent,
 * because an approval that only lists what leaves is asking someone to consent
 * to an absence they cannot see.
 */

export interface ApprovalOption {
  id: string
  label: string
  description?: string
  consequence?: string
}

export interface PendingApproval {
  request_id: string
  title: string
  description: string | null
  options: ApprovalOption[]
  status: string
  created_at: string
  workflow_run_id: string | null
  will_send?: string[]
  withheld?: string[]
  recipient?: string | null
}

export function ApprovalPanel({
  approval,
  onClose,
  onDecide,
}: {
  approval: PendingApproval
  onClose: () => void
  onDecide: (optionId: string | null, message: string | null) => Promise<string | null>
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [writing, setWriting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Escape closes. Nothing is lost by closing, which is stated on the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  const ready = writing ? message.trim().length > 0 : chosen !== null

  async function send() {
    setSending(true)
    setError(null)
    const failure = await onDecide(writing ? null : chosen, writing ? message.trim() : null)
    setSending(false)
    if (failure) setError(failure)
    else onClose()
  }

  return (
    <Drawer
      title="A decision is needed"
      subtitle={approval.title}
      onClose={onClose}
      width="w-[32rem]"
    >
      <div className="mb-5">
        <Callout tone="info" title="Nothing has been sent">
          This is waiting for you. It will stay exactly as it is until you choose something, and closing
          this panel changes nothing.
        </Callout>
      </div>

      {approval.description ? (
        <div className="mb-5">
          <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            What is being asked
          </h3>
          <p className="text-[0.88rem] leading-relaxed text-ink">{approval.description}</p>
        </div>
      ) : null}

      {approval.recipient ? (
        <div className="mb-5">
          <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Who would receive it
          </h3>
          <p className="text-[0.88rem] text-ink">{approval.recipient}</p>
        </div>
      ) : null}

      {approval.will_send?.length ? (
        <div className="mb-5">
          <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            What would leave your record
          </h3>
          <ul className="space-y-1.5">
            {approval.will_send.map((item) => (
              <li key={item} className="text-[0.87rem] leading-relaxed text-ink">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {approval.withheld?.length ? (
        <div className="mb-5 rounded-[20px]  border-line bg-canvas px-4 py-3">
          <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            What would stay private
          </h3>
          <ul className="space-y-1.5">
            {approval.withheld.map((item) => (
              <li key={item} className="text-[0.85rem] leading-relaxed text-ink-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
        Your choice
      </h3>

      <div className="mb-4 space-y-2">
        {approval.options.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer items-start gap-3 rounded-[20px]  px-4 py-3 ${
              chosen === option.id && !writing ? 'border-brand bg-brand-tint' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="approval-option"
              className="mt-1"
              checked={chosen === option.id && !writing}
              onChange={() => {
                setChosen(option.id)
                setWriting(false)
              }}
            />
            <span>
              <span className="block text-[0.89rem] font-medium text-ink">{option.label}</span>
              {option.description ? (
                <span className="mt-0.5 block text-[0.83rem] leading-relaxed text-ink-2">
                  {option.description}
                </span>
              ) : null}
              {option.consequence ? (
                <span className="mt-1 block text-[0.81rem] text-muted">
                  If you choose this: {option.consequence}
                </span>
              ) : null}
            </span>
          </label>
        ))}

        {/* Always available. A set of options someone did not want to pick from
            is not a decision, and "none of these" needs somewhere to go. */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-[20px]  px-4 py-3 ${
            writing ? 'border-brand bg-brand-tint' : 'border-line'
          }`}
        >
          <input
            type="radio"
            name="approval-option"
            className="mt-1"
            checked={writing}
            onChange={() => {
              setWriting(true)
              setChosen(null)
            }}
          />
          <span>
            <span className="block text-[0.89rem] font-medium text-ink">None of these — I want to say something</span>
            <span className="mt-0.5 block text-[0.83rem] leading-relaxed text-ink-2">
              Write your own answer. It goes back in your words, not summarised.
            </span>
          </span>
        </label>
      </div>

      {writing ? (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="What would you like to happen?"
          className="mb-4 w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] leading-relaxed outline-none placeholder:text-muted"
        />
      ) : null}

      {error ? (
        <div className="mb-4">
          <Callout tone="alert" title="That did not send">
            {error} Nothing has changed. You can try again, and nothing you chose has been lost.
          </Callout>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" disabled={!ready || sending} onClick={send}>
          {sending ? 'Sending…' : 'Send this decision'}
        </Button>
        <Button variant="quiet" disabled={sending} onClick={onClose}>
          Not now
        </Button>
      </div>
      <p className="mt-2 text-[0.79rem] leading-relaxed text-muted">
        There is no time limit. Coming back to this later is a normal thing to do, and nothing happens
        while you are away.
      </p>
    </Drawer>
  )
}
