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
import { useState } from 'react'
import { useSession } from '../state/session'
import { respondToApproval } from '../lib/approvals'
import { useLive } from '../lib/live'
import type { PendingApproval } from '../components/ApprovalPanel'
import { useAsks } from './asks'
import { useSubject } from './subject'
import { Card, CouldNotLoad, Nothing, PageTitle, Prose, SectionHead, longDate } from './parts'
import { domainName } from './system'

export default function Decisions() {
  const { option, role } = useSession()
  const { subjectId } = useSubject()
  const { requests, answerRequest } = useAsks()
  const { data, failed, refresh } = useLive<{ approvals: PendingApproval[] }>('approvals', subjectId)

  const waiting = (data?.approvals ?? []).filter((a) => a.status === 'Awaiting approval')
  // Access requests are addressed to the person whose record it is. Everybody
  // else sees the ones they raised, and whether they were answered.
  const mine = role === 'patient' ? requests.filter((r) => r.status === 'pending') : []
  const raised = role === 'patient' ? [] : requests.filter((r) => r.fromId === option?.personId)

  const count = waiting.length + mine.length

  return (
    <>
      <PageTitle>
        {count === 0
          ? 'Nothing needs your decision'
          : count === 1
            ? 'One thing needs your decision'
            : `${count} things need your decision`}
      </PageTitle>

      {failed ? <CouldNotLoad what="Decisions" onRetry={refresh} /> : null}

      {count === 0 && !raised.length && !failed ? (
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

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <button
                  type="button"
                  className="o-btn o-btn-primary flex-1"
                  onClick={() => answerRequest(r.id, 'granted')}
                >
                  Give them access
                </button>
                <button
                  type="button"
                  className="o-btn flex-1"
                  onClick={() => answerRequest(r.id, 'declined')}
                >
                  Don&rsquo;t
                </button>
              </div>
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
    </>
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

  const choices = approval.options.length
    ? approval.options.map((o) => ({ id: o.id as string | null, label: o.label, message: null as string | null }))
    : [
        { id: null, label: 'Send it', message: 'Approved.' },
        { id: null, label: 'Don’t send it', message: 'Declined.' },
      ]

  async function decide(optionId: string | null, message: string | null) {
    if (sending) return
    setSending(true)
    setProblem(null)
    const failed = await respondToApproval(approval.request_id, optionId, message, actorId)
    if (failed) {
      setProblem(failed)
      setSending(false)
      return
    }
    // The row is now answered. Re-read rather than hiding it locally, so what
    // is on screen is what the record says.
    onDecided()
    setSending(false)
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
            <button
              key={`${c.id ?? c.label}-${i}`}
              type="button"
              disabled={sending}
              onClick={() => decide(c.id, c.message)}
              className={`o-btn flex-1 ${i === 0 ? 'o-btn-primary' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="o-body o-measure mt-5" aria-live="polite">
          {sending
            ? 'Sending your decision.'
            : problem
              ? problem
              : 'Nothing has been sent yet. This waits as long as you need.'}
        </p>
      </div>
    </Card>
  )
}
