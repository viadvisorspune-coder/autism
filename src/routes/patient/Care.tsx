import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  Grid,
  LinkButton,
  PageHeader,
  SectionTitle,
  StatusPill,
  Tag,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import {
  appointments,
  appointmentsFor,
  connections,
  documentsFor,
  people,
  personName,
  profileItems,
} from '../../data/db'
import { useUI } from '../../state/ui'

/** 8.1 My care dashboard. */
export function PatientCare() {
  const upcoming = appointmentsFor('pt-ananya').filter((a) => a.status !== 'Completed')
  const past = appointmentsFor('pt-ananya').filter((a) => a.status === 'Completed')
  const team = connections.filter((c) =>
    ['psychologist', 'psychiatrist', 'ot', 'gp', 'therapist'].includes(
      people.find((p) => p.id === c.personId)?.role ?? '',
    ),
  )
  const goals = profileItems.filter((p) => p.section === 'Current goals')

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My care"
        description="Who is involved, what is coming up, and what you want to get out of it."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'My care' }]}
      />

      <Grid cols={2}>
        <Card>
          <CardHead
            title="Care team"
            meta={`${team.length} people currently connected`}
            action={<LinkButton to="/patient/care/team">Open</LinkButton>}
          />
          <CardBody>
            <ul className="space-y-2">
              {team.map((c) => (
                <li key={c.id} className="text-[0.87rem] text-ink">
                  {personName(c.personId)}
                  <span className="block text-[0.78rem] text-muted">{c.relationship}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Upcoming appointments" />
          <CardBody>
            <ul className="space-y-3">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/patient/care/appointments/${a.id}`}
                    className="block hover:underline"
                  >
                    <span className="text-[0.88rem] font-medium text-ink">
                      {personName(a.professionalId)}
                    </span>
                    <span className="block text-[0.8rem] text-muted">
                      {formatDateTime(a.datetime)} · {a.purpose}
                    </span>
                  </Link>
                  <span className="mt-1 inline-block">
                    <Tag>Preparation: {a.preparationStatus}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recent appointments" />
          <CardBody>
            <ul className="space-y-2">
              {past.map((a) => (
                <li key={a.id} className="text-[0.87rem]">
                  <Link to={`/patient/care/appointments/${a.id}`} className="text-ink hover:underline">
                    {personName(a.professionalId)} — {a.purpose}
                  </Link>
                  <span className="block text-[0.78rem] text-muted">{formatDateTime(a.datetime)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Current goals" action={<LinkButton to="/patient/profile">Edit</LinkButton>} />
          <CardBody>
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g.id} className="text-[0.87rem] leading-relaxed text-ink">
                  {g.text}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-8">
        <SectionTitle>Pending follow-ups</SectionTitle>
        <Card>
          <CardBody>
            <ul className="space-y-2 text-[0.87rem] text-ink">
              <li>Strategy review with Dr Kavita Nair — 25 August</li>
              <li>Quiet-room booking process to be confirmed by Sana Kulkarni</li>
              <li>Medication question routed to Dr Arun Deshpande for the September review</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/** 8.2 Care team. */
export function PatientCareTeam() {
  const team = connections.filter((c) =>
    ['psychologist', 'psychiatrist', 'ot', 'gp', 'therapist', 'clinic'].includes(
      people.find((p) => p.id === c.personId)?.role ?? '',
    ),
  )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Care team"
        description="Everyone with clinical access, what they can see, and when you last saw them."
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'My care', to: '/patient/care' },
          { label: 'Care team' },
        ]}
      />
      <Grid cols={2}>
        {team.map((c) => {
          const person = people.find((p) => p.id === c.personId)
          return (
            <Card key={c.id}>
              <CardHead title={person?.name ?? ''} meta={person?.title} />
              <CardBody>
                <DefinitionList
                  items={[
                    { label: 'Organisation', value: person?.organisation ?? '—' },
                    { label: 'Access scope', value: c.accessScope.join(', ') },
                    { label: 'Last interaction', value: formatDate(c.lastInteraction) },
                    {
                      label: 'Permission',
                      value: `${c.consentStatus} · review due ${formatDate(c.reviewDue)}`,
                    },
                  ]}
                />
                <LinkButton to={`/patient/connections/${c.id}`} className="mt-4">
                  Manage access
                </LinkButton>
              </CardBody>
            </Card>
          )
        })}
      </Grid>
    </div>
  )
}

/** 8.3 Appointment detail. */
export function PatientAppointment() {
  const { appointmentId } = useParams()
  const { say } = useUI()
  const appointment = appointments.find((a) => a.id === appointmentId)
  const [questions, setQuestions] = useState(appointment?.questions ?? [])
  const [draft, setDraft] = useState('')

  if (!appointment) return <p className="text-[0.9rem] text-muted">Appointment not found.</p>

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Appointment with ${personName(appointment.professionalId)}`}
        description={appointment.purpose}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'My care', to: '/patient/care' },
          { label: 'Appointment' },
        ]}
        actions={<StatusPill status={appointment.status} />}
      />

      <Card className="mb-6">
        <CardBody>
          <DefinitionList
            items={[
              { label: 'Date and time', value: formatDateTime(appointment.datetime) },
              { label: 'Professional', value: personName(appointment.professionalId) },
              { label: 'Purpose', value: appointment.purpose },
              { label: 'Location', value: appointment.location },
              { label: 'Preparation', value: appointment.preparationStatus },
              {
                label: 'Previous summary',
                value:
                  appointment.status === 'Completed'
                    ? 'Workplace visit summary, shared 6 August 2026'
                    : 'Session note from 28 July 2026',
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHead title="Questions I want to ask" meta="Only shared if you include them in the brief" />
        <CardBody>
          <ul className="mb-4 space-y-2">
            {questions.map((q) => (
              <li key={q} className="text-[0.88rem] leading-relaxed text-ink">
                {q}
              </li>
            ))}
            {questions.length === 0 ? (
              <li className="text-[0.85rem] text-muted">No questions added yet.</li>
            ) : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a question"
              className="min-w-0 flex-1 rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] outline-none"
            />
            <Button
              onClick={() => {
                if (!draft.trim()) return
                setQuestions([...questions, draft.trim()])
                setDraft('')
                say('Question added.')
              }}
            >
              Add
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton to={`/patient/care/appointments/${appointment.id}/prepare`} variant="primary">
          Prepare with ORCA
        </LinkButton>
        <Button onClick={() => say('Opened the previous summary.')}>View previous summary</Button>
      </div>
    </div>
  )
}

/** 8.4 Appointment preparation — draft, edit, approve, then share. */
export function PatientAppointmentPrep() {
  const { appointmentId } = useParams()
  const { say } = useUI()
  const appointment = appointments.find((a) => a.id === appointmentId)
  const [stage, setStage] = useState<'draft' | 'approved' | 'shared'>('draft')
  const [editing, setEditing] = useState(false)
  const docs = documentsFor('pt-ananya').filter((d) => d.category !== 'Employment')

  const [brief, setBrief] = useState({
    changed:
      'Three meetings moved with under thirty minutes’ notice this month. Two check-ins on the advance-notice strategy reported no benefit when the change came within the hour.',
    concerns:
      'Working late to catch up after unplanned changes, and whether the current strategy should continue.',
    history:
      'Similar difficulty in June at work and in May at university. A written summary made the May change manageable.',
    outcomes:
      'Advance notice: partly helped — effective with several hours’ notice, not effective within the hour. Quiet workspace: two check-ins, one helped, one partly helped.',
  })

  if (!appointment) return <p className="text-[0.9rem] text-muted">Appointment not found.</p>

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Prepare for your appointment"
        description={`With ${personName(appointment.professionalId)} on ${formatDateTime(appointment.datetime)}. ORCA has drafted this from your record. Nothing is sent until you approve it.`}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'My care', to: '/patient/care' },
          { label: 'Prepare' },
        ]}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {['Draft', 'Your review', 'Approved', 'Shared'].map((step, i) => {
          const index = stage === 'draft' ? 1 : stage === 'approved' ? 2 : 3
          return (
            <span
              key={step}
              className={`rounded-full  px-3 py-1 text-[0.78rem] ${
                i <= index ? 'border-brand bg-brand-tint text-brand-ink' : 'border-line text-muted'
              }`}
            >
              {step}
            </span>
          )
        })}
      </div>

      <Card className="mb-6">
        <CardHead
          title="Draft brief"
          meta="Prepared by ORCA · visible only to you until you approve it"
          action={
            <WhyButton
              title="Appointment brief"
              bundle={{
                input: 'Preparing for the review session on 25 August 2026.',
                relevantHistory: [
                  'Session with Dr Kavita Nair, 28 July 2026',
                  'Advance-notice strategy started, 21 July 2026',
                  'Unplanned handover meeting, 16 June 2026',
                ],
                supporting: ['Check-in 28 July — helped', 'University brief change handled well in May'],
                conflicting: ['Check-in 8 August — did not help', 'Check-in 18 August — did not help'],
                interpretation:
                  'The strategy works in proportion to notice given. Same-hour changes are not covered by any current strategy.',
                uncertainty: 'Two unsuccessful check-ins is a small sample over three weeks.',
                sources: ['Your check-ins', 'Session note 28 July 2026', 'OT observation 4 August 2026'],
              }}
            />
          }
        />
        <CardBody className="space-y-5">
          {(
            [
              ['What changed', 'changed'],
              ['Current concerns', 'concerns'],
              ['Relevant history', 'history'],
              ['Previous strategies and outcomes', 'outcomes'],
            ] as const
          ).map(([label, key]) => (
            <div key={key}>
              <h3 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
                {label}
              </h3>
              {editing ? (
                <textarea
                  rows={3}
                  value={brief[key]}
                  onChange={(e) => setBrief({ ...brief, [key]: e.target.value })}
                  className="w-full rounded-2xl  border-line-strong px-3 py-2 text-[0.87rem] outline-none"
                />
              ) : (
                <p className="text-[0.89rem] leading-relaxed text-ink">{brief[key]}</p>
              )}
            </div>
          ))}

          <div>
            <h3 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Questions
            </h3>
            <ul className="space-y-1">
              {appointment.questions.map((q) => (
                <li key={q} className="text-[0.89rem] text-ink">
                  {q}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              Documents included
            </h3>
            <ul className="space-y-1">
              {docs.slice(0, 2).map((d) => (
                <li key={d.id} className="text-[0.89rem] text-ink">
                  {d.title} <span className="text-muted">({formatDate(d.date)})</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[20px] bg-canvas px-4 py-3">
            <p className="text-[0.83rem] leading-relaxed text-ink-2">
              Not included: your journal entries, anything ORCA has not yet checked with you, and
              anything outside this appointment's purpose.
            </p>
          </div>

          <AiProvenance />
        </CardBody>
      </Card>

      {stage === 'shared' ? (
        <div className="rounded-[20px]  bg-state-good-tint px-4 py-3 text-[0.87rem] text-state-good">
          Shared with {personName(appointment.professionalId)} for this appointment only. The
          disclosure is recorded in your sharing history.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(!editing)}>{editing ? 'Save edits' : 'Edit'}</Button>
          {stage === 'draft' ? (
            <Button
              variant="primary"
              onClick={() => {
                setStage('approved')
                say('Approved. It is still not shared — you choose when to send it.')
              }}
            >
              Approve
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                setStage('shared')
                say('Shared with Dr Kavita Nair for this appointment.')
              }}
            >
              Share with {personName(appointment.professionalId)}
            </Button>
          )}
          <Link
            to={`/patient/care/appointments/${appointment.id}`}
            className="rounded-2xl  border-line-strong px-3.5 py-2 text-[0.85rem] text-ink hover:bg-surface-2"
          >
            Back to appointment
          </Link>
        </div>
      )}
    </div>
  )
}
