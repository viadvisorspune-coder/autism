import { Callout, Card, CardBody, CardHead, LinkButton, StatusPill } from './ui'
import { isWaitingOnAPerson } from '../lib/agent'
import type { RunState } from '../lib/agent'

/**
 * What the agents are doing, while they are doing it.
 *
 * A conversational surface over a multi-agent workflow has one honest problem:
 * the work takes minutes, and it frequently ends by stopping rather than
 * answering. A typing indicator would misdescribe both. So this shows the
 * actual steps as they complete, names the person a stopped run is waiting on,
 * and — where the run refused something — shows the refusal, because a denial
 * recorded and shown is the system working, not the system failing.
 */
export function RunProgress({
  starting,
  state,
  error,
}: {
  starting: boolean
  state: RunState | null
  error: string | null
}) {
  if (error) {
    return (
      <Callout tone="alert" title="That did not start">
        {error} Nothing has been sent and nothing in your record has changed.
      </Callout>
    )
  }

  if (starting || !state) {
    return (
      <Card>
        <CardBody>
          <p className="text-[0.88rem] text-ink">Starting…</p>
          <p className="mt-1 text-[0.83rem] leading-relaxed text-muted">
            Nothing has left your record. If anything needs to be shared, you will be asked first.
          </p>
        </CardBody>
      </Card>
    )
  }

  const { run, approvals, reviews, activity } = state
  const waiting = isWaitingOnAPerson(run.status)
  const denials = activity.filter((a) => a.result === 'Denied')

  return (
    <Card>
      <CardHead
        title={
          <span className="inline-flex items-center gap-2.5">
            What ORCA is doing
            {/* Only while something is actually moving. A spinner beside a run
                that has stopped for a person would say the opposite of the
                truth — that waiting is temporary and nothing is needed. It
                also honours prefers-reduced-motion, which on a product for
                autistic adults is not a nicety. */}
            {!waiting ? (
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
            ) : null}
          </span>
        }
        meta={run.type}
        action={<StatusPill status={run.status as never} />}
      />
      <CardBody>
        {run.current_step === 'Trigger received' ? (
          <p className="mb-4 text-[0.83rem] leading-relaxed text-muted">
            Sent. The first step usually takes a few minutes to appear — this page will keep itself up
            to date, and there is nothing you need to do while you wait.
          </p>
        ) : null}

        <ol className="mb-4 space-y-2">
          {(run.steps ?? []).map((step, i) => (
            <li key={`${step.label}-${i}`} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  step.state === 'done'
                    ? 'bg-state-good'
                    : step.state === 'current'
                      ? 'bg-state-info'
                      : 'bg-line-strong'
                }`}
              />
              <span>
                <span
                  className={`block text-[0.88rem] ${
                    step.state === 'todo' ? 'text-muted' : 'text-ink'
                  }`}
                >
                  {step.label}
                </span>
                {step.detail ? (
                  <span className="block text-[0.82rem] leading-relaxed text-muted">{step.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>

        {waiting ? (
          <div className="mb-4">
            <Callout tone="wait" title={`Stopped — waiting for ${run.waiting_for ?? 'a person'}`}>
              This will not go any further on its own. That is deliberate: the next step needs a
              person, and no part of ORCA may decide it instead.
              {/* It said somebody was needed and gave them nowhere to go. The
                  decision lives on Requests, so the sentence now ends in the
                  door rather than beside it. */}
              <div className="mt-3">
                <LinkButton to="/patient/requests" variant="primary">
                  Open it and decide
                </LinkButton>
              </div>
            </Callout>
          </div>
        ) : null}

        {/* A refusal is a result. Hiding it would hide the part of the system
            that is actually doing the work. */}
        {denials.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              What ORCA would not do
            </h3>
            <ul className="space-y-2">
              {denials.map((d) => (
                <li key={d.id} className="rounded-[20px]  border-line bg-canvas px-4 py-3">
                  <p className="text-[0.87rem] text-ink">{d.action}</p>
                  {d.why ? (
                    <p className="mt-0.5 text-[0.82rem] leading-relaxed text-muted">{d.why}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {approvals.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Waiting for your decision
            </h3>
            <ul className="space-y-2">
              {approvals.map((a) => (
                <li key={a.request_id} className="rounded-[20px]  bg-state-wait-tint px-4 py-3">
                  <p className="text-[0.88rem] font-medium text-ink">{a.title}</p>
                  {a.description ? (
                    <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">{a.description}</p>
                  ) : null}
                  <p className="mt-1.5 text-[0.81rem] text-muted">
                    Open Requests to answer this. Nothing happens until you do.
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {reviews.length > 0 ? (
          <div className="mb-4">
            <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Raised for review
            </h3>
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-[20px]  border-line px-4 py-3">
                  <p className="text-[0.88rem] font-medium text-ink">{r.title}</p>
                  <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">{r.reason}</p>
                  {r.uncertainty ? (
                    <p className="mt-1 text-[0.82rem] text-muted">
                      <span className="font-medium">Not certain about: </span>
                      {r.uncertainty}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[0.79rem] leading-relaxed text-muted">
          Every step above is recorded in your audit trail, including anything ORCA refused to do.
        </p>
      </CardBody>
    </Card>
  )
}
