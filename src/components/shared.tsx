import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Callout, Card, CardBody, CardHead, StatusPill, WorkflowSteps, formatDate } from './ui'
import type { ReadState } from '../lib/orca'
import { useUI } from '../state/ui'
import type { EvidenceBundle, MemoryCandidate, ReviewItem, WorkflowStep } from '../data/types'

/* ---------------------------------------- 33. Global AI evidence panel trigger */

export function WhyButton({ title, bundle }: { title: string; bundle: EvidenceBundle }) {
  const { openEvidence } = useUI()
  return (
    <button
      onClick={() => openEvidence(title, bundle)}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[0.78rem] text-ink-2 hover:border-line-strong hover:text-ink"
    >
      <span aria-hidden>?</span> Why am I seeing this?
    </button>
  )
}

/** Every AI-authored artefact carries its provenance where it is displayed. */
export function AiProvenance({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3 border-t border-line pt-3 text-[0.76rem] leading-relaxed text-muted">
      Prepared by ORCA from information already in this record. Not a clinical opinion, not a
      diagnosis, and not part of any medical record.{children ? ' ' : null}
      {children}
    </p>
  )
}

/* ------------------------------------------------- 32.1 Review required screen */

export function ReviewRequiredCard({
  item,
  audience = 'patient',
}: {
  item: ReviewItem
  audience?: 'patient' | 'professional'
}) {
  const { say } = useUI()
  const [decision, setDecision] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.proposedAction)

  return (
    <Card>
      <CardHead
        title={audience === 'patient' ? 'ORCA needs your decision' : 'ORCA needs human input'}
        meta={`Raised ${formatDate(item.raised)}`}
        action={<StatusPill status={item.status} />}
      />
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-[0.95rem] font-semibold text-ink">{item.title}</h3>
          <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">{item.reason}</p>
        </div>

        <Field label="What ORCA understands">{item.understanding}</Field>

        <div>
          <h4 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Relevant evidence
          </h4>
          <ul className="space-y-1">
            {item.evidence.map((e) => (
              <li key={e} className="text-[0.85rem] text-ink">
                {e}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[10px] border border-state-wait/25 bg-state-wait-tint px-4 py-3">
          <h4 className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
            Uncertainty or conflict
          </h4>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-2">{item.uncertainty}</p>
        </div>

        <div>
          <h4 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Proposed action
          </h4>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.86rem] outline-none"
            />
          ) : (
            <p className="text-[0.86rem] leading-relaxed text-ink">{draft}</p>
          )}
        </div>

        <Field label="Decision required">{item.decisionRequired}</Field>

        {decision ? (
          <p className="rounded-lg bg-state-good-tint px-4 py-3 text-[0.85rem] text-state-good">
            {decision}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setDecision('Approved. The record has been updated and the workflow has moved on.')
                say('Approved — recorded in the audit log.')
              }}
            >
              Approve
            </Button>
            <Button
              onClick={() => {
                if (editing) {
                  setDecision('Your edit was saved and used instead of the proposed wording.')
                  say('Edit saved.')
                }
                setEditing(!editing)
              }}
            >
              {editing ? 'Save edit' : 'Edit'}
            </Button>
            <Button
              onClick={() => {
                setDecision('Rejected. Nothing was changed and nothing was shared.')
                say('Rejected — nothing was changed.')
              }}
            >
              Reject
            </Button>
            <Button
              onClick={() => {
                setDecision('ORCA will ask for more information before proposing anything again.')
                say('More information requested.')
              }}
            >
              Request more information
            </Button>
            <Button
              onClick={() => {
                setDecision('Assigned to Dr Kavita Nair for review.')
                say('Assigned to another person.')
              }}
            >
              Assign to another person
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
        {label}
      </h4>
      <p className="text-[0.86rem] leading-relaxed text-ink">{children}</p>
    </div>
  )
}

/* --------------------------------------------- 32.2 Clarification request card */

