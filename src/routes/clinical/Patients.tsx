import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  EvidenceTag,
  FilterChips,
  Grid,
  LinkButton,
  PageHeader,
  SectionTitle,
  StatusPill,
  Table,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import {
  appointments,
  appointmentsFor,
  documentsFor,
  eventsFor,
  patients,
  personName,
  profileItems,
  requestsFor,
  sessionNotes,
  strategiesFor,
  tasks,
} from '../../data/db'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

const FILTERS = ['All', 'Today', 'This week', 'Follow-up required', 'New information', 'Strategy review']

/** 17.1 Patient list. */
export function ClinicalPatients() {
  const { option, role } = useSession()
  const [filter, setFilter] = useState('All')
  const base = option?.home ?? '/psychologist'

  const rows = patients.map((p) => {
    const next = appointmentsFor(p.id).find((a) => a.status !== 'Completed')
    const openTasks = tasks.filter((t) => t.patientId === p.id).length
    const goals = profileItems.filter((i) => i.section === 'Current goals').length
    return {
      key: p.id,
      to: `${base}/patients/${p.id}`,
      cells: [
        p.name,
        next ? formatDateTime(next.datetime) : '—',
        p.id === 'pt-ananya' ? '28 July 2026' : '—',
        p.id === 'pt-ananya' ? goals : 1,
        openTasks,
        p.id === 'pt-ananya' ? 'Strategy outcome reported 18 Aug' : 'No change since last review',
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

/** 18.1 / 23.2 / 26.2 — patient overview, shaped by the role reading it. */
export function ClinicalPatientOverview() {
  const { patientId } = useParams()
  const { option, role } = useSession()
  const { say } = useUI()
  const patient = patients.find((p) => p.id === patientId)
  const base = option?.home ?? '/psychologist'

  if (!patient) return <p className="text-[0.9rem] text-muted">Patient not found.</p>

  const events = eventsFor(patient.id)
  const strategies = strategiesFor(patient.id)
  const next = appointmentsFor(patient.id).find((a) => a.status !== 'Completed')
  const docs = documentsFor(patient.id)
  const goals = profileItems.filter((p) => p.section === 'Current goals')
  const notes = sessionNotes.filter((n) => n.patientId === patient.id)
  const openRequests = requestsFor(patient.id).filter((r) => r.status !== 'Completed')

  const isPsychiatrist = role === 'psychiatrist'
  const isGP = role === 'gp'

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={patient.name}
        description={`${patient.age} · ${patient.pronouns} · ${patient.context}`}
        breadcrumbs={[
          { label: 'Patients', to: `${base}/patients` },
          { label: patient.name },
        ]}
        actions={
          <>
            <Button onClick={() => say('ORCA summarised this record for your role.')}>Summarise</Button>
            <Button onClick={() => say('Change summary prepared from the last four weeks.')}>
              What&apos;s changed?
            </Button>
            {!isGP ? (
              <LinkButton to={`${base}/session?patient=${patient.id}`} variant="primary">
                Open session workspace
              </LinkButton>
            ) : null}
          </>
        }
      />

      {next ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-5 py-3">
          <span className="text-[0.85rem] text-muted">Next appointment</span>
          <span className="text-[0.88rem] font-medium text-ink">{formatDateTime(next.datetime)}</span>
          <span className="text-[0.85rem] text-ink-2">
            {next.purpose} · with {personName(next.professionalId)}
          </span>
          <span className="ml-auto">
            <StatusPill status={next.status} />
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHead
              title={isGP ? 'Relevant context for this visit' : 'What changed'}
              meta="Since 28 July 2026"
              action={
                <WhyButton
                  title={`${patient.name} — what changed`}
                  bundle={{
                    input: 'Change summary for the current review period.',
                    relevantHistory: events.slice(0, 4).map((e) => `${e.title} (${formatDate(e.date)})`),
                    supporting: ['Check-in 28 July — helped'],
                    conflicting: ['Check-ins 8 and 18 August — did not help'],
                    interpretation:
                      'The advance-notice strategy is effective in proportion to notice given; same-hour changes are uncovered.',
                    uncertainty: 'Three check-ins over four weeks; all patient-reported.',
                    sources: ['Patient check-ins', 'Session note 28 July 2026', 'OT observation 4 August 2026'],
                  }}
                />
              }
            />
            <CardBody>
              <ul className="space-y-3 text-[0.88rem] leading-relaxed text-ink">
                <li>
                  Two strategy check-ins reported no benefit where the schedule change was announced
                  within the same hour.
                </li>
                <li>
                  A workplace accommodation request was submitted on 18 August and is with HR.
                </li>
                <li>An occupational therapy workplace visit took place on 4 August.</li>
              </ul>
              <AiProvenance />
            </CardBody>
          </Card>

          {isPsychiatrist ? (
            <Card>
              <CardHead title="Clinical overview" meta="Prioritised for this role" />
              <CardBody className="space-y-4">
                <DefinitionList
                  items={[
                    { label: 'Diagnosis', value: 'Adult autism assessment completed 19 February 2026 (Dr Arun Deshpande)' },
                    { label: 'Current concerns', value: 'Loss of working time after unplanned schedule changes; sleep raised via ORCA Guide and routed for clinical review.' },
                    { label: 'Patient-reported change', value: 'Three same-hour schedule changes this month.' },
                    { label: 'Functional context', value: 'Open-plan workplace, walkway-adjacent desk (OT, 4 August 2026).' },
                    { label: 'Professional observations', value: 'Psychology session 28 July 2026; OT observation 4 August 2026.' },
                    { label: 'Treatment information', value: 'Within your authorisation. No changes recorded since February 2026.' },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}

          {isGP ? (
            <Card>
              <CardHead title="Relevant health summary" meta="Short by design" />
              <CardBody>
                <DefinitionList
                  items={[
                    { label: 'Reason for visit', value: 'Fatigue and sleep, raised by the patient.' },
                    { label: 'Relevant history', value: 'Adult autism diagnosis, February 2026. OT input for workplace environment.' },
                    { label: 'Current concerns', value: 'Working late to catch up after unplanned schedule changes.' },
                    { label: 'Professional context', value: 'Psychology and OT actively involved; psychiatry review due 9 September.' },
                    { label: 'Recent changes', value: 'Workplace accommodation request submitted 18 August.' },
                    { label: 'Follow-up', value: 'Coordinate with the clinic if sleep persists past the September review.' },
                  ]}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead
              title="Current support"
              action={<LinkButton to={`${base}/strategies`}>All strategies</LinkButton>}
            />
            <CardBody>
              <ul className="space-y-3">
                {strategies
                  .filter((s) => s.status !== 'Completed')
                  .map((s) => (
                    <li key={s.id} className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`${base}/strategies/${s.id}`}
                          className="text-[0.89rem] font-medium text-ink hover:underline"
                        >
                          {s.title}
                        </Link>
                        <p className="text-[0.82rem] text-muted">
                          {s.checkIns.length} check-ins · review {formatDate(s.reviewDate)} · owner{' '}
                          {personName(s.ownerId)}
                        </p>
                      </div>
                      <StatusPill status={s.status} />
                    </li>
                  ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Relevant longitudinal context" />
            <CardBody>
              <ul className="space-y-3">
                {events.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.88rem] text-ink">{e.title}</p>
                      <p className="text-[0.79rem] text-muted">
                        {formatDate(e.date)} · {e.category} · {e.sourceId === 'orca' ? 'ORCA' : personName(e.sourceId)}
                      </p>
                    </div>
                    <EvidenceTag status={e.evidence} />
                  </li>
                ))}
              </ul>
              <LinkButton to={`${base}/timeline?patient=${patient.id}`} className="mt-4">
                Full timeline
              </LinkButton>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHead title="Current goals" />
            <CardBody>
              <ul className="space-y-2 text-[0.87rem] leading-relaxed text-ink">
                {goals.map((g) => (
                  <li key={g.id}>{g.text}</li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Outcome history" />
            <CardBody>
              <ul className="space-y-3">
                {strategies
                  .filter((s) => s.outcome)
                  .map((s) => (
                    <li key={s.id}>
                      <p className="text-[0.87rem] font-medium text-ink">{s.title}</p>
                      <p className="text-[0.82rem] leading-relaxed text-ink-2">
                        {s.outcome?.effectiveness} — {s.outcome?.summary}
                      </p>
                    </li>
                  ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent professional input" />
            <CardBody>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="text-[0.86rem]">
                    <span className="text-ink">{personName(n.professionalId)}</span>
                    <span className="block text-[0.79rem] text-muted">
                      {formatDate(n.date)} · session note ({n.status})
                    </span>
                  </li>
                ))}
                <li className="text-[0.86rem]">
                  <span className="text-ink">Sana Kulkarni</span>
                  <span className="block text-[0.79rem] text-muted">
                    4 August 2026 · environment observation
                  </span>
                </li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Documents" />
            <CardBody>
              <ul className="space-y-2">
                {docs
                  .filter((d) => d.access.includes(role ?? 'psychologist'))
                  .map((d) => (
                    <li key={d.id} className="text-[0.86rem] text-ink">
                      {d.title}
                      <span className="block text-[0.79rem] text-muted">
                        {d.category} · {formatDate(d.date)}
                      </span>
                    </li>
                  ))}
              </ul>
            </CardBody>
          </Card>

          {openRequests.length ? (
            <Card>
              <CardHead title="Open requests" />
              <CardBody>
                <ul className="space-y-2">
                  {openRequests.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-[0.86rem]">
                      <span className="text-ink">{r.title}</span>
                      <StatusPill status={r.status} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Longitudinal timeline for professionals. */
export function ClinicalTimeline() {
  const { option } = useSession()
  const base = option?.home ?? '/psychologist'
  const [filter, setFilter] = useState('All')
  const events = eventsFor('pt-ananya').filter((e) => filter === 'All' || e.category === filter)

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Longitudinal timeline"
        description="Ananya Rao — every recorded event, with its source and evidence status."
        breadcrumbs={[{ label: 'Patients', to: `${base}/patients` }, { label: 'Timeline' }]}
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
  const upcoming = appointments.filter((a) => a.status !== 'Completed')

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
