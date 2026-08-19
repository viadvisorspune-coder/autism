import { Link } from 'react-router-dom'
import {
  Card,
  CardBody,
  CardHead,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  formatDate,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { profileItems, strategiesFor } from '../../data/db'

/**
 * 14.1 My progress.
 *
 * Deliberately no scores. Four questions: what changed, what helped, what
 * didn't, and what to try next.
 */
export default function PatientProgress() {
  const strategies = strategiesFor('pt-ananya')
  const goals = profileItems.filter((p) => p.section === 'Current goals')
  const helped = strategies.filter((s) => s.outcome?.effectiveness !== 'Did not help' && s.outcome)
  const didNot = strategies.filter((s) => s.outcome?.effectiveness === 'Did not help')

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My progress"
        description="What has changed over time, told through what you tried and what happened — not a score."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'Progress' }]}
      />

      <div className="mb-8">
        <SectionTitle>Goals</SectionTitle>
        <Grid cols={2}>
          {goals.map((goal) => (
            <Card key={goal.id}>
              <CardBody>
                <p className="text-[0.92rem] leading-relaxed text-ink">{goal.text}</p>
                <p className="mt-2 text-[0.79rem] text-muted">Set {formatDate(goal.date)}</p>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </div>

      <div className="mb-8">
        <SectionTitle>What changed</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-3 text-[0.89rem] leading-relaxed text-ink">
              <li>
                <span className="font-medium">Since May</span> — difficulty has moved from “meetings
                are hard” to a narrower pattern about how much warning a change comes with.
              </li>
              <li>
                <span className="font-medium">Since July</span> — planned changes are largely
                manageable. Same-hour changes are not.
              </li>
              <li>
                <span className="font-medium">This month</span> — a workplace request is with HR, and
                a quiet-space trial is running.
              </li>
            </ul>
            <div className="mt-4">
              <WhyButton
                title="What changed"
                bundle={{
                  input: 'Summary of change over the last four months.',
                  relevantHistory: [
                    'Role change, 11 March 2026',
                    'OT assessment, 2 May 2026',
                    'Advance-notice strategy, 21 July 2026',
                  ],
                  supporting: [
                    'Check-in 28 July — helped',
                    'Quiet-room check-in 12 August — helped',
                    'University adjustment working since June',
                  ],
                  conflicting: ['Check-ins 8 and 18 August — did not help'],
                  interpretation:
                    'The difficulty has become more specific over time, which is what makes a targeted adjustment possible.',
                  uncertainty:
                    'Four months is a short period, and most of the evidence is self-reported.',
                  sources: ['Your check-ins', 'Session notes', 'OT report'],
                }}
              />
            </div>
            <AiProvenance />
          </CardBody>
        </Card>
      </div>

      <Grid cols={2}>
        <Card>
          <CardHead title="What helped" />
          <CardBody>
            <ul className="space-y-3">
              {helped.map((s) => (
                <li key={s.id}>
                  <Link to={`/patient/support/${s.id}`} className="text-[0.89rem] font-medium text-ink hover:underline">
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">
                    {s.outcome?.summary}
                  </p>
                </li>
              ))}
              <li>
                <span className="text-[0.89rem] font-medium text-ink">
                  Written summary of a changed university brief
                </span>
                <p className="mt-0.5 text-[0.83rem] text-ink-2">
                  In place since June and still working.
                </p>
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="What didn't" />
          <CardBody>
            <ul className="space-y-3">
              {didNot.map((s) => (
                <li key={s.id}>
                  <Link to={`/patient/support/${s.id}`} className="text-[0.89rem] font-medium text-ink hover:underline">
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[0.83rem] leading-relaxed text-ink-2">
                    {s.outcome?.summary}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
              Strategies that did not work stay here so they are not suggested again by mistake.
            </p>
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-8">
        <SectionTitle>What to try next</SectionTitle>
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.92rem] font-medium text-ink">
                  Transition buffer after unplanned meetings
                </p>
                <p className="mt-0.5 text-[0.85rem] leading-relaxed text-ink-2">
                  Proposed after the advance-notice review. Waiting on your decision and, for the
                  workplace part, on HR.
                </p>
              </div>
              <StatusPill status="Awaiting approval" />
            </div>
            <Link to="/patient/support/st-1" className="text-[0.85rem] font-medium text-brand hover:underline">
              Review the proposal
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