export function ClarificationCard({
  question,
  from,
  date,
  onAnswer,
}: {
  question: string
  from: string
  date: string
  onAnswer?: (answer: string) => void
}) {
  const { say } = useUI()
  const [answer, setAnswer] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <Card>
      <CardHead title="More information is needed" meta={`${from} · ${formatDate(date)}`} />
      <CardBody className="space-y-3">
        <p className="text-[0.88rem] leading-relaxed text-ink">“{question}”</p>
        {sent ? (
          <p className="rounded-lg bg-state-good-tint px-4 py-3 text-[0.85rem] text-state-good">
            Your answer was recorded. It will not be sent until you approve exactly what it contains.
          </p>
        ) : (
          <>
            <textarea
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Answer in your own words"
              className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.86rem] outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setSent(true)
                  onAnswer?.(answer)
                  say('Answer saved for your approval.')
                }}
              >
                Answer
              </Button>
              <Button onClick={() => say('Skipped for now — this stays on your list.')}>Skip</Button>
              <Button onClick={() => say('Sent to Dr Kavita Nair to answer instead.')}>
                Send to a professional
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------ 32.3 Memory validation card */

export function MemoryValidationCard({
  candidate,
  audience = 'patient',
}: {
  candidate: MemoryCandidate
  audience?: 'patient' | 'professional'
}) {
  const { say } = useUI()
  const [state, setState] = useState<'pending' | 'confirmed' | 'rejected' | 'edited'>('pending')
  const [text, setText] = useState(candidate.proposal)
  const [editing, setEditing] = useState(false)

  return (
    <Card>
      <CardHead
        title={audience === 'patient' ? 'ORCA wants to remember this' : 'Proposed longitudinal update'}
        meta={`Confidence ${Math.round(candidate.confidence * 100)}% · candidate, not yet part of the record`}
      />
      <CardBody className="space-y-3">
        {editing ? (
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.88rem] outline-none"
          />
        ) : (
          <p className="text-[0.9rem] leading-relaxed text-ink">{text}</p>
        )}

        <div>
          <h4 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Evidence
          </h4>
          <ul className="space-y-1">
            {candidate.evidence.map((e) => (
              <li key={e.detail} className="text-[0.84rem] text-ink">
                <span className="font-medium">{e.source}</span> — {e.detail}{' '}
                <span className="text-muted">({formatDate(e.date)})</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[0.83rem] text-muted">Related history: {candidate.relatedHistory}</p>

        {state === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setState('confirmed')
                say('Saved to the longitudinal record.')
              }}
            >
              Confirm
            </Button>
            <Button
              onClick={() => {
                if (editing) {
                  setState('edited')
                  say('Your wording was saved instead.')
                }
                setEditing(!editing)
              }}
            >
              {editing ? 'Save wording' : 'Edit'}
            </Button>
            <Button
              onClick={() => {
                setState('rejected')
                say('Not saved. ORCA will not propose this again this month.')
              }}
            >
              Don't save
            </Button>
          </div>
        ) : (
          <p
            className={`rounded-lg px-4 py-3 text-[0.85rem] ${
              state === 'rejected'
                ? 'bg-state-neutral-tint text-state-neutral'
                : 'bg-state-good-tint text-state-good'
            }`}
          >
            {state === 'rejected'
              ? 'Not saved. This stays out of the record.'
              : 'Saved. It will now appear as validated information, with its evidence attached.'}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

/* --------------------------------------------- 34. Global workflow state panel */

export function WorkflowStatePanel({
  title,
  steps,
  meta,
}: {
  title: string
  steps: WorkflowStep[]
  meta?: string
}) {
  return (
    <Card>
      <CardHead title={title} meta={meta} />
      <CardBody>
        <WorkflowSteps steps={steps} />
        <p className="text-[0.78rem] text-muted">
          Completed steps can be inspected. ORCA never moves past a step that needs a person.
        </p>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------- Where the data on a screen came from */

/**
 * Says which record the screen is showing. A page that cannot tell you whether
 * it holds a real record or a demonstration one is worse than a page that
 * admits it — so this is never hidden, and it is never reassuring by default.
 */
export function RecordSource({ state, reason }: { state: ReadState; reason?: string | null }) {
  if (state === 'loading') {
    return <p className="mb-4 text-[0.78rem] text-muted">Reading the record…</p>
  }

  if (state === 'refused') {
    return (
      <div className="mb-5">
        <Callout tone="alert" title="This is not yours to see">
          {reason ?? 'Your role has no access to this part of the record.'} Nothing has been shown, and the
          attempt has been recorded.
        </Callout>
      </div>
    )
  }

  // The shell already says this once, at the top of every screen. Saying it
  // again per section is the crowding this interface is trying to avoid.
  if (state === 'mock') return null

  return (
    <p className="mb-4 text-[0.78rem] text-state-good">
      Live record · read through the permission layer, scoped to your role.
    </p>
  )
}
