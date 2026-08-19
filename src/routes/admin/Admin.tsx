import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  FilterChips,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  Table,
  Tag,
  formatDate,
} from '../../components/ui'
import { WorkflowStatePanel } from '../../components/shared'
import { auditLog, patientName, people, workflowRuns } from '../../data/db'
import { useUI } from '../../state/ui'

/** 31.1 System dashboard. */
export function AdminDashboard() {
  const blocked = workflowRuns.filter((w) => w.status === 'Blocked')
  const escalated = workflowRuns.filter((w) => w.status === 'Escalated')
  const awaiting = workflowRuns.filter((w) => w.status.startsWith('Awaiting'))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="System dashboard"
        description="Operational view. No clinical content is readable from this role — only workflow state, access and system health."
      />

      <Grid cols={4}>
        <Stat label="Active workflows" value={workflowRuns.length} tone="neutral" />
        <Stat label="Awaiting a person" value={awaiting.length} tone="wait" />
        <Stat label="Escalated" value={escalated.length} tone="alert" />
        <Stat label="Blocked" value={blocked.length} tone="alert" />
      </Grid>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHead title="Needs operator attention" />
          <CardBody>
            <ul className="space-y-3">
              {[...blocked, ...escalated].map((w) => (
                <li key={w.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link to="/admin/workflows" className="text-[0.88rem] text-ink hover:underline">
                      {w.id} · {w.type}
                    </Link>
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
          <CardHead title="System and integration health" />
          <CardBody>
            <ul className="space-y-2.5 text-[0.87rem]">
              {[
                ['Identity and access service', 'Operational'],
                ['Consent and disclosure engine', 'Operational'],
                ['Longitudinal record store', 'Operational'],
                ['Reasoning services', 'Operational'],
                ['Mock document service', 'Degraded — one timeout in the last 24 hours'],
                ['Mock employer endpoint', 'Operational (simulated)'],
              ].map(([name, state]) => (
                <li key={name} className="flex items-center justify-between gap-3">
                  <span className="text-ink">{name}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[0.74rem] ${
                      state.startsWith('Operational')
                        ? 'bg-state-good-tint text-state-good'
                        : 'bg-state-alert-tint text-state-alert'
                    }`}
                  >
                    {state}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle>Recent access decisions</SectionTitle>
        <Card>
          <Table
            columns={['When', 'Who', 'Action', 'Result']}
            rows={auditLog.slice(0, 4).map((a) => ({
              key: a.id,
              cells: [
                a.when,
                `${a.who} (${a.role})`,
                a.action,
                <span
                  key="r"
                  className={`rounded-full px-2.5 py-0.5 text-[0.74rem] ${
                    a.result === 'Allowed'
                      ? 'bg-state-good-tint text-state-good'
                      : 'bg-state-alert-tint text-state-alert'
                  }`}
                >
                  {a.result}
                </span>,
              ],
            }))}
          />
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const map: Record<string, string> = {
    neutral: 'text-ink',
    wait: 'text-state-wait',
    alert: 'text-state-alert',
  }
  return (
    <Card>
      <CardBody>
        <p className={`text-[1.7rem] font-semibold tracking-[-0.02em] ${map[tone]}`}>{value}</p>
        <p className="mt-0.5 text-[0.82rem] text-muted">{label}</p>
      </CardBody>
    </Card>
  )
}

/** 31.2 Workflow monitor. */
export function AdminWorkflows() {
  const [filter, setFilter] = useState('All')
  const rows = workflowRuns.filter((w) => filter === 'All' || w.status === filter)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Workflow monitoring"
        description="Every run, its current step, and who it is waiting on. Clicking a run opens its state."
      />
      <div className="mb-4">
        <FilterChips
          options={['All', 'Awaiting approval', 'Awaiting stakeholder', 'Escalated', 'Blocked']}
          active={filter}
          onChange={setFilter}
        />
      </div>
      <Card>
        <Table
          columns={['Workflow ID', 'Type', 'Stakeholder', 'Current step', 'Status', 'Waiting for', 'Started', 'Updated']}
          rows={rows.map((w) => ({
            key: w.id,
            to: `/admin/workflows/${w.id}`,
            cells: [
              w.id,
              w.type,
              w.stakeholder,
              w.currentStep,
              <StatusPill key="s" status={w.status} />,
              w.waitingFor,
              formatDate(w.started),
              formatDate(w.updated),
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Workflow state detail. */
export function AdminWorkflow() {
  const { workflowId } = useParams()
  const { say } = useUI()
  const workflow = workflowRuns.find((w) => w.id === workflowId)
  if (!workflow) return <p className="text-[0.9rem] text-muted">Workflow not found.</p>

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`${workflow.id} — ${workflow.type}`}
        description={`${patientName(workflow.patientId)} · ${workflow.stakeholder}`}
        breadcrumbs={[{ label: 'Workflows', to: '/admin/workflows' }, { label: workflow.id }]}
        actions={<StatusPill status={workflow.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <WorkflowStatePanel
          title="State"
          meta={`Waiting for ${workflow.waitingFor}`}
          steps={workflow.steps}
        />

        <div className="space-y-6">
          <Card>
            <CardHead title="Run detail" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Started', value: formatDate(workflow.started) },
                  { label: 'Last updated', value: formatDate(workflow.updated) },
                  { label: 'Current step', value: workflow.currentStep },
                  { label: 'Waiting for', value: workflow.waitingFor },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Operator actions" meta="None of these can read record content" />
            <CardBody className="flex flex-col gap-2">
              <Button onClick={() => say('Retry queued.')}>Retry the current step</Button>
              <Button onClick={() => say('Escalated to a named reviewer.')}>Escalate</Button>
              <Button variant="danger" onClick={() => say('Run cancelled. The patient is notified.')}>
                Cancel run
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** 31.3 Audit log. */
export function AdminAudit() {
  const [filter, setFilter] = useState('All')
  const rows = auditLog.filter((a) => filter === 'All' || a.accessType === filter)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Audit log"
        description="Who accessed what, when, why, and whether it was allowed. Denials are recorded as carefully as approvals."
      />
      <div className="mb-4">
        <FilterChips
          options={['All', 'Read', 'Write', 'Share', 'Approve', 'Revoke', 'Login']}
          active={filter}
          onChange={setFilter}
        />
      </div>
      <Card>
        <Table
          columns={['When', 'Who', 'Role', 'Action', 'Record', 'Why', 'Result']}
          rows={rows.map((a) => ({
            key: a.id,
            cells: [
              a.when,
              a.who,
              a.role,
              a.action,
              a.record,
              a.why,
              <span
                key="r"
                className={`rounded-full px-2.5 py-0.5 text-[0.74rem] ${
                  a.result === 'Allowed'
                    ? 'bg-state-good-tint text-state-good'
                    : 'bg-state-alert-tint text-state-alert'
                }`}
              >
                {a.result}
              </span>,
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Users. */
export function AdminUsers() {
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Users"
        description="Accounts and roles. Administrators manage access; they do not read records."
      />
      <Card>
        <Table
          columns={['Name', 'Role', 'Title', 'Organisation', 'Record access']}
          rows={people.map((p) => ({
            key: p.id,
            cells: [
              p.name,
              p.role,
              p.title ?? '—',
              p.organisation ?? '—',
              p.role === 'admin' ? (
                <Tag key="t">None — operational only</Tag>
              ) : p.role === 'patient' ? (
                <Tag key="t">Own record</Tag>
              ) : (
                <Tag key="t">Granted per patient</Tag>
              ),
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Access management. */
export function AdminAccess() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Access management"
        description="The rules the backend enforces. These are deterministic — no model decides who may see what."
      />
      <Card className="mb-6">
        <CardHead title="Enforced rules" />
        <CardBody>
          <ul className="space-y-3 text-[0.88rem] leading-relaxed text-ink">
            <li>Access requires a patient-created connection with a stated purpose and end date.</li>
            <li>Employer and university roles cannot resolve clinical records at any scope.</li>
            <li>Raw journal content is not readable by any role other than the patient.</li>
            <li>Every outbound disclosure requires an explicit, logged approval taken beforehand.</li>
            <li>Administrators can see workflow state and audit entries, never record content.</li>
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHead title="Break-glass" />
        <CardBody>
          <p className="text-[0.88rem] leading-relaxed text-ink">
            Not enabled in this deployment. If it were, every use would notify the patient and appear
            in their own privacy centre, not only in this log.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

/** Integrations. */
export function AdminIntegrations() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Integrations"
        description="External systems are simulated in this prototype. Nothing is written to a real hospital, government or employer system."
      />
      <Grid cols={2}>
        {[
          ['Clinic scheduling (mock)', 'Read-only', 'Operational'],
          ['Document extraction (mock)', 'Read/write', 'Degraded'],
          ['Employer HR endpoint (mock)', 'Write, simulated', 'Operational'],
          ['University accessibility endpoint (mock)', 'Write, simulated', 'Operational'],
        ].map(([name, mode, state]) => (
          <Card key={name}>
            <CardHead title={name} meta={mode} />
            <CardBody>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.76rem] ${
                  state === 'Operational'
                    ? 'bg-state-good-tint text-state-good'
                    : 'bg-state-alert-tint text-state-alert'
                }`}
              >
                {state}
              </span>
            </CardBody>
          </Card>
        ))}
      </Grid>
    </div>
  )
}
