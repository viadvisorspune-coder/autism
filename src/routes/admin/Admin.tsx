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
  Callout,
  Select,
  SortHeader,
  Table,
  Tag,
  formatDate,
} from '../../components/ui'
import { WorkflowStatePanel } from '../../components/shared'
import { auditLog, patientName, people, workflowRuns } from '../../data/db'
import { useUI } from '../../state/ui'
import { useSession } from '../../state/session'
import { actOnRecord, useLive } from '../../lib/live'

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
  const { option } = useSession()
  const { say } = useUI()
  const { data, refresh } = useLive<{ app_users: LiveUser[] }>('bundle', null, 10000)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'organisation'>('name')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // The live list where there is one, the prototype's where there is not.
  const all: LiveUser[] =
    data?.app_users ??
    people.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      title: p.title ?? null,
      organisation: p.organisation ?? null,
      email: p.email ?? null,
      active: p.active ?? true,
    }))

  const roles = ['All', ...Array.from(new Set(all.map((u) => u.role))).sort()]

  const shown = all
    .filter((u) => {
      if (roleFilter !== 'All' && u.role !== roleFilter) return false
      if (statusFilter === 'Active' && u.active === false) return false
      if (statusFilter === 'Closed' && u.active !== false) return false
      if (!query.trim()) return true
      const hay = `${u.name} ${u.role} ${u.title ?? ''} ${u.organisation ?? ''} ${u.email ?? ''}`
      return hay.toLowerCase().includes(query.trim().toLowerCase())
    })
    .sort((a, b) => {
      const key = (u: LiveUser) =>
        (sortBy === 'name' ? u.name : sortBy === 'role' ? u.role : (u.organisation ?? '')).toLowerCase()
      const order = key(a).localeCompare(key(b))
      return direction === 'asc' ? order : -order
    })

  const sort = (column: 'name' | 'role' | 'organisation') => {
    if (sortBy === column) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(column)
      setDirection('asc')
    }
  }

  async function setActive(user: LiveUser, active: boolean) {
    setBusy(user.id)
    const result = await actOnRecord('set_user_active', 'pt-ananya', option?.personId ?? '', {
      user_id: user.id,
      active,
    })
    setBusy(null)
    say(result.ok ? (result.note ?? 'Saved.') : (result.error ?? 'That could not be saved.'))
    if (result.ok) refresh()
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Users"
        description="Accounts and roles. Administrators manage access; they do not read records."
        actions={
          <Button variant="primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Cancel' : 'Add a person'}
          </Button>
        }
      />

      {adding ? (
        <div className="mb-6">
          <AddPerson
            onDone={() => {
              setAdding(false)
              refresh()
            }}
          />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, organisation or email"
          className="min-w-[16rem] flex-1 rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
        />
        <Select
          label="Role"
          value={roleFilter}
          onChange={setRoleFilter}
          options={roles.map((r) => ({ value: r, label: r === 'All' ? 'All roles' : r }))}
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'All', label: 'All' },
            { value: 'Active', label: 'Open' },
            { value: 'Closed', label: 'Closed' },
          ]}
        />
      </div>

      <p className="mb-3 text-[0.82rem] text-muted">
        {shown.length} of {all.length} {all.length === 1 ? 'account' : 'accounts'}
        {roleFilter !== 'All' || query.trim() ? ' shown' : ''}
      </p>

      <Card>
        <Table
          columns={[
            <SortHeader key="n" label="Name" active={sortBy === 'name'} direction={direction} onClick={() => sort('name')} />,
            <SortHeader key="r" label="Role" active={sortBy === 'role'} direction={direction} onClick={() => sort('role')} />,
            'Title',
            <SortHeader key="o" label="Organisation" active={sortBy === 'organisation'} direction={direction} onClick={() => sort('organisation')} />,
            'Record access',
            '',
          ]}
          rows={shown.map((u) => ({
            key: u.id,
            cells: [
              <span key="n">
                <span className={u.active === false ? 'text-muted line-through' : 'text-ink'}>
                  {u.name}
                </span>
                {u.email ? (
                  <span className="mt-0.5 block text-[0.78rem] text-muted">{u.email}</span>
                ) : null}
              </span>,
              u.role,
              u.title ?? '—',
              u.organisation ?? '—',
              u.role === 'admin' ? (
                <Tag key="t">None — operational only</Tag>
              ) : u.role === 'patient' ? (
                <Tag key="t">Own record</Tag>
              ) : (
                <Tag key="t">Granted per patient</Tag>
              ),
              <Button
                key="a"
                variant="quiet"
                disabled={busy === u.id}
                onClick={() => setActive(u, u.active === false)}
              >
                {u.active === false ? 'Reopen' : 'Close'}
              </Button>,
            ],
          }))}
        />
      </Card>

      {shown.length === 0 ? (
        <p className="mt-4 text-[0.86rem] text-muted">
          Nobody matches that. Clear the search or pick a different role.
        </p>
      ) : null}

      <p className="mt-4 text-[0.8rem] leading-relaxed text-muted">
        Closing an account stops someone signing in. It does not remove them: every action they took
        is still in the audit trail, and an entry naming somebody nobody can identify is not an audit
        trail.
      </p>
    </div>
  )
}

interface LiveUser {
  id: string
  name: string
  role: string
  title: string | null
  organisation: string | null
  email: string | null
  active?: boolean
}

/**
 * Creating an account grants nothing.
 *
 * That is the sentence the form ends on, and it is the whole point: an
 * administrator can create a psychologist, and that psychologist can see
 * precisely nothing until a patient chooses to connect to them.
 */
function AddPerson({ onDone }: { onDone: () => void }) {
  const { option } = useSession()
  const { say } = useUI()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('psychologist')
  const [title, setTitle] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ROLES = [
    'patient', 'psychologist', 'psychiatrist', 'therapist', 'ot', 'gp',
    'clinic', 'employer', 'university', 'trusted', 'admin',
  ]

  async function save() {
    setBusy(true)
    setError(null)
    const result = await actOnRecord('add_user', 'pt-ananya', option?.personId ?? '', {
      name,
      email,
      user_role: role,
      title: title || null,
      organisation: organisation || null,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    say(result.note ?? 'Account created.')
    onDone()
  }

  return (
    <Card>
      <CardHead title="Add a person" meta="They will appear on the sign-in page straight away" />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[0.8rem] text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr Nikhil Bose"
              className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.8rem] text-muted">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="n.bose@sahyadri.example"
              className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.8rem] text-muted">Job title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Consultant Psychiatrist"
              className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.8rem] text-muted">Organisation</span>
            <input
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder="Sahyadri Neurodevelopmental Clinic"
              className="w-full rounded-2xl  bg-surface-2 px-3.5 py-2.5 text-[0.88rem] outline-none placeholder:text-muted"
            />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-[0.8rem] text-muted">Role</span>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={`rounded-full  px-3 py-1.5 text-[0.79rem] ${
                  role === r ? 'border-admin bg-admin-tint text-ink' : 'border-line text-ink-2'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {error ? <Callout tone="alert" title="Not created">{error}</Callout> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="primary"
            disabled={busy || !name.trim() || !email.trim()}
            onClick={save}
          >
            {busy ? 'Creating…' : 'Create the account'}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onDone}>
            Cancel
          </Button>
        </div>

        <p className="text-[0.79rem] leading-relaxed text-muted">
          Creating an account grants nothing. They can sign in and see an empty workspace; every
          record stays invisible to them until a patient chooses to connect.
        </p>
      </CardBody>
    </Card>
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
