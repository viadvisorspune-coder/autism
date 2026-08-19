import { useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  Table,
  formatDate,
} from '../../components/ui'
import { AiProvenance } from '../../components/shared'
import { eventsFor, profileItems, strategiesFor } from '../../data/db'
import { useUI } from '../../state/ui'

/* ------------------------------------------------- 25.1 OT functional profile */

export function FunctionalProfile() {
  const helps = profileItems.filter((p) => p.section === 'What helps me')
  const context = profileItems.filter((p) => p.section === 'Important context')

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Functional profile"
        description="Ananya Rao — organised as person, activity, environment. Nothing here is a clinical judgement."
      />

      <Grid cols={3}>
        <Card>
          <CardHead title="Person" />
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] leading-relaxed text-ink">
              <li>Prefers written communication; unplanned calls are difficult.</li>
              <li>Works best in the first half of the day.</li>
              <li>Plans the week on Sunday evening.</li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Activity" />
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] leading-relaxed text-ink">
              <li>Test cycles requiring sustained focus (morning).</li>
              <li>Sprint meetings, frequently rescheduled.</li>
              <li>Part-time study — studio work in the evening.</li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Environment" />
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] leading-relaxed text-ink">
              <li>Open-plan office; desk on the main walkway.</li>
              <li>Quiet room available on the second floor, not always free.</li>
              <li>Change announcements arrive across three channels.</li>
            </ul>
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-8">
        <SectionTitle>Daily activities and routines</SectionTitle>
        <Card>
          <CardBody>
            <Table
              columns={['Routine', 'Demand', 'Current support', 'Status']}
              rows={[
                {
                  key: 'r1',
                  cells: [
                    'Morning test cycle',
                    'Sustained focus, low interruption',
                    'None in place',
                    <StatusPill key="a" status="Requires adaptation" />,
                  ],
                },
                {
                  key: 'r2',
                  cells: [
                    'Sprint meetings',
                    'Unpredictable timing',
                    'Written advance notice (partly effective)',
                    <StatusPill key="b" status="Requires adaptation" />,
                  ],
                },
                {
                  key: 'r3',
                  cells: [
                    'After an unplanned meeting',
                    'Transition and recovery',
                    'Quiet room, 20 minutes',
                    <StatusPill key="c" status="Active" />,
                  ],
                },
                {
                  key: 'r4',
                  cells: [
                    'Evening studio work',
                    'Task switching after work',
                    'Written brief summaries (university)',
                    <StatusPill key="d" status="Completed" />,
                  ],
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Functional barriers and what helps</SectionTitle>
        <Grid cols={2}>
          <Card>
            <CardHead title="What helps" />
            <CardBody>
              <ul className="space-y-2 text-[0.86rem] leading-relaxed text-ink">
                {helps.map((h) => (
                  <li key={h.id}>
                    {h.text}
                    <span className="block text-[0.78rem] text-muted">{formatDate(h.date)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHead title="Sensory and environmental factors" />
            <CardBody>
              <ul className="space-y-2 text-[0.86rem] leading-relaxed text-ink">
                {context.map((c) => (
                  <li key={c.id}>{c.text}</li>
                ))}
              </ul>
              <AiProvenance />
            </CardBody>
          </Card>
        </Grid>
      </div>
    </div>
  )
}

/* --------------------------------------------- 25.2 OT environment workspace */

const ENVIRONMENT_ROWS = [
  {
    environment: 'Open-plan floor, walkway desk',
    demand: 'Peripheral movement during focused work',
    trigger: 'Colleagues passing to the kitchen and stairwell',
    response: 'Loss of thread during test cycles; work re-done',
    adaptation: 'None in place (headphones trialled, unsuccessful)',
    outcome: 'Did not help — interruptions changed form rather than stopping',
  },
  {
    environment: 'Meeting rooms, sprint cycle',
    demand: 'Unpredictable timing',
    trigger: 'Meeting moved with under 30 minutes’ notice',
    response: 'Rest of the day difficult to use; catching up in the evening',
    adaptation: 'Written advance notice from the team lead',
    outcome: 'Partly helped — effective with several hours’ notice only',
  },
  {
    environment: 'Second-floor quiet room',
    demand: 'Recovery after an unplanned transition',
    trigger: 'Meeting ends, next task begins immediately',
    response: 'Returning to the planned task without a break is difficult',
    adaptation: '20 minutes of protected time',
    outcome: 'Two check-ins: one helped, one partly helped (room occupied)',
  },
]

export function EnvironmentWorkspace() {
  const { say } = useUI()
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Environment"
        description="Observed demands, what triggers them, and what has been tried in each setting."
        actions={<Button onClick={() => say('New observation form opened.')}>Add observation</Button>}
      />
      <div className="space-y-4">
        {ENVIRONMENT_ROWS.map((row) => (
          <Card key={row.environment}>
            <CardHead title={row.environment} />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Demand', value: row.demand },
                  { label: 'Trigger / context', value: row.trigger },
                  { label: 'Observed response', value: row.response },
                  { label: 'Existing adaptation', value: row.adaptation },
                  { label: 'Outcome', value: row.outcome },
                ]}
              />
            </CardBody>
          </Card>
        ))}
      </div>
      <p className="mt-6 max-w-2xl text-[0.84rem] leading-relaxed text-muted">
        Observations are recorded as observations. What they mean is worked out with the patient, not
        asserted about them.
      </p>
    </div>
  )
}

/* ------------------------------------------------ 25.3 OT adaptation trials */

export function AdaptationTrials() {
  const { say } = useUI()
  const trials = strategiesFor('pt-ananya')

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Adaptation trials"
        description="Each adaptation is a trial with a stated duration, conditions and success criteria — not a permanent prescription."
        actions={<Button variant="primary" onClick={() => say('New trial drafted.')}>New trial</Button>}
      />
      <div className="space-y-4">
        {trials.map((t) => (
          <Card key={t.id}>
            <CardHead
              title={t.title}
              meta={t.environment ?? t.conditions}
              action={<StatusPill status={t.status} />}
            />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Proposed adaptation', value: t.goal },
                  { label: 'Implementation', value: t.conditions },
                  { label: 'Duration', value: `${t.durationWeeks} weeks from ${formatDate(t.start)}` },
                  {
                    label: 'Outcome',
                    value: t.outcome
                      ? `${t.outcome.effectiveness} — ${t.outcome.summary}`
                      : `${t.checkIns.length} check-ins so far`,
                  },
                  {
                    label: 'Modification',
                    value: t.outcome?.proposedAdaptation ?? 'None proposed yet',
                  },
                ]}
              />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------- 24.2 Therapist goal workspace */

export function GoalWorkspace() {
  const { say } = useUI()
  const goals = profileItems.filter((p) => p.section === 'Current goals')
  const strategies = strategiesFor('pt-ananya')

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Goals"
        description="Each goal, what is currently being tried for it, what was tried before, and what happens next."
      />
      <div className="space-y-4">
        {goals.map((goal, i) => {
          const current = strategies[i]
          const previous = strategies.filter((_, j) => j !== i).slice(0, 2)
          return (
            <Card key={goal.id}>
              <CardHead title={goal.text} meta={`Set ${formatDate(goal.date)}`} />
              <CardBody className="space-y-4">
                <DefinitionList
                  items={[
                    { label: 'Current strategy', value: current?.title ?? 'None' },
                    {
                      label: 'Previous strategies',
                      value: previous.map((p) => p.title).join(' · ') || 'None recorded',
                    },
                    {
                      label: 'Outcome',
                      value: current?.outcome
                        ? `${current.outcome.effectiveness} — ${current.outcome.summary}`
                        : 'Trial running',
                    },
                    {
                      label: 'Next action',
                      value: current?.outcome?.proposedAdaptation ?? 'Continue and review at the next check-in',
                    },
                  ]}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => say('Goal opened for editing.')}>Edit goal</Button>
                  <Button onClick={() => say('Intervention drafted for this goal.')}>
                    Plan an intervention
                  </Button>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------- 24.3 Therapist intervention workspace */

export function InterventionWorkspace() {
  const [selected, setSelected] = useState('st-1')
  const strategies = strategiesFor('pt-ananya')
  const strategy = strategies.find((s) => s.id === selected) ?? strategies[0]
  const events = eventsFor('pt-ananya').filter((e) => strategy.evidenceIds.includes(e.id))

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Interventions"
        description="Strategy, rationale, context, trial and what came of it — in one place, so adaptation is based on evidence rather than memory."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {strategies.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            aria-pressed={selected === s.id}
            className={`rounded-full border px-3 py-1.5 text-[0.82rem] ${
              selected === s.id
                ? 'border-clinical bg-clinical-tint text-clinical'
                : 'border-line text-ink-2 hover:border-line-strong'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <Card>
        <CardHead title={strategy.title} action={<StatusPill status={strategy.status} />} />
        <CardBody className="space-y-4">
          <DefinitionList
            items={[
              { label: 'Rationale', value: strategy.rationale },
              { label: 'Context', value: strategy.environment ?? strategy.conditions },
              {
                label: 'Trial',
                value: `${strategy.durationWeeks} weeks from ${formatDate(strategy.start)} · success criteria: ${strategy.successCriteria}`,
              },
              {
                label: 'Outcome',
                value: strategy.outcome
                  ? `${strategy.outcome.effectiveness} — ${strategy.outcome.summary}`
                  : `${strategy.checkIns.length} check-ins recorded`,
              },
              {
                label: 'Adaptation',
                value: strategy.outcome?.proposedAdaptation ?? 'None proposed yet',
              },
            ]}
          />
          {events.length ? (
            <div>
              <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                Evidence this was based on
              </h3>
              <ul className="space-y-1 text-[0.85rem] text-ink">
                {events.map((e) => (
                  <li key={e.id}>
                    {e.title} <span className="text-muted">({formatDate(e.date)})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <AiProvenance />
        </CardBody>
      </Card>
    </div>
  )
}
