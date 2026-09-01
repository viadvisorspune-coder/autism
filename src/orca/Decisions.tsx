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
import { useSearchParams } from 'react-router-dom'
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
import { domainName, toneClass } from './system'
import { IconChevron, IconDecisions } from './icons'
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

  /**
   * Which decision is being worked on.
   *
   * Everything used to be open at once, which on a screen holding three
   * disclosures is three full documents stacked down the page and no way to
   * tell which one you were reading. Each now shows who, what and when — enough
   * to choose between them — and opening one reveals the rest of it.
   *
   * A single decision opens itself. Asking somebody to press Open when there is
   * exactly one thing on the screen is a step that exists only to be consistent
   * with a case that is not on their screen.
   */
  /**
   * In the URL, so coming back lands on the same one.
   *
   * Somebody opens a decision, follows a name into Sharing to remind themselves
   * who that is, and comes back — in component state the screen would have
   * closed itself and they would be choosing between three cards again. This is
   * the same argument the Record filter and its open entries make, and it is
   * the same mechanism, so there is one thing to understand rather than three.
   */
  const [params, setParams] = useSearchParams()
  const chosen = params.get('open')
  const only = count === 1 ? (mine[0]?.id ?? waiting[0]?.request_id ?? null) : null
  const active = chosen ?? only
  const setActiveId = (id: string) => {
    const updated = new URLSearchParams(params)
    updated.set('open', id)
    // Replace: opening three decisions in turn should not make Back a way of
    // closing them one at a time.
    setParams(updated, { replace: true })
  }

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
        <div role="status" className="o-body o-measure mb-10 o-panel p-5">
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

      <div className="space-y-4">
        {mine.map((r) => {
          const open = active === r.id
          return (
            <Card key={r.id} tone="decision" raised={open} active={open}>
              <div className="o-card-body">
                <h2 className="o-h2 mb-6">
                  {r.fromName} is asking to see part of your record
                </h2>
                {/*
                  Who, what and when are always out. They are what somebody
                  reads to decide which of three things waiting for them to look
                  at first, and a summary that has to be opened to be read is
                  not a summary.
                */}
                <Row label="Who" value={`${r.fromName} · ${r.fromRole}`} />
                <Row label="What" value={domainName[r.domain]} />
                <Row label="Asked" value={longDate(r.at)} />

                {!open ? (
                  <button
                    type="button"
                    className="o-btn mt-8"
                    aria-expanded={false}
                    onClick={() => setActiveId(r.id)}
                  >
                    Open this decision
                  </button>
                ) : null}

                <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
                  <div inert={!open}>
                    <hr className="o-rule my-8" />
                    <h3 className="o-h3 mb-3">What they were trying to find out</h3>
                    <p className="o-body o-measure">&ldquo;{r.question}&rdquo;</p>

                    <hr className="o-rule my-8" />
                    <h3 className="o-h3 mb-3">What happens if you say yes</h3>
                    <p className="o-body o-measure">
                      {r.fromName} can ask about {domainName[r.domain].toLowerCase()} in your
                      record from then on. You can stop it at any time in Sharing.
                    </p>

                    <AccessChoice
                      id={r.id}
                      who={r.fromName}
                      answer={answerRequest}
                      onSaved={setLastAccess}
                    />
                  </div>
                </div>
              </div>
            </Card>
          )
        })}

        {waiting.map((a) => (
          <Approval
            key={a.request_id}
            approval={a}
            actorId={option?.personId ?? null}
            open={active === a.request_id}
            onOpen={() => setActiveId(a.request_id)}
            onDecided={refresh}
          />
        ))}
      </div>

      {raised.length ? (
        <section className="o-section">
          <SectionHead>What you have asked for</SectionHead>
          <ul className="space-y-6">
            {raised.map((r) => (
              <li key={r.id} className="o-panel p-6">
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
        working="Approving…"
        done="Approved ✓"
        failed="Not approved"
        primary
        disabled={busy}
        className="flex-1"
      />
      {/*
        No tick on Declined. A tick beside it would read as approval of the
        decline, and neither answer here is the right one — that is the whole
        point of it being a decision.
      */}
      <ActionButton
        action={refusing}
        idle="Don’t"
        working="Declining…"
        done="Declined"
        failed="Not declined"
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
  open,
  onOpen,
  onDecided,
}: {
  approval: PendingApproval
  actorId: string | null
  open: boolean
  onOpen: () => void
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

  /**
   * The gate's own options when it has them, ORCA's two when it does not.
   *
   * `kind` is what lets the button say "Approving…" rather than "Sending". It
   * is only set on ORCA's own pair, where the meaning of each option is known
   * here. A gate that offers "Send redacted" and "Send in full" is two
   * approvals with different contents, and calling either of them Approving
   * would be this code narrating a decision it does not understand.
   */
  const choices: {
    id: string | null
    label: string
    message: string | null
    kind: 'approve' | 'decline' | null
  }[] = approval.options.length
    ? approval.options.map((o) => ({
        id: o.id as string | null,
        label: o.label,
        message: null,
        kind: null,
      }))
    : [
        { id: null, label: 'Approve', message: 'Approved.', kind: 'approve' },
        { id: null, label: 'Decline', message: 'Declined.', kind: 'decline' },
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

  /**
   * Closed, this is a row in a list. Open, it is the whole decision.
   *
   * A waiting decision needs two things from the closed state: which one it is,
   * and enough to choose between several. That is a title, who it is for and
   * when it was raised — a row. The full-height card was spending most of its
   * area on white space around three lines, and three of them filled a screen
   * with a list nobody could scan.
   *
   * NOTHING ABOUT THE DECISION ITSELF IS COMPRESSED. Opening still shows the
   * entire document that would be sent, in full, above any control that would
   * send it, and still names what is not in it. The row is the index; the card
   * is the decision.
   *
   * It swaps rather than growing. The reveal animation elsewhere is for a
   * paragraph or two appearing under a control; this is several hundred words
   * arriving, which is a new context rather than a disclosure, and animating
   * its height would be a long movement on a screen somebody is about to have
   * to read carefully.
   */
  if (!open) {
    return (
      <div className={toneClass.decision}>
        <button type="button" className="o-row" aria-expanded={false} onClick={onOpen}>
          <span className="o-row-mark">
            <IconDecisions size={17} />
          </span>
          <span className="o-row-main">
            <span className="o-row-title block">{approval.title}</span>
            <span className="o-row-meta block">
              {approval.recipient ? `To ${approval.recipient} · ` : ''}
              Raised {longDate(approval.created_at)}
            </span>
          </span>
          <span className="o-pill o-pill-waiting">Waiting for you</span>
          <IconChevron size={16} />
        </button>
      </div>
    )
  }

  return (
    <Card tone="decision" raised={open} active={open}>
      <div className="o-card-body">
        <h2 className="o-h2 mb-6">{approval.title}</h2>

        {approval.recipient ? <Row label="To" value={approval.recipient} /> : null}
        <Row label="Raised" value={longDate(approval.created_at)} />

        {/*
          Opened, rather than three documents down one page.

          Who it is for and when it was raised are always out — that is what
          somebody reads to decide which of several waiting things to look at.
          Everything below is the disclosure itself, which is read once, by the
          person deciding on it.

          Progressive here means later, never instead. The whole document is
          still shown in full before any button that would send it, because a
          gate that asks "send this?" and does not show what "this" is has asked
          nothing.
        */}
        {!open ? (
          <button type="button" className="o-btn mt-8" aria-expanded={false} onClick={onOpen}>
            Open this decision
          </button>
        ) : null}

        <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
          <div inert={!open}>
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
              kind={c.kind}
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
          <div role="alert" className="o-body o-measure mt-5 o-panel p-5">
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
        </div>
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
 * The three words follow the meaning of the option when that is known —
 * Approve, Approving…, Approved ✓ — and stay generic when Yoxa named it.
 * "Send redacted" becoming "Sending redacted" would read as a promise about
 * what is being sent, from a string this code has never seen.
 *
 * Approved carries a tick and Declined does not. That is not a reward: a tick
 * beside "Declined" would read as approval of the decline, and the two need to
 * be distinguishable at a glance from across a difficult afternoon. Nothing
 * else marks the finish — no flourish, no colour flash, nothing that treats
 * saying yes as the better answer.
 */
const WORDS: Record<'approve' | 'decline', { working: string; done: string; failed: string }> = {
  approve: { working: 'Approving…', done: 'Approved ✓', failed: 'Not approved' },
  decline: { working: 'Declining…', done: 'Declined', failed: 'Not declined' },
}

function Decide({
  label,
  kind,
  primary,
  lockedOut,
  run,
}: {
  label: string
  kind: 'approve' | 'decline' | null
  primary: boolean
  lockedOut: boolean
  run: () => Promise<boolean>
}) {
  const action = useAction(run)
  const words = kind
    ? WORDS[kind]
    : { working: 'Sending…', done: 'Sent ✓', failed: 'Did not send' }
  return (
    <ActionButton
      action={action}
      idle={label}
      working={words.working}
      done={words.done}
      failed={words.failed}
      primary={primary}
      disabled={lockedOut}
      className="flex-1"
    />
  )
}
