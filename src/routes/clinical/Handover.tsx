import { useState } from 'react'
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  PageHeader,
} from '../../components/ui'
import { AiProvenance } from '../../components/shared'
import { patients, people } from '../../data/db'
import { useUI } from '../../state/ui'

const CATEGORIES = [
  'Functional information',
  'Support strategies and outcomes',
  'Recent changes',
  'Professional observations',
  'Clinical documents',
  'Patient-reported experience',
  'Environment and workplace context',
]

const STAGES = ['Select', 'Draft', 'Review', 'Patient approval', 'Sent'] as const

/** 22.1 Handover builder. */
export default function HandoverBuilder() {
  const { say } = useUI()
  const [stage, setStage] = useState(0)
  const [patient, setPatient] = useState('pt-ananya')
  const [recipient, setRecipient] = useState('u-sana')
  const [purpose, setPurpose] = useState('Joint review of workplace transitions')
  const [period, setPeriod] = useState('Last 3 months')
  const [chosen, setChosen] = useState<string[]>([
    'Functional information',
    'Support strategies and outcomes',
    'Recent changes',
  ])
  const [draft, setDraft] = useState(
    'Between May and August 2026, difficulty with schedule changes was recorded in three contexts. A written advance-notice arrangement was trialled from 21 July. It was effective where notice arrived several hours ahead and ineffective where the change was announced within the same hour. A quiet-space trial began on 12 August with two check-ins recorded. A workplace accommodation request was submitted on 18 August and is with the employer.',
  )

  const recipientPerson = people.find((p) => p.id === recipient)

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Handover"
        description="Assemble a handover from the record, then have it approved before it goes anywhere. Clinical documents are never included unless the patient specifically approves them."
      />

      <ol className="mb-6 flex flex-wrap gap-2">
        {STAGES.map((label, i) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-1.5 text-[0.79rem] ${
              i < stage
                ? 'border-state-good/30 bg-state-good-tint text-state-good'
                : i === stage
                  ? 'border-clinical bg-clinical-tint text-clinical'
                  : 'border-line text-muted'
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardBody className="space-y-5">
          {stage === 0 ? (
            <>
              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-muted">Patient</span>
                <select
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                  className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.88rem]"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-muted">Recipient</span>
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.88rem]"
                >
                  {people
                    .filter((p) => !['patient', 'admin'].includes(p.role))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.title}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-muted">Purpose</span>
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.88rem] outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[0.82rem] text-muted">Time period</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-lg border border-line-strong px-3 py-2 text-[0.88rem]"
                >
                  {['Last month', 'Last 3 months', 'Last 6 months', 'Since diagnosis'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-2 block text-[0.82rem] text-muted">Information categories</span>
                <ul className="space-y-2">
                  {CATEGORIES.map((c) => {
                    const clinical = c === 'Clinical documents'
                    const orgRecipient = ['employer', 'university'].includes(recipientPerson?.role ?? '')
                    const blocked = clinical && orgRecipient
                    return (
                      <li key={c}>
                        <label
                          className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[0.87rem] ${
                            blocked ? 'border-line bg-surface-2 text-muted' : 'border-line text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={blocked}
                            checked={chosen.includes(c)}
                            onChange={(e) =>
                              setChosen((list) =>
                                e.target.checked ? [...list, c] : list.filter((x) => x !== c),
                              )
                            }
                          />
                          <span>
                            {c}
                            {blocked ? (
                              <span className="block text-[0.78rem]">
                                Not available for this recipient — outside their authorised scope.
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : null}

          {stage === 1 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">Draft prepared by ORCA</h2>
              <textarea
                rows={9}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-lg border border-line-strong px-3.5 py-3 text-[0.89rem] leading-relaxed outline-none"
              />
              <AiProvenance />
            </>
          ) : null}

          {stage === 2 ? (
            <>
              <h2 className="text-[1rem] font-medium text-ink">Review before it leaves</h2>
              <DefinitionList
                items={[
                  { label: 'Patient', value: patients.find((p) => p.id === patient)?.name ?? '' },
                  { label: 'Recipient', value: `${recipientPerson?.name} — ${recipientPerson?.title}` },
                  { label: 'Purpose', value: purpose },
                  { label: 'Period', value: period },
                  { label: 'Categories', value: chosen.join(', ') },
                ]}
              />
              <p className="rounded-[10px] bg-canvas px-4 py-3 text-[0.87rem] leading-relaxed text-ink">
                {draft}
              </p>
              <Callout tone="wait" title="This still needs the patient's approval">
                A handover is a disclosure. Ananya will see this exact content, and can remove any
                part of it, before it is sent.
              </Callout>
            </>
          ) : null}

          {stage === 3 ? (
            <Callout tone="info" title="Sent to the patient for approval">
              Ananya Rao has been asked to review this handover. You will be notified when they
              approve, edit or decline it. Nothing has been sent to {recipientPerson?.name} yet.
            </Callout>
          ) : null}

          {stage === 4 ? (
            <Callout tone="good" title="Handover sent">
              Delivered to {recipientPerson?.name} for the stated purpose, and recorded in the audit
              log and in the patient's sharing history.
            </Callout>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-5 flex flex-wrap gap-2">
        {stage > 0 && stage < 4 ? <Button onClick={() => setStage(stage - 1)}>Back</Button> : null}
        {stage < 2 ? (
          <Button variant="primary" onClick={() => setStage(stage + 1)}>
            {stage === 0 ? 'Generate draft' : 'Review'}
          </Button>
        ) : null}
        {stage === 2 ? (
          <Button
            variant="primary"
            onClick={() => {
              setStage(3)
              say('Sent to the patient for approval.')
            }}
          >
            Request patient approval
          </Button>
        ) : null}
        {stage === 3 ? (
          <Button
            variant="primary"
            onClick={() => {
              setStage(4)
              say('Patient approved. Handover sent.')
            }}
          >
            Simulate patient approval
          </Button>
        ) : null}
      </div>

      <div className="mt-8">
        <Card>
          <CardHead title="Previous handovers" />
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] text-ink">
              <li>
                Occupational therapy functional report → Dr Vikram Rao (GP)
                <span className="block text-[0.79rem] text-muted">
                  6 May 2026 · care coordination · approved by the patient
                </span>
              </li>
              <li>
                Functional summary → Pune Institute of Design
                <span className="block text-[0.79rem] text-muted">
                  2 June 2026 · reasonable adjustment plan · approved by the patient
                </span>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
