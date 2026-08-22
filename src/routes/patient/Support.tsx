import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  EmptyState,
  PageHeader,
  StatusPill,
  Tabs,
  formatDate,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { personName, strategies, strategiesFor, timeline } from '../../data/db'
import { useUI } from '../../state/ui'
import type { Strategy } from '../../data/types'

/** 7.1 My support dashboard. */
export function PatientSupport() {
  const [tab, setTab] = useState('Active')
  const all = strategiesFor('pt-ananya')
  const shown =
    tab === 'Active'
      ? all.filter((s) => ['Active', 'Requires adaptation', 'Draft'].includes(s.status))
      : tab === 'Previous'
        ? all.filter((s) => s.status === 'Completed')
        : all.filter((s) => s.checkIns.length > 0)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My support"
        description="Things being tried, why they were chosen, and what actually happened. A strategy that did not work is as useful as one that did."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'My support' }]}
      />

      <Tabs tabs={['Active', 'Previous', 'Trials']} active={tab} onChange={setTab} />

      {shown.length === 0 ? (
        <EmptyState title="Nothing here yet" detail="Strategies you try will appear here." />
      ) : (
        <ul className="space-y-3">
          {shown.map((strategy) => (
            <li key={strategy.id}>
              <Link
                to={`/patient/support/${strategy.id}`}
                className="block rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.95rem] font-medium text-ink">{strategy.title}</p>
                    <p className="mt-1 text-[0.85rem] leading-relaxed text-ink-2">{strategy.goal}</p>
                    <p className="mt-2 text-[0.79rem] leading-relaxed text-muted">
                      Chosen because: {strategy.rationale}
                    </p>
                    <p className="mt-2 text-[0.78rem] text-muted">
                      Started {formatDate(strategy.start)} · review {formatDate(strategy.reviewDate)} ·{' '}
                      {strategy.checkIns.length} check-in{strategy.checkIns.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <StatusPill status={strategy.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 7.2–7.4 Strategy detail, trial tracker and outcome. */
export function PatientStrategy() {
  const { strategyId } = useParams()
  const { say } = useUI()
  const strategy = strategies.find((s) => s.id === strategyId)
  const [note, setNote] = useState('')
  const [helpfulness, setHelpfulness] = useState<'Helped' | 'Partly helped' | 'Did not help'>('Helped')
  const [checkIns, setCheckIns] = useState(strategy?.checkIns ?? [])

  if (!strategy) return <p className="text-[0.9rem] text-muted">That strategy could not be found.</p>

  const evidence = timeline.filter((e) => strategy.evidenceIds.includes(e.id))
  const phases: Strategy['phase'][] = ['Baseline', 'Started', 'Check-ins', 'Outcome', 'Adaptation']
  const phaseIndex = phases.indexOf(strategy.phase)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={strategy.title}
        description={strategy.goal}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'My support', to: '/patient/support' },
          { label: 'Strategy' },
        ]}
        actions={<StatusPill status={strategy.status} />}
      />

      {/* --------------------------------------------------- 7.3 trial tracker */}
      <Card className="mb-6">
        <CardHead title="Where this trial has got to" meta={`${strategy.durationWeeks}-week trial`} />
        <CardBody>
          <ol className="flex flex-wrap gap-2">
            {phases.map((phase, i) => (
              <li
                key={phase}
                className={`flex items-center gap-2 rounded-full  px-3 py-1.5 text-[0.8rem] ${
                  i < phaseIndex
                    ? 'bg-state-good-tint text-state-good'
                    : i === phaseIndex
                      ? 'border-brand bg-brand-tint text-brand-ink'
                      : 'border-line text-muted'
                }`}
              >
                {phase}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHead title="Why this was suggested" />
            <CardBody>
              <p className="text-[0.9rem] leading-relaxed text-ink">{strategy.rationale}</p>
              {evidence.length ? (
                <ul className="mt-4 space-y-2">
                  {evidence.map((e) => (
                    <li key={e.id}>
                      <Link
                        to={`/patient/story/${e.id}`}
                        className="block rounded-2xl  border-line px-3 py-2 text-[0.84rem] hover:border-line-strong"
                      >
                        <span className="text-ink">{e.title}</span>
                        <span className="ml-2 text-muted">{formatDate(e.date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4">
                <WhyButton
                  title={strategy.title}
                  bundle={{
                    input: strategy.goal,
                    relevantHistory: evidence.map((e) => `${e.title} (${formatDate(e.date)})`),
                    supporting: strategy.checkIns
                      .filter((c) => c.helpfulness !== 'Did not help')
                      .map((c) => `${formatDate(c.date)} — ${c.note}`),
                    conflicting: strategy.checkIns
                      .filter((c) => c.helpfulness === 'Did not help')
                      .map((c) => `${formatDate(c.date)} — ${c.note}`),
                    interpretation: strategy.outcome?.summary ?? 'Not enough check-ins yet to interpret.',
                    uncertainty:
                      'Check-ins are self-reported and cover a short period. They describe what happened, not why.',
                    sources: [`Owner: ${personName(strategy.ownerId)}`, 'Your check-ins'],
                  }}
                />
              </div>
              <AiProvenance />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Check-ins" meta="What actually happened, in your words" />
            <CardBody>
              {checkIns.length === 0 ? (
                <p className="text-[0.85rem] text-muted">No check-ins recorded yet.</p>
              ) : (
                <ul className="mb-5 space-y-3">
                  {checkIns.map((c) => (
                    <li key={c.date + c.note} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[0.78rem] text-muted">{formatDate(c.date)}</span>
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

              <div className="rounded-[20px] bg-canvas px-4 py-4">
                <h3 className="text-[0.88rem] font-medium text-ink">Add a check-in</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['Helped', 'Partly helped', 'Did not help'] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => setHelpfulness(h)}
                      aria-pressed={helpfulness === h}
                      className={`rounded-full  px-3 py-1.5 text-[0.8rem] ${
                        helpfulness === h
                          ? 'border-brand bg-brand-tint text-brand-ink'
                          : 'bg-surface-2 text-ink-2'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened? How much notice did you get?"
                  className="mt-3 w-full rounded-2xl  bg-surface-2 px-3 py-2 text-[0.87rem] outline-none"
                />
                <Button
                  variant="primary"
                  className="mt-3"
                  onClick={() => {
                    if (!note.trim()) return
                    setCheckIns([
                      ...checkIns,
                      { date: '2026-08-19', note: note.trim(), helpfulness, reportedBy: 'u-ananya' },
                    ])
                    setNote('')
                    say('Check-in saved. Only you and the people you have connected can see it.')
                  }}
                >
                  Save check-in
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* ------------------------------------------------- 7.4 outcome */}
          {strategy.outcome ? (
            <Card>
              <CardHead title="Outcome so far" />
              <CardBody className="space-y-4">
                <p className="text-[0.9rem] leading-relaxed text-ink">{strategy.outcome.summary}</p>
                <DefinitionList
                  items={[
                    { label: 'Effectiveness', value: strategy.outcome.effectiveness },
                    { label: 'What you said', value: `“${strategy.outcome.patientFeedback}”` },
                    ...(strategy.outcome.professionalFeedback
                      ? [{ label: 'Professional view', value: strategy.outcome.professionalFeedback }]
                      : []),
                    ...(strategy.outcome.comparison
                      ? [{ label: 'Compared with before', value: strategy.outcome.comparison }]
                      : []),
                  ]}
                />
                {strategy.outcome.proposedAdaptation ? (
                  <div className="rounded-[20px]  bg-state-wait-tint px-4 py-3">
                    <p className="text-[0.8rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
                      Proposed adaptation
                    </p>
                    <p className="mt-1 text-[0.87rem] leading-relaxed text-ink">
                      {strategy.outcome.proposedAdaptation}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => say('Adaptation accepted — a new trial was set up.')}>
                        Continue with the change
                      </Button>
                      <Button onClick={() => say('Opened for editing.')}>Modify</Button>
                      <Button onClick={() => say('Replaced. ORCA will suggest alternatives.')}>Replace</Button>
                      <Button onClick={() => say('Stopped. Nothing else will be suggested for now.')}>Stop</Button>
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------ side column */}
        <div className="space-y-6">
          <Card>
            <CardHead title="Trial setup" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Start', value: formatDate(strategy.start) },
                  { label: 'Duration', value: `${strategy.durationWeeks} weeks` },
                  { label: 'Conditions', value: strategy.conditions },
                  { label: 'Success criteria', value: strategy.successCriteria },
                  { label: 'Review date', value: formatDate(strategy.reviewDate) },
                  { label: 'Set up with', value: personName(strategy.ownerId) },
                  ...(strategy.environment ? [{ label: 'Where', value: strategy.environment }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Actions" />
            <CardBody className="flex flex-col gap-2">
              <Button onClick={() => say('Feedback recorded.')}>Give feedback</Button>
              <Button onClick={() => say('Opened for editing.')}>Modify this strategy</Button>
              <Button onClick={() => say('Paused. Nothing was deleted.')}>Stop</Button>
              <Button onClick={() => say('Kept as it is.')}>Continue</Button>
              <Link
                to="/patient/guide"
                className="rounded-2xl  border-line-strong px-3.5 py-2 text-center text-[0.85rem] text-ink hover:bg-surface-2"
              >
                Ask ORCA about this
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
