import { useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  PageHeader,
  StatusPill,
  formatDate,
} from '../../components/ui'
import { AiProvenance, MemoryValidationCard } from '../../components/shared'
import {
  memoryCandidates,
  personName,
  profileItems,
  sessionNotes,
  strategiesFor,
  eventsFor,
} from '../../data/db'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

const AI_ACTIONS = [
  ['Summarise prior sessions', 'Two sessions since June, both on workplace transitions.'],
  ['Identify changes', 'Same-hour changes are the new element since 8 August.'],
  ['Suggest follow-up questions', 'Ask what happens in the twenty minutes after a change is announced.'],
  ['Draft session summary', 'Draft written into the notes column for you to edit.'],
] as const

/** 19.1 Session workspace — context on the left, this session on the right. */
export default function SessionWorkspace() {
  const { role } = useSession()
  const { say } = useUI()
  const [notes, setNotes] = useState('')
  const [observations, setObservations] = useState('')
  const [actions, setActions] = useState<string[]>([
    'Adapt the advance-notice strategy to cover same-hour changes',
    'Review the quiet-space trial outcome on 2 September',
  ])
  const [newAction, setNewAction] = useState('')
  const [signed, setSigned] = useState(false)

  const previous = sessionNotes[0]
  const strategies = strategiesFor('pt-ananya')
  const goals = profileItems.filter((p) => p.section === 'Current goals')
  const changes = eventsFor('pt-ananya').slice(0, 3)
  const candidates = memoryCandidates.filter((m) => m.raisedFor.includes(role ?? 'psychologist'))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Session workspace"
        description="Ananya Rao · 25 August 2026, 10:30 · review of workplace transitions"
        actions={
          <>
            <Button onClick={() => say('Session note saved as a draft.')}>Save draft</Button>
            <Button
              variant="primary"
              onClick={() => {
                setSigned(true)
                say('Session note signed and added to the record.')
              }}
            >
              Sign note
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {AI_ACTIONS.map(([label, result]) => (
          <button
            key={label}
            onClick={() => {
              say(result)
              if (label === 'Draft session summary') {
                setNotes(
                  (n) =>
                    n ||
                    'Reviewed the advance-notice strategy across three check-ins. Benefit is proportional to notice given; no benefit when a change is announced within the hour. Agreed to trial a transition buffer alongside the existing notice arrangement, subject to the employer request currently with HR.',
                )
              }
            }}
            className="rounded-2xl  bg-surface-2 px-3 py-2 text-[0.83rem] text-ink hover:bg-surface-2"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------- context */}
        <div className="space-y-5">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">Context</p>

          <Card>
            <CardHead title="Previous session" meta={`${formatDate(previous.date)} · ${previous.status}`} />
            <CardBody className="space-y-2">
              <p className="text-[0.86rem] leading-relaxed text-ink">{previous.observations}</p>
              <p className="text-[0.84rem] leading-relaxed text-ink-2">{previous.patientReport}</p>
              <ul className="mt-2 space-y-1 text-[0.84rem] text-ink">
                {previous.actions.map((a) => (
                  <li key={a}>— {a}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Goals" />
            <CardBody>
              <ul className="space-y-1.5 text-[0.86rem] text-ink">
                {goals.map((g) => (
                  <li key={g.id}>{g.text}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent changes" />
            <CardBody>
              <ul className="space-y-2">
                {changes.map((c) => (
                  <li key={c.id} className="text-[0.86rem] text-ink">
                    {c.title}
                    <span className="block text-[0.78rem] text-muted">
                      {formatDate(c.date)} · {c.sourceId === 'orca' ? 'ORCA' : personName(c.sourceId)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Strategies and outcomes" />
            <CardBody>
              <ul className="space-y-3">
                {strategies.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.86rem] text-ink">{s.title}</p>
                      {s.outcome ? (
                        <p className="text-[0.8rem] leading-relaxed text-muted">
                          {s.outcome.effectiveness} — {s.outcome.summary}
                        </p>
                      ) : (
                        <p className="text-[0.8rem] text-muted">
                          {s.checkIns.length} check-ins so far
                        </p>
                      )}
                    </div>
                    <StatusPill status={s.status} />
                  </li>
                ))}
              </ul>
              <AiProvenance />
            </CardBody>
          </Card>
        </div>

        {/* -------------------------------------------------- current session */}
        <div className="space-y-5">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">
            This session
          </p>

          <Card>
            <CardHead title="Notes" meta={signed ? 'Signed' : 'Draft'} />
            <CardBody>
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Session notes"
                className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] leading-relaxed outline-none"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Observations" />
            <CardBody>
              <textarea
                rows={4}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="What you observed, in your own words"
                className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] leading-relaxed outline-none"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Patient report" meta="From the patient's own record" />
            <CardBody>
              <p className="text-[0.86rem] leading-relaxed text-ink">
                “It helped when I got at least a few hours’ notice, but not when the change happened
                immediately.”
              </p>
              <p className="mt-1 text-[0.79rem] text-muted">Check-in, 18 August 2026</p>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Action items" />
            <CardBody>
              <ul className="mb-3 space-y-2">
                {actions.map((a) => (
                  <li key={a} className="text-[0.86rem] text-ink">
                    — {a}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="Add an action"
                  className="min-w-0 flex-1 rounded-2xl  border-line-strong px-3 py-2 text-[0.86rem] outline-none"
                />
                <Button
                  onClick={() => {
                    if (!newAction.trim()) return
                    setActions([...actions, newAction.trim()])
                    setNewAction('')
                  }}
                >
                  Add
                </Button>
              </div>
            </CardBody>
          </Card>

          {candidates.length ? (
            <div className="space-y-3">
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-muted">
                Proposed longitudinal updates from this session
              </p>
              {candidates.slice(0, 1).map((c) => (
                <MemoryValidationCard key={c.id} candidate={c} audience="professional" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
