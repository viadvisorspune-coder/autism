/**
 * What to do with an answer.
 *
 * An answer used to be the end of the screen. You read it, and then you went
 * back to Ask and typed something else — which is a chat transcript, not a
 * record system. Everybody who reaches this screen reaches it in the middle of
 * a job: Ananya is deciding whether to send something to her employer, Kavita
 * is deciding whether this belongs in a handover, Anil is deciding whether he
 * has enough to act on. The next step was always there and was never on the
 * screen.
 *
 * ROLE DECIDES THE ROW, BECAUSE THE JOB IS DIFFERENT. Ananya can put an answer
 * into her own record; a clinician cannot, because writing into somebody's
 * medical record from a generated summary is exactly the thing this product
 * exists to make impossible without a person deciding. A clinician drafts a
 * document instead, which goes to Ananya for a decision. Anil drafts a note for
 * his own file and nothing else, because nothing he does writes into her
 * clinical record.
 *
 * ONE FILLED BUTTON. The row is secondary controls with at most one primary,
 * and the primary is the thing the role most often wants next — never three
 * things competing to be the obvious one.
 */
import { useNavigate } from 'react-router-dom'
import type { Role } from '../data/types'
import type { Ask } from './asks'
import { htmlToText } from '../lib/prose'
import { ActionButton, useAction } from './action'

export interface NextStep {
  label: string
  /** The one filled control, if this role has one here. */
  primary?: boolean
  run: () => Promise<boolean> | boolean
  working?: string
  done?: string
  failed?: string
}

/**
 * A question asked again with a phrase added.
 *
 * "More detail" is not a different question and must not look like one — the
 * heading of the next screen is still what the person typed, with the request
 * appended, so the thread stays legible as one thing they wanted rather than
 * two things they asked.
 */
export function again(question: string, addition: string): string {
  return `${question.trim().replace(/[?.]$/, '')}. ${addition}`
}

export default function NextSteps({
  item,
  role,
  ask,
  onSave,
  onFlag,
}: {
  item: Ask
  role: Role | null
  ask: (question: string) => Promise<string>
  /** Raises an open item on Tasks, for the roles that chase them. */
  onFlag?: (title: string) => Promise<boolean>
  /**
   * Puts the answer into the record, for the one person entitled to do that.
   *
   * Passed in rather than called here, because the screen holds the outcome —
   * saving is a write, and a write that reports nowhere is the fire-and-forget
   * pattern this interface has spent the last two passes removing.
   */
  onSave?: (title: string, body: string) => Promise<boolean>
}) {
  const navigate = useNavigate()
  const mine = role === 'patient'

  const steps: NextStep[] = []

  // Everybody gets this one. It is the most common thing anybody wants from an
  // answer and it was previously a retype.
  steps.push({
    label: 'More detail',
    working: 'Checking your record…',
    done: 'Asked',
    failed: 'Did not send',
    async run() {
      const id = await ask(again(item.question, 'Give more detail, and say what it is based on.'))
      navigate(`/ask/${id}`)
      return true
    },
  })

  if (mine && onSave) {
    steps.push({
      label: 'Save this answer to my record',
      primary: true,
      working: 'Saving…',
      done: 'Saved ✓',
      failed: 'Not saved',
      run: () =>
        onSave(
          `Answer to: ${item.question}`,
          htmlToText(item.answer ?? ''),
        ),
    })
    steps.push({
      label: 'Make a document from this',
      working: 'Creating your document…',
      done: 'Document ready',
      failed: 'Not created',
      async run() {
        const id = await ask(
          again(item.question, 'Write this up as a document I could send to someone.'),
        )
        navigate(`/ask/${id}`)
        return true
      },
    })
  }

  if (!mine && role !== 'trusted' && role !== 'admin') {
    steps.push({
      label: 'Draft a document from this',
      primary: true,
      working: 'Creating your document…',
      done: 'Document ready',
      failed: 'Not created',
      async run() {
        const id = await ask(
          again(item.question, 'Write this up as a document for the person it concerns to decide on.'),
        )
        navigate(`/ask/${id}`)
        return true
      },
    })

    /**
     * The thought that had nowhere to go.
     *
     * Reading an answer and deciding somebody should follow it up is the most
     * common thing that happens on this screen and the only one that used to
     * end in a notebook. It becomes an open item on Tasks addressed to this
     * person's own role — never to a colleague, because nobody should be able
     * to put work on somebody else's list from a screen they are only reading.
     *
     * The question is the title, so the item says what it is about without
     * quoting an answer. An answer copied into a task is a clinical claim
     * detached from its sources, which is the shape this product refuses.
     */
    if (onFlag) {
      steps.push({
        label: 'Flag for follow-up',
        working: 'Saving…',
        done: 'On your list ✓',
        failed: 'Not saved',
        run: () => onFlag(item.question),
      })
    }
  }

  if (role === 'trusted') {
    steps.push({
      label: 'Write a note for Ananya',
      primary: true,
      run() {
        navigate('/notes')
        return true
      },
    })
  }

  steps.push({
    label: 'Ask something else',
    run() {
      // Deliberately without the question in tow. "Back to Ask" is the control
      // that keeps it; this one is the person saying they are done with it, and
      // handing it back would be the interface arguing.
      navigate('/ask')
      return true
    },
  })

  return (
    <section className="o-section">
      <h2 className="o-h3 mb-5">What next</h2>
      <div className="flex flex-wrap gap-4">
        {steps.map((s) => (
          <Step key={s.label} step={s} />
        ))}
      </div>
      {/*
        Said once, under the row, because it is the thing people assume wrongly.

        A document is written first and shown to the person whose record it is
        before it goes anywhere. Nothing on this row sends anything to anybody —
        which is exactly what somebody hesitating over "draft a document about
        my colleague's health" needs to know before they press it, not after.
      */}
      <p className="o-meta o-measure mt-5">
        Nothing here sends anything to anyone. A document is written first and shown to{' '}
        {mine ? 'you' : 'the person whose record it is'} for a decision — it appears in
        Decisions, and it goes nowhere until that decision is made.
      </p>
    </section>
  )
}

/**
 * A component per step, because each needs its own four states and hooks
 * cannot live inside a map.
 *
 * A step with no asynchronous work still goes through `useAction`: it costs
 * one render and it means every control in this row behaves identically,
 * including the ones that will grow a network call later.
 */
function Step({ step }: { step: NextStep }) {
  const action = useAction(async () => step.run())
  return (
    <ActionButton
      action={action}
      idle={step.label}
      working={step.working ?? 'Working…'}
      done={step.done ?? 'Done'}
      failed={step.failed ?? 'Did not work'}
      primary={step.primary}
    />
  )
}
