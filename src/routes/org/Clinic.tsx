import { Link, useParams } from 'react-router-dom'
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
  Tag,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import {
  appointments,
  connections,
  documents,
  patientName,
  patients,
  people,
  personName,
  requests,
  workflowRuns,
} from '../../data/db'
import { useUI } from '../../state/ui'

/** 27.1 Clinic dashboard. */
export function ClinicDashboard() {
  const pending = workflowRuns.filter((w) => w.status !== 'Completed')
  const today = appointments.filter((a) => a.datetime.startsWith('2026-08-19'))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Clinic dashboard"
        description="Sahyadri Neurodevelopmental Clinic — activity, appointments, and anything waiting on the clinic."
      />

      <Grid cols={4}>
        <Stat label="Appointments today" value={today.length} />
        <Stat label="Workflows in flight" value={pending.length} />
        <Stat label="Referrals open" value={requests.filter((r) => r.type === 'Referral').length} />
        <Stat label="Documents this month" value={documents.length} />
      </Grid>

      <div className="mt-8">
        <SectionTitle>Today</SectionTitle>
        <Card>
          <Table
            columns={['Patient', 'Professional', 'When', 'Purpose', 'Status']}
            rows={today.map((a) => ({
              key: a.id,
              to: `/clinic/patients/${a.patientId}`,
              cells: [
                patientName(a.patientId),
                personName(a.professionalId),
                formatDateTime(a.datetime),
                a.purpose,
                <StatusPill key="s" status={a.status} />,
              ],
            }))}
          />
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Waiting on the clinic</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-3">
              {pending.slice(0, 4).map((w) => (
                <li key={w.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.88rem] text-ink">{w.type}</p>
                    <p className="text-[0.79rem] text-muted">
                      {patientName(w.patientId)} · {w.currentStep} · waiting for {w.waitingFor}
                    </p>
                  </div>
                  <StatusPill status={w.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-[1.7rem] font-semibold tracking-[-0.02em] text-ink">{value}</p>
        <p className="mt-0.5 text-[0.82rem] text-muted">{label}</p>
      </CardBody>
    </Card>
  )
}

/** Clinic patient list. */
export function ClinicPatients() {
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Patients"
        description="Coordination view. Clinical content stays with the professionals the patient has connected to."
      />
      <Card>
        <Table
          columns={['Patient', 'Care team', 'Open workflows', 'Next appointment']}
          rows={patients.map((p) => {
            const next = appointments.find((a) => a.patientId === p.id && a.status !== 'Completed')
            return {
              key: p.id,
              to: `/clinic/patients/${p.id}`,
              cells: [
                p.name,
                connections.filter((c) => c.patientId === p.id).length || 3,
                workflowRuns.filter((w) => w.patientId === p.id && w.status !== 'Completed').length,
                next ? formatDateTime(next.datetime) : '—',
              ],
            }
          })}
        />
      </Card>
    </div>
  )
}

/** 27.2 Patient coordination view. */
export function ClinicPatientCoordination() {
  const { patientId } = useParams()
  const { say } = useUI()
  const patient = patients.find((p) => p.id === patientId)
  if (!patient) return <p className="text-[0.9rem] text-muted">Patient not found.</p>

  const theirWorkflows = workflowRuns.filter((w) => w.patientId === patient.id)
  const theirAppointments = appointments.filter((a) => a.patientId === patient.id)
  const theirDocs = documents.filter((d) => d.patientId === patient.id)
  const theirRequests = requests.filter((r) => r.patientId === patient.id)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={patient.name}
        description={patient.context}
        breadcrumbs={[{ label: 'Patients', to: '/clinic/patients' }, { label: patient.name }]}
        actions={<Button onClick={() => say('Coordination note added.')}>Add coordination note</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHead title="Care team" />
          <CardBody>
            <ul className="space-y-2">
              {people
                .filter((p) => ['psychologist', 'psychiatrist', 'ot', 'gp', 'therapist'].includes(p.role))
                .map((p) => (
                  <li key={p.id} className="text-[0.87rem] text-ink">
                    {p.name}
                    <span className="block text-[0.79rem] text-muted">
                      {p.title} · {p.organisation}
                    </span>
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Current workflows" />
          <CardBody>
            <ul className="space-y-3">
              {theirWorkflows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.87rem] text-ink">{w.type}</p>
                    <p className="text-[0.79rem] text-muted">
                      {w.currentStep} · waiting for {w.waitingFor}
                    </p>
                  </div>
                  <StatusPill status={w.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Appointments" />
          <CardBody>
            <ul className="space-y-2">
              {theirAppointments.map((a) => (
                <li key={a.id} className="text-[0.86rem] text-ink">
                  {formatDateTime(a.datetime)} — {a.purpose}
                  <span className="block text-[0.79rem] text-muted">
                    {personName(a.professionalId)} · {a.location}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Documents and referrals" />
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] text-ink">
              {theirDocs.map((d) => (
                <li key={d.id}>
                  {d.title}
                  <span className="block text-[0.79rem] text-muted">
                    {d.category} · {formatDate(d.date)}
                  </span>
                </li>
              ))}
              {theirRequests
                .filter((r) => r.type === 'Referral')
                .map((r) => (
                  <li key={r.id}>
                    {r.title}
                    <span className="block text-[0.79rem] text-muted">
                      Referral · {r.status}
                    </span>
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Outstanding tasks</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-2 text-[0.86rem] text-ink">
              <li>Confirm quiet-room booking process with facilities — due 22 August</li>
              <li>Chase employer response if nothing by 8 September</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/** Pending actions across the clinic. */
export function ClinicPending() {
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Pending actions"
        description="Everything the clinic is holding, and who each item is waiting on."
      />
      <Card>
        <Table
          columns={['Workflow', 'Patient', 'Step', 'Waiting for', 'Started', 'Status']}
          rows={workflowRuns.map((w) => ({
            key: w.id,
            cells: [
              w.type,
              patientName(w.patientId),
              w.currentStep,
              w.waitingFor,
              formatDate(w.started),
              <StatusPill key="s" status={w.status} />,
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Access management — who in the clinic can see what. */
export function ClinicAccess() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Access management"
        description="Access is granted by patients, per professional and per purpose. The clinic cannot grant itself access to a record."
      />
      <Card className="mb-6">
        <Table
          columns={['Professional', 'Patient', 'Scope', 'Granted', 'Review due']}
          rows={connections
            .filter((c) => people.find((p) => p.id === c.personId)?.organisation?.includes('Sahyadri'))
            .map((c) => ({
              key: c.id,
              cells: [
                personName(c.personId),
                patientName(c.patientId),
                c.accessScope.join(', '),
                formatDate(c.consentGiven),
                formatDate(c.reviewDue),
              ],
            }))}
        />
      </Card>

      <Card>
        <CardHead title="Standing rules" />
        <CardBody>
          <DefinitionList
            items={[
              { label: 'Default', value: 'No access. Every connection is created by the patient.' },
              { label: 'Duration', value: 'Time-limited, with a review date on every grant.' },
              { label: 'Revocation', value: 'Immediate, by the patient, without needing a reason.' },
              { label: 'Audit', value: 'Every read, write and share is logged, including denials.' },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Tag>Role-based access control</Tag>
            <Tag>Purpose limitation</Tag>
            <Tag>Time-bounded consent</Tag>
          </div>
          <p className="mt-4 text-[0.84rem] leading-relaxed text-muted">
            These are backend decisions.{' '}
            <Link to="/admin/audit" className="text-brand hover:underline">
              The audit log
            </Link>{' '}
            records what was allowed and what was denied.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
