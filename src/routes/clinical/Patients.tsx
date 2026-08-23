import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  EvidenceTag,
  FilterChips,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  Table,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import {
  appointments,
  appointmentsFor,
  eventsFor,
  patients,
  personName,
  patientsFor,
  profileFor,
  tasks,
} from '../../data/db'
import { lastContact, whatChanged } from '../../lib/record'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

const FILTERS = ['All', 'Today', 'This week', 'Follow-up required', 'New information', 'Strategy review']

/** 17.1 Patient list. */
export function ClinicalPatients() {
  const { option, role } = useSession()
  const [filter, setFilter] = useState('All')
  const base = option?.home ?? '/psychologist'

  // The caseload, not the platform. This read the whole patient table, so
  // every clinical role opened the same five names — four of them people that
  // clinician has never met and holds no connection to.
  // Every cell read from that patient's own rows. This table used to hard-code
  // one patient's last contact, goal count and "recent change", and hand every
  // other name an em-dash — so four of five rows were fiction and the fifth was
  // somebody else's month.
  const rows = patientsFor(role ?? 'psychologist', option?.personId).map((p) => {
    const next = appointmentsFor(p.id).find((a) => a.status !== 'Completed')
    const seen = lastContact(p.id)
    const changed = whatChanged(p.id)
    return {
      key: p.id,
      to: `${base}/patients/${p.id}`,
      cells: [
        p.name,
        next ? formatDateTime(next.datetime) : '—',
        seen ? formatDate(seen.date) : '—',
        profileFor(p.id).filter((i) => i.section === 'Current goals').length,
        tasks.filter((t) => t.patientId === p.id).length,
        changed[0] ?? 'Nothing recorded recently',
      ],
    }
  })

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={role === 'university' ? 'Students' : 'Patients'}
        description="Everyone who has connected their record to you. Access is per patient, per purpose, and logged."
      />
      <div className="mb-4">
        <FilterChips options={FILTERS} active={filter} onChange={setFilter} />
      </div>
      <Card>
        <Table
          columns={['Patient', 'Next appointment', 'Last contact', 'Active goals', 'Pending tasks', 'Recent change']}
          rows={rows}
        />
      </Card>
    </div>
  )
}

/** Longitudinal timeline for professionals. */
export function ClinicalTimeline() {
  const { option, role } = useSession()
  const [params] = useSearchParams()
  const base = option?.home ?? '/psychologist'
  const [filter, setFilter] = useState('All')
  // It read one hard-coded patient and ignored the ?patient= it was linked
  // with, so every timeline in the app was Ananya's under somebody else's name.
  const mine = patientsFor(role ?? 'psychologist', option?.personId)
  const patientId = params.get('patient') ?? mine[0]?.id
  const subject = mine.find((p) => p.id === patientId)
  const events = eventsFor(patientId ?? '').filter((e) => filter === 'All' || e.category === filter)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Longitudinal timeline"
        description={`${subject?.name ?? 'No record selected'} — every recorded event, with its source and evidence status.`}
        breadcrumbs={[{ label: 'People', to: `${base}/patients` }, { label: 'Timeline' }]}
      />
      <div className="mb-4">
        <FilterChips
          options={['All', 'Functional', 'Clinical', 'Support', 'Work', 'University', 'Stakeholder observations']}
          active={filter}
          onChange={setFilter}
        />
      </div>
      <Card>
        <Table
          columns={['Date', 'Event', 'Category', 'Source', 'Evidence']}
          rows={events.map((e) => ({
            key: e.id,
            cells: [
              formatDate(e.date),
              e.title,
              e.category,
              e.sourceId === 'orca' ? 'ORCA' : personName(e.sourceId),
              <EvidenceTag key="ev" status={e.evidence} />,
            ],
          }))}
        />
      </Card>
    </div>
  )
}

/** Appointment preparation list — psychiatrist / clinic use. */
export function ClinicalAppointments() {
  const { say } = useUI()
  const { option, role } = useSession()
  // Scoped to this clinician's own caseload. It listed every appointment in
  // the system, including patients they hold no connection to.
  const mine = new Set(patientsFor(role ?? 'psychologist', option?.personId).map((p) => p.id))
  const upcoming = appointments.filter((a) => a.status !== 'Completed' && mine.has(a.patientId))

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Appointment preparation"
        description="Briefs are prepared from the record and shared only when the patient approves them."
      />
      <Grid cols={2}>
        {upcoming.map((a) => (
          <Card key={a.id}>
            <CardHead
              title={patients.find((p) => p.id === a.patientId)?.name ?? ''}
              meta={`${formatDateTime(a.datetime)} · ${a.purpose}`}
              action={<StatusPill status={a.status} />}
            />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Location', value: a.location },
                  { label: 'Preparation', value: a.preparationStatus },
                  {
                    label: 'Patient questions',
                    value: a.questions.length ? a.questions.join(' · ') : 'None added yet',
                  },
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => say('Brief prepared from the record. The patient sees it first.')}>
                  Prepare brief
                </Button>
                <Button onClick={() => say('Requested the patient’s approval to share their brief.')}>
                  Request patient brief
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </Grid>

      <div className="mt-8">
        <SectionTitle>Note</SectionTitle>
        <p className="max-w-2xl text-[0.86rem] leading-relaxed text-muted">
          A patient's brief is theirs. You can ask for it, but it arrives only when they have read it
          and approved it — and you will see exactly what they chose to include.
        </p>
      </div>
    </div>
  )
}
