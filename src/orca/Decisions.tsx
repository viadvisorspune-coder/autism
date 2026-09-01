/**
 * Decisions — the governance moment, made visible.
 *
 * The single most demonstrable screen in the platform, and the reason is one
 * line: it shows the whole document that would be sent, not a summary of it,
 * and immediately beneath that it names what is NOT in it. The second half is
 * the disclosure control made visible to the person it protects.
 *
 * Nothing here happens on a timer, nothing expires, and nothing has a default.
 * A decision with a default is a decision somebody else made.
 */
import { useRef, useState } from 'react'
import { useSession } from '../state/session'
import { respondToApproval } from '../lib/approvals'
import { useLive } from '../lib/live'
import type { PendingApproval } from '../components/ApprovalPanel'
import { useAsks } from './asks'
import { useSubject } from './subject'
import {
  Card,
  CouldNotLoad,
  Loading,
  Nothing,
  PageTitle,
  Prose,
  SectionHead,
  Updated,
  longDate,
} from './parts'
import { domainName } from './system'
import { ActionButton, useAction } from './action'

export default function Decisions() {
  const { option, role } = useSession()
  const { subjectId } = useSubject()
  const { requests, answerRequest } = useAsks()
  const { data, loading, failed, updatedAt, refresh } = useLive<{ approvals: PendingApproval[] }>(
    'approvals',
    subjectId,
  )

  const waiting = (data?.approvals ?? []).filter((a) => a.status === 'Awaiting approval')
  // Access requests are addressed to the person whose record it is. Everybody
  // else sees the ones they raised, and whether they were answered.
  const mine = role === 'patient' ? requests.filter((r) => r.status === 'pending') : []
  const raised = role === 'patient' ? [] : requests.filter((r) => r.fromId === option?.personId)

  const count = waiting.length + mine.length
  // Until the first read comes back, the count is a count of nothing rather
  // than a count of zero — and "Nothing needs your decision" is exactly the
  // sentence somebody would act on by closing the tab.
  const reading = loading && !data

  /**
   * What the record now says about the last access decision.
   *
   * On the page rather than on the card, because the card disappears the
   * moment the decision lands — a confirmation living inside it would be
   * removed by the very thing it is confirming. And a decision about who may
   * read part of somebody's medical record is not something to announce with a
   * notice that leaves on a timer.
   */
  const [lastAccess, setLastAccess] = useState<{
    who: string
    granted: boolean
    ok: boolean
  } | null>(null)

  return (
    <>
      <PageTitle>
        {reading
          ? 'Decisions'
          : count === 0
            ? 'Nothing needs your decision'
            : count === 1
              ? 'One thing needs your decision'
              : `${count} things need your decision`}
      </PageTitle>

      {reading ? <Loading what="what is waiting for you" /> : null}

      {/*
        The record's answer, kept on screen rather than flashed.

        The card that carried the decision is gone by the time this appears —
        that is what deciding does to it — so without this the screen simply had
        one fewer thing on it and nothing said why. Dismissed by the person or
        by leaving, never on a timer.
      */}
      {lastAccess ? (
        <div role="status" className="o-body o-measure mb-10 border border-black p-5">
          {lastAccess.ok ? (
            <>
              <p className="font-semibold">{lastAccess.granted ? 'Access given ✓' : 'Declined ✓'}</p>
              <p className="mt-3">
                {lastAccess.granted
                  ? `${lastAccess.who} can ask about that part of your record from now on. You can stop it at any time in Sharing.`
                  : `${lastAccess.who} was not given access. Nothing was read and nothing was sent.`}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">We couldn&rsquo;t save your decision.</p>
              <p className="mt-3">
                Your record is unchanged and {lastAccess.who} still has no access. Nothing is being
                retried on its own — the request will reappear here within a few seconds and you
                can decide again.
              </p>
            </>
          )}
          <button
            type="button"
            className="o-btn o-btn-small mt-5"
            onClick={() => setLastAccess(null)}
          >
            Got it
          </button>
        </div>
      ) : null}

      {failed ? <CouldNotLoad what="Decisions" onRetry={refresh} /> : null}

      {!reading && count === 0 && !raised.length && !failed ? (
        <Nothing>
          When something would be sent to another person, or when someone asks for access to a
          part of the record they cannot currently see, it waits here until you decide. Nothing
          is sent in the meantime.
        </Nothing>
      ) : null}

      <div className="space-y-10">
        {mine.map((r) => (
          <Card key={r.id} tone="decision">
            <div className="o-card-body">
              <h2 className="o-h2 mb-6">
                {r.fromName} is asking to see part of your record
              </h2>
              <Row label="Who" value={`${r.fromName} · ${r.fromRole}`} />
              <Row label="What" value={domainName[r.domain]} />
              <Row label="Asked" value={longDate(r.at)} />

              <hr className="o-rule my-8" />
              <h3 className="o-h3 mb-3">What they were trying to find out</h3>
              <p className="o-body o-measure">&ldquo;{r.question}&rdquo;</p>

              <hr className="o-rule my-8" />
              <h3 className="o-h3 mb-3">What happens if you say yes</h3>
              <p className="o-body o-measure">
                {r.fromName} can ask about {domainName[r.domain].toLowerCase()} in your record from
                then on. You can stop it at any time in Sharing.
              </p>

              <AccessChoice
                id={r.id}
                who={r.fromName}
                answer={answerRequest}
                onSaved={setLastAccess}
              />
            </div>
          </Card>
        ))}

        {waiting.map((a) => (
          <Approval key={a.request_id} approval={a} actorId={option?.personId ?? null} onDecided={refresh} />
        ))}
      </div>

      {raised.length ? (
        <section className="o-section">
          <SectionHead>What you have asked for</SectionHead>
          <ul className="space-y-6">
            {raised.map((r) => (
              <li key={r.id} className="border border-black p-6">
                <p className="o-h3">{domainName[r.domain]}</p>
                <p className="o-meta mt-2">Asked {longDate(r.at)}</p>
                <p className="o-body mt-4">
                  {r.status === 'pending'
                    ? 'Waiting for Ananya to decide. Nothing has been read.'
                    : r.status === 'granted'
                      ? 'Ananya approved this. You can ask about it now.'
                      : 'Ananya declined this. Nothing was read.'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * Yes or no to somebody asking for access.
 *
 * Both controls report separately, and both lock the other out while one is
 * going: the two answers to this question are opposites, and letting them race
 * would mean the record keeps whichever arrived second.
 */
function AccessChoice({
  id,
  who,
  answer,
  onSaved,
}: {
  id: string
  who: string
  answer: (id: string, decision: 'granted' | 'declined') => Promise<boolean>
  onSaved: (outcome: { who: string; granted: boolean; ok: boolean }) => void
}) {
  const decide = async (granted: boolean) => {
    const ok = await answer(id, granted ? 'granted' : 'declined')
    onSaved({ who, granted, ok })
    return ok
  }
  const giving = useAction(() => decide(true))
  const refusing = useAction(() => decide(false))
  const busy = giving.busy || refusing.busy

  return (
    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
      <ActionButton
        action={giving}
        idle="Give them access"
        working="Saving…"
        done="Saved ✓"
        failed="Not saved"
        primary
        disabled={busy}
        className="flex-1"
      />
      <ActionButton
        action={refusing}
        idle="Don’t"
        working="Saving…"
        done="Saved ✓"
        failed="Not saved"
        disabled={busy}
        className="flex-1"
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
      <span className="o-body w-24 shrink-0 font-semibold">{label}</span>
      <span className="o-body o-measure">{value}</span>
    </div>
  )
}

/**
 * An approval a workflow has stopped on.
 *
 * These do not arrive in the reply to anything. Yoxa is asynchronous: a run
 * that reaches an approval gate parks, and the request that started it
 * returned minutes earlier. The gate comes back by a different road — Yoxa
 * posts a signed event to a receiver, which stores it — so the only way this
 * screen learns about it is by looking.
 *
 * Yoxa names its own options, so they are rendered rather than assumed. A gate
 * that offers "Send redacted" and "Send in full" must not be flattened into
 * Approve and Decline: the whole reason it stopped was the choice.
 */
function Approval({
  approval,
  actorId,
  onDecided,
}: {
  approval: PendingApproval
  actorId: string | null
  onDecided: () => void
}) {
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /**
   * A card, not a button, is what must only fire once.
   *
   * Each choice holds its own in-flight state so the label that changes is the
   * one that was pressed. But a disclosure is decided once, and "Send it" and
   * "Don't send it" landing together because somebody pressed both inside a
   * frame is the single worst thing this screen could do. The `sending` flag
   * disables the siblings on the next render; this ref refuses the second press
   * in the same one.
   */
  const inFlight = useRef(false)

  const choices = approval.options.length
    ? approval.options.map((o) => ({ id: o.id as string | null, label: o.label, message: null as string | null }))
    : [
        { id: null, label: 'Send it', message: 'Approved.' },
        { id: null, label: 'Don’t send it', message: 'Declined.' },
      ]

  async function decide(optionId: string | null, message: string | null): Promise<boolean> {
    // Refused because another choice on this card is already going. Reported as
    // success so the button does not say "Not sent" about a decision that is,
    // at this moment, being sent.
    if (inFlight.current) return true
    inFlight.current = true
    setSending(true)
    setProblem(null)
    try {
      const failed = await respondToApproval(approval.request_id, optionId, message, actorId)
      if (failed) {
        setProblem(failed)
        return false
      }
      // The row is now answered. Re-read rather than hiding it locally, so what
      // is on screen is what the record says.
      onDecided()
      return true
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <Card tone="decision">
      <div className="o-card-body">
        <h2 className="o-h2 mb-6">{approval.title}</h2>

        {approval.recipient ? <Row label="To" value={approval.recipient} /> : null}
        <Row label="Raised" value={longDate(approval.created_at)} />

        {/*
          The whole document, rendered exactly as it would be sent.

          Not a summary. This field IS the draft for a gate that asks "here is
          what would go — send it?", and printing several hundred words of
          model-authored HTML into a single paragraph asked people to approve a
          disclosure they could not read.
        */}
        {approval.description ? (
          <>
            <hr className="o-rule my-8" />
            <h3 className="o-h3 mb-4">What they will receive</h3>
            <Prose html={approval.description} className="o-body" />
          </>
        ) : null}

        {approval.will_send?.length ? (
          <>
            <hr className="o-rule my-8" />
            <h3 className="o-h3 mb-3">What is included</h3>
            <ul className="space-y-2">
              {approval.will_send.map((w) => (
                <li key={w} className="o-body o-measure">
                  {w}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {/*
          The half that is usually missing.

          Knowing what is protected matters as much as knowing what is shared,
          and it is the only way somebody can tell an under-disclosure from a
          correct one.
        */}
        <hr className="o-rule my-8" />
        <h3 className="o-h3 mb-3">What is not included</h3>
        <p className="o-body o-measure">
          {approval.withheld?.length
            ? approval.withheld.join(', ')
            : 'Your diagnosis, your medication, and anything from your psychology sessions.'}
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          {choices.map((c, i) => (
            <Decide
              key={`${c.id ?? c.label}-${i}`}
              label={c.label}
              primary={i === 0}
              lockedOut={sending}
              run={() => decide(c.id, c.message)}
            />
          ))}
        </div>

        {/*
          One line, three facts, and never both at once.

          The failure gets `role="alert"` rather than sharing the polite region
          with "Sending your decision" — a person who has just pressed Send it
          and heard nothing since needs to be interrupted, not told at the next
          convenient pause. Nothing retries itself: the two buttons above are
          live again and pressing one is the retry, which is stated rather than
          implied.
        */}
        {problem ? (
          <div role="alert" className="o-body o-measure mt-5 border border-black p-5">
            <p className="font-semibold">We couldn&rsquo;t send your decision.</p>
            <p className="mt-3">{problem}</p>
            <p className="mt-3">
              Nothing was sent and nothing is being retried on its own. The document is unchanged
              and this is still waiting. Choosing again above sends it.
            </p>
          </div>
        ) : (
          <p className="o-body o-measure mt-5" aria-live="polite">
            {sending
              ? 'Sending your decision…'
              : 'Nothing has been sent yet. This waits as long as you need.'}
          </p>
        )}
      </div>
    </Card>
  )
}

/**
 * One option on a gate.
 *
 * A component rather than a button in a loop, because each option needs its own
 * four states and hooks cannot live inside a map. `lockedOut` is the card
 * saying another option is already going; `useAction` handles this one.
 *
 * Yoxa writes the idle label, so the working and finished words are kept
 * generic on purpose. "Send redacted" becoming "Sending redacted" would read as
 * a promise about what is being sent, from a string this code has never seen.
 */
function Decide({
  label,
  primary,
  lockedOut,
  run,
}: {
  label: string
  primary: boolean
  lockedOut: boolean
  run: () => Promise<boolean>
}) {
  const action = useAction(run)
  return (
    <ActionButton
      action={action}
      idle={label}
      working="Sending"
      done="Sent"
      failed="Did not send"
      primary={primary}
      disabled={lockedOut}
      className="flex-1"
    />
  )
}
