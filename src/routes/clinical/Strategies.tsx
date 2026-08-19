import { useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  PageHeader,
  StatusPill,
  Table,
  formatDate,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { patientName, personName, strategies } from '../../data/db'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

/** 21.1 Strategy history. */
export function StrategyHistory() {
  const { option } = useSession()
  const base = option?.home ?? '/psychologist'

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Support strategies"
        description="Everything that has been tried, in which context, and what came of it. Failed strategies stay visible so they are not repeated."
      />
      <Card>
        <Table
          columns={['Strategy', 'Patient', 'Context', 'Start', 'Outcome', 'Status', 'Owner']}
          rows={strategies.map((s) => ({
            key: s.id,
            to: `${base}/strategies/${s.id}`,
            cells: [
              s.title,
              patientName(s.patientId),
              s.environment ?? s.conditions,
              formatDate(s.start),
              s.outcome?.effectiveness ?? `${s.checkIns.length} check-ins`,
              <StatusPill key="s" status={s.status} />,
              personName(s.ownerId),
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** 21.2 Strategy detail. */
export function StrategyDetail() {
  const { strategyId } = useParams()
  const { option } = useSession()
  const { say } = useUI()
  const strategy = strategies.find((s) => s.id === strategyId)
  const base = option?.home ?? '/psychologist'

  if (!strategy) return <p className="text-[0.9rem] text-muted">Strategy not found.</p>

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={strategy.title}
        description={`${patientName(strategy.patientId)} · ${strategy.goal}`}
        breadcrumbs={[{ label: 'Strategies', to: `${base}/strategies` }, { label: 'Detail' }]}
        actions={<StatusPill status={strategy.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHead
              title="Rationale and evidence"
              action={
                <WhyButton
                  title={strategy.title}
                  bundle={{
                    input: strategy.goal,
                    relevantHistory: [strategy.rationale],
                    supporting: strategy.checkIns
                      .filter((c) => c.helpfulness !== 'Did not help')
                      .map((c) => `${formatDate(c.date)} — ${c.note}`),
                    conflicting: strategy.checkIns
                      .filter((c) => c.helpfulness === 'Did not help')
                      .map((c) => `${formatDate(c.date)} — ${c.note}`),
                    interpretation: strategy.outcome?.summary ?? 'Trial still running.',
                    uncertainty: 'Check-ins are patient-reported and cover a short window.',
                    sources: ['Patient check-ins', `Owner: ${personName(strategy.ownerId)}`],
                  }}
                />
              }
            />
            <CardBody>
              <p className="text-[0.89rem] leading-relaxed text-ink">{strategy.rationale}</p>
              <AiProvenance />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Implementation" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Conditions', value: strategy.conditions },
                  { label: 'Success criteria', value: strategy.successCriteria },
                  { label: 'Start', value: formatDate(strategy.start) },
                  { label: 'Duration', value: `${strategy.durationWeeks} weeks` },
                  { label: 'Review', value: formatDate(strategy.reviewDate) },
                  ...(strategy.environment ? [{ label: 'Environment', value: strategy.environment }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Check-ins" meta="Patient-reported unless stated" />
            <CardBody>
              {strategy.checkIns.length === 0 ? (
                <p className="text-[0.86rem] text-muted">No check-ins recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {strategy.checkIns.map((c) => (
                    <li key={c.date + c.note} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[0.79rem] text-muted">
                          {formatDate(c.date)} · {personName(c.reportedBy)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[0.72rem] ${
                            c.helpfulness === 'Helped'
                              ? 'bg-state-good-tint text-state-good'
                              : c.helpfulness === 'Partly helped'
                                ? 'bg-state-wait-tint text-state-wait'
                                : 'bg-state-alert-tint text-state-alert'
                          }`}
                        >
                          {c.helpfulness}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.87rem] leading-relaxed text-ink">{c.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {strategy.outcome ? (
            <Card>
              <CardHead title="Outcome" />
              <CardBody>
                <DefinitionList
                  items={[
                    { label: 'Summary', value: strategy.outcome.summary },
                    { label: 'Effectiveness', value: strategy.outcome.effectiveness },
                    { label: 'Patient feedback', value: `“${strategy.outcome.patientFeedback}”` },
                    ...(strategy.outcome.professionalFeedback
                      ? [{ label: 'Professional observations', value: strategy.outcome.professionalFeedback }]
                      : []),
                    ...(strategy.outcome.comparison
                      ? [{ label: 'Compared with previous attempts', value: strategy.outcome.comparison }]
                      : []),
                    ...(strategy.outcome.proposedAdaptation
                      ? [{ label: 'Proposed adaptation', value: strategy.outcome.proposedAdaptation }]
                      : []),
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHead title="Actions" />
            <CardBody className="flex flex-col gap-2">
              <Button onClick={() => say('Opened for modification. The patient is asked to confirm.')}>
                Modify
              </Button>
              <Button onClick={() => say('Continued unchanged.')}>Continue</Button>
              <Button onClick={() => say('Stopped. The outcome stays in the record.')}>Stop</Button>
              <Button variant="primary" onClick={() => say('Next trial drafted from this outcome.')}>
                Create next trial
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Who can change this" />
            <CardBody>
              <p className="text-[0.85rem] leading-relaxed text-ink-2">
                You can propose changes. The patient confirms anything that alters what is tried or
                what is recorded about them.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Outcomes view — shared by psychologist, therapist and OT navigation. */
export function OutcomesView() {
  const { option } = useSession()
  const base = option?.home ?? '/psychologist'
  const withOutcome = strategies.filter((s) => s.outcome)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Outcomes"
        description="What happened when something was tried — including the attempts that did not work."
      />
      <Card>
        <Table
          columns={['Strategy', 'Patient', 'Effectiveness', 'What happened', 'Proposed next step']}
          rows={withOutcome.map((s) => ({
            key: s.id,
            to: `${base}/strategies/${s.id}`,
            cells: [
              s.title,
              patientName(s.patientId),
              s.outcome?.effectiveness,
              s.outcome?.summary,
              s.outcome?.proposedAdaptation ?? '—',
            ],
          }))}
        />
      </Card>
    </div>
  )
}
