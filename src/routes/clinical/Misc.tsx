import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  FilterChips,
  Grid,
  PageHeader,
  StatusPill,
  Table,
  Tag,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { useState } from 'react'
import {
  appointments,
  connections,
  documents,
  patientName,
  patients,
  people,
  personName,
  requests,
  tasks,
} from '../../data/db'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

/** Tasks / follow-ups. */
export function ClinicalTasks() {
  const { role } = useSession()
  const [filter, setFilter] = useState('All')
  const mine = tasks.filter((t) => t.forRoles.includes(role ?? 'psychologist'))
  const shown = filter === 'All' ? mine : mine.filter((t) => t.status === filter)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Tasks and follow-ups"
        description="Work that is yours, and work that is waiting on somebody else."
      />
      <div className="mb-4">
        <FilterChips
          options={['All', 'Draft', 'In progress', 'Active', 'Awaiting information']}
          active={filter}
          onChange={setFilter}
        />
      </div>
      <Card>
        <Table
          columns={['Task', 'Patient', 'Due', 'Status', 'Detail']}
          rows={shown.map((t) => ({
            key: t.id,
            cells: [
              t.title,
              t.patientId ? patientName(t.patientId) : '—',
              formatDate(t.due),
              <StatusPill key="s" status={t.status} />,
              t.detail,
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Permissions — what this professional may see, and who granted it. */
export function ClinicalPermissions() {
  const { option, personName: me } = useSession()
  const mine = connections.filter((c) => c.personId === option?.personId)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Permissions"
        description={`What ${me} is permitted to see, granted by each patient, for a stated purpose and period.`}
      />
      <div className="space-y-4">
        {mine.map((c) => (
          <Card key={c.id}>
            <CardHead
              title={patientName(c.patientId)}
              meta={c.relationship}
              action={<Tag>{c.consentStatus}</Tag>}
            />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Purpose', value: c.purpose },
                  { label: 'Scope', value: c.accessScope.join(', ') },
                  { label: 'Granted', value: formatDate(c.consentGiven) },
                  { label: 'Review due', value: formatDate(c.reviewDue) },
                ]}
              />
            </CardBody>
          </Card>
        ))}
        {mine.length === 0 ? (
          <p className="text-[0.88rem] text-muted">
            No patients have granted you access in this prototype dataset.
          </p>
        ) : null}
      </div>
      <p className="mt-6 max-w-2xl text-[0.84rem] leading-relaxed text-muted">
        Permissions are decided by the backend, not by ORCA's reasoning. If a record is outside your
        scope it does not appear in search, in summaries, or in anything ORCA writes for you.
      </p>
    </div>
  )
}

/** Documents visible to this role. */
export function ClinicalDocuments() {
  const { role } = useSession()
  const visible = documents.filter((d) => d.access.includes(role ?? 'psychologist'))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Documents"
        description="Only documents inside your authorised scope are listed."
      />
      <Card>
        <Table
          columns={['Document', 'Patient', 'Category', 'Source', 'Date', 'Status']}
          rows={visible.map((d) => ({
            key: d.id,
            cells: [
              d.title,
              patientName(d.patientId),
              d.category,
              personName(d.sourceId),
              formatDate(d.date),
              d.status,
            ],
          }))}
        />
      </Card>
      {visible.length === 0 ? (
        <p className="mt-4 text-[0.88rem] text-muted">
          Nothing in your scope. Documents outside it are not listed at all.
        </p>
      ) : null}
    </div>
  )
}

/** Care coordination — shared by psychiatrist and clinic. */
export function CareCoordination() {
  const { say } = useUI()
  const open = requests.filter((r) => r.status !== 'Completed')

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Care coordination"
        description="Who is involved with each patient, what is in flight, and what is waiting on someone outside the clinic."
      />

      <Grid cols={2}>
        {patients.slice(0, 2).map((p) => (
          <Card key={p.id}>
            <CardHead title={p.name} meta={p.context} />
            <CardBody>
              <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                Care team
              </h3>
              <ul className="mb-3 space-y-1 text-[0.85rem] text-ink">
                {people
                  .filter((person) => ['psychologist', 'psychiatrist', 'ot', 'gp'].includes(person.role))
                  .map((person) => (
                    <li key={person.id}>
                      {person.name} <span className="text-muted">— {person.title}</span>
                    </li>
                  ))}
              </ul>
              <h3 className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                In flight
              </h3>
              <ul className="space-y-1.5">
                {open
                  .filter((r) => r.patientId === p.id)
                  .map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-[0.85rem]">
                      <span className="text-ink">{r.title}</span>
                      <StatusPill status={r.status} />
                    </li>
                  ))}
                {open.filter((r) => r.patientId === p.id).length === 0 ? (
                  <li className="text-[0.85rem] text-muted">Nothing outstanding.</li>
                ) : null}
              </ul>
              <Button className="mt-4" onClick={() => say('Coordination note added to the record.')}>
                Add coordination note
              </Button>
            </CardBody>
          </Card>
        ))}
      </Grid>
    </div>
  )
}

/** Referrals — GP and clinic. */
export function Referrals() {
  const { say } = useUI()
  const referrals = requests.filter((r) => r.type === 'Referral' || r.type === 'Report')

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Referrals"
        description="Referrals made through ORCA, with the reason and the information that travelled with them."
        actions={<Button variant="primary" onClick={() => say('New referral drafted.')}>New referral</Button>}
      />
      <div className="space-y-4">
        {referrals.map((r) => (
          <Card key={r.id}>
            <CardHead
              title={r.title}
              meta={`${patientName(r.patientId)} · ${r.destination} · raised ${formatDate(r.raised)}`}
              action={<StatusPill status={r.status} />}
            />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Reason', value: r.functionalRequirement },
                  { label: 'Information shared', value: r.authorisedInformation.join(' · ') },
                  { label: 'Currently with', value: r.currentOwner },
                ]}
              />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** GP care team view. */
export function CareTeamView() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Care team"
        description="Who else is involved, so that coordination does not depend on the patient repeating themselves."
      />
      <Grid cols={2}>
        {people
          .filter((p) => ['psychologist', 'psychiatrist', 'therapist', 'ot', 'clinic'].includes(p.role))
          .map((p) => (
            <Card key={p.id}>
              <CardHead title={p.name} meta={p.title} />
              <CardBody>
                <DefinitionList
                  items={[
                    { label: 'Organisation', value: p.organisation ?? '—' },
                    {
                      label: 'Involvement',
                      value:
                        p.role === 'ot'
                          ? 'Workplace environment and adaptations'
                          : p.role === 'psychiatrist'
                            ? 'Diagnosis and periodic review'
                            : p.role === 'psychologist'
                              ? 'Ongoing post-diagnostic support'
                              : 'Coordination',
                    },
                  ]}
                />
              </CardBody>
            </Card>
          ))}
      </Grid>
    </div>
  )
}

/** Clinic appointments list. */
export function ClinicAppointments() {
  return (
    <div className="max-w-6xl">
      <PageHeader title="Appointments" description="Everything scheduled across the clinic." />
      <Card>
        <Table
          columns={['Patient', 'Professional', 'When', 'Purpose', 'Location', 'Status']}
          rows={appointments.map((a) => ({
            key: a.id,
            cells: [
              patientName(a.patientId),
              personName(a.professionalId),
              formatDateTime(a.datetime),
              a.purpose,
              a.location,
              <StatusPill key="s" status={a.status} />,
            ],
          }))}
        />
      </Card>
    </div>
  )
}
