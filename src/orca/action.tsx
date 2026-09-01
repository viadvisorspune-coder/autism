/**
 * A control that reports what it is doing.
 *
 * Every primary action in ORCA sends something somewhere and takes a moment
 * about it. Before this, each screen wrote its own `sending` boolean, swapped
 * its own label, and disabled itself — three lines that were slightly
 * different everywhere and identical in intent. This is that pattern, once.
 *
 * FOUR STATES, AND THE THIRD IS THE ONE PEOPLE FORGET. Idle, working, done,
 * failed. A button that returns silently to "Ask" has told the person nothing
 * about whether their question left, and the most common recovery from that
 * silence is to press it again.
 *
 * THE WIDTH NEVER CHANGES. "Ask" and "Sending" are different lengths, so a
 * button that swaps its text reflows itself and everything beside it at the
 * exact moment somebody's pointer is over it. Every label is rendered into the
 * same grid cell and all but one is hidden, so the control is as wide as its
 * longest state from the first paint and never moves again.
 *
 * NOTHING WAITS ON THE ANIMATION. `fire` runs the work immediately; the state
 * is a report on what is already happening, never a gate in front of it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ActionState = 'idle' | 'working' | 'done' | 'failed'

/**
 * How long a finished state stands before the control returns to rest.
 *
 * Long enough to be read by somebody who looked away as they pressed, short
 * enough that "Sent" never becomes the button's name. A failure holds longer,
 * because it asks the person to decide something and they may still be
 * reading why.
 */
const SETTLE_DONE = 1800
const SETTLE_FAILED = 4000

export interface Action {
  state: ActionState
  /** True while the work is in flight. Bind to `disabled`. */
  busy: boolean
  fire: () => void
  /** Puts the control back to rest without waiting for the timer. */
  reset: () => void
}

/**
 * Wraps one asynchronous action.
 *
 * `work` resolves false to mean "this did not succeed" — a refusal, a failed
 * send, a validation the caller did itself. Throwing means the same thing; a
 * rejected promise must never leave the control stuck on "Sending", because
 * that is indistinguishable from a slow network and the person will wait
 * through it.
 */
export function useAction(work: () => Promise<boolean | void>): Action {
  const [state, setState] = useState<ActionState>('idle')
  const running = useRef(false)
  const timer = useRef<number | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const settle = useCallback((next: ActionState) => {
    if (!alive.current) return
    setState(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(
      () => alive.current && setState('idle'),
      next === 'failed' ? SETTLE_FAILED : SETTLE_DONE,
    )
  }, [])

  const fire = useCallback(() => {
    /**
     * The guard is a ref, not the state.
     *
     * Two presses inside one frame both read the same `state` and both pass —
     * which is exactly the double submission this exists to prevent. A ref is
     * written synchronously and the second press sees it.
     */
    if (running.current) return
    running.current = true
    setState('working')

    void (async () => {
      try {
        const ok = await work()
        settle(ok === false ? 'failed' : 'done')
      } catch {
        settle('failed')
      } finally {
        running.current = false
      }
    })()
  }, [work, settle])

  const reset = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setState('idle')
  }, [])

  return { state, busy: state === 'working', fire, reset }
}

export interface ActionButtonProps {
  action: Action
  /** The four labels. `failed` falls back to idle when a screen has nothing better to say. */
  idle: string
  working: string
  done: string
  failed?: string
  primary?: boolean
  small?: boolean
  /** Disabled for a reason of the screen's own — an empty field, no subject chosen. */
  disabled?: boolean
  className?: string
  title?: string
  children?: ReactNode
}

const LABEL_ORDER: ActionState[] = ['idle', 'working', 'done', 'failed']

export function ActionButton({
  action,
  idle,
  working,
  done,
  failed,
  primary,
  small,
  disabled,
  className = '',
  title,
}: ActionButtonProps) {
  const labels: Record<ActionState, string> = {
    idle,
    working,
    done,
    failed: failed ?? idle,
  }

  return (
    <button
      type="button"
      className={`o-btn ${primary ? 'o-btn-primary' : ''} ${small ? 'o-btn-small' : ''} ${className}`}
      data-state={action.state}
      onClick={action.fire}
      disabled={disabled || action.busy}
      title={title}
      /**
       * `aria-busy` rather than a spinner. The label already says "Sending";
       * a second, silent indicator of the same fact is one more thing on the
       * screen saying what the words say.
       */
      aria-busy={action.busy}
    >
      {/*
        Every label, stacked, so the widest one sets the width once.

        `aria-live` sits on the visible label only — announcing all four would
        read the whole set aloud on every change. `aria-hidden` on the rest
        keeps them out of the accessibility tree while they hold the box open.
      */}
      <span className="o-swap">
        {LABEL_ORDER.map((s) => (
          <span
            key={s}
            className="o-swap-item"
            data-shown={action.state === s ? 'yes' : 'no'}
            aria-hidden={action.state === s ? undefined : true}
            aria-live={action.state === s ? 'polite' : undefined}
          >
            {labels[s]}
          </span>
        ))}
      </span>
    </button>
  )
}
