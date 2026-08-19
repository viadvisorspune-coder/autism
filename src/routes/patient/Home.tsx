import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Card,
  CardBody,
  CardHead,
  Grid,
  LinkButton,
  SectionTitle,
  StatusPill,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import {
  appointmentsFor,
  guidePrompts,
  memoryCandidates,
  personName,
  requestsFor,
  strategiesFor,
  timeline,
} from '../../data/db'

/**
 * 3.1 Patient dashboard.
 *
 * Answers three questions and nothing else: what is happening in my life right
 * now, what needs my attention, and what can ORCA help me with.
 */
export default function PatientHome() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')

  const strategies = strategiesFor('pt-ananya')
  const active = strategies.find((s) => s.status === 'Active')
  const appointment = appointmentsFor('pt-ananya').find((a) => a.status !== 'Completed')
  const requests = requestsFor('pt-ananya')
  const pending = requests.find((r) => r.status === 'Awaiting stakeholder')
  const awaitingYou = requests.find((r) => r.status === 'Awaiting approval')
  const memory = memoryCandidates.find((m) => m.patientId === 'pt-ananya')
  const recent = timeline.filter((e) => e.patientId === 'pt-ananya').slice(0, 3)

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[1.6rem] font-semibold tracking-[-0.015em] text-ink">Good morning, Ananya</h1>
      <p className="mt-1 text-[0.9rem] text-muted">Wednesday, {formatDate('2026-08-19')}</p>

      {/* ------------------------------------------- primary interaction */}
      <Card className="mt-6">
        <CardBody>
          <label htmlFor="guide-input" className="block text-[1.05rem] font-medium text-ink">
            What do you need help with today?
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              navigate('/patient/guide', { state: { message } })
            }}
            className="mt-3"
          >
            <textarea
              id="guide-input"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="You can write it however it comes out. There is no right way to say it."
              className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="rounded-lg bg-brand px-4 py-2 text-[0.88rem] font-medium text-white hover:bg-brand-ink"
              >
                Talk to ORCA
              </button>
              <span className="text-[0.8rem] text-muted">
                Nothing you write here is shared with anyone.
              </span>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {guidePrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => navigate('/patient/guide', { state: { message: prompt } })}
                className="rounded-full border border-line px-3 py-1.5 text-[0.82rem] text-ink-2 hover:border-line-strong hover:text-ink"
              >
                {prompt}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------- needs your attention */}
      <div className="mt-8">
        <SectionTitle>Needs your attention</SectionTitle>
        <div className="space-y-3">
          {pending?.clarifications.length ? (
            <AttentionRow
              to={`/patient/requests/${pending.id}`}
              title="Your employer has asked a question about your request"
              detail="ORCA has drafted an answer. Nothing is sent until you approve it."
              status="Awaiting approval"
            />
          ) : null}
          {memory ? (
            <AttentionRow
              to="/patient/profile"
              title="ORCA wants to remember something about advance notice"
              detail="Confirm, edit or decline. It stays out of your record until you decide."
              status="Awaiting approval"
            />
          ) : null}
          {appointment ? (
            <AttentionRow
              to={`/patient/care/appointments/${appointment.id}/prepare`}
              title={`Appointment brief for ${formatDate(appointment.datetime.split('T')[0])} is ready`}
              detail={`It will be shared with ${personName(appointment.professionalId)} only after you approve it.`}
              status="Awaiting approval"
            />
          ) : null}
          {awaitingYou ? (
            <AttentionRow
              to={`/patient/requests/${awaitingYou.id}`}
              title={awaitingYou.title}
              detail="Review what would be shared before it goes anywhere."
              status={awaitingYou.status}
            />
          ) : null}
        </div>
      </div>

      {/* ---------------------------------------------- current activity */}
      <div className="mt-8">
        <SectionTitle>Happening now</SectionTitle>
        <Grid cols={2}>
          {active ? (
            <Card>
              <CardHead title="Active support strategy" action={<StatusPill status={active.status} />} />
              <CardBody>
                <p className="text-[0.92rem] font-medium text-ink">{active.title}</p>
                <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-2">{active.goal}</p>
                <p className="mt-3 text-[0.8rem] text-muted">
                  Started {formatDate(active.start)} · review {formatDate(active.reviewDate)}
                </p>
                <LinkButton to={`/patient/support/${active.id}`} className="mt-3">
                  Open strategy
                </LinkButton>
              </CardBody>
            </Card>
          ) : null}

          {appointment ? (
            <Card>
              <CardHead title="Upcoming appointment" action={<StatusPill status={appointment.status} />} />
              <CardBody>
                <p className="text-[0.92rem] font-medium text-ink">
                  {personName(appointment.professionalId)}
                </p>
                <p className="mt-1 text-[0.84rem] text-ink-2">{appointment.purpose}</p>
                <p className="mt-3 text-[0.8rem] text-muted">
                  {formatDateTime(appointment.datetime)} · {appointment.location}
                </p>
                <LinkButton to={`/patient/care/appointments/${appointment.id}`} className="mt-3">
                  Open appointment
                </LinkButton>
              </CardBody>
            </Card>
          ) : null}

          {pending ? (
            <Card>
              <CardHead title="Pending request" action={<StatusPill status={pending.status} />} />
              <CardBody>
                <p className="text-[0.92rem] font-medium text-ink">{pending.title}</p>
                <p className="mt-1 text-[0.84rem] text-ink-2">With {pending.currentOwner}</p>
                <p className="mt-3 text-[0.8rem] text-muted">Sent {formatDate(pending.raised)}</p>
                <LinkButton to={`/patient/requests/${pending.id}`} className="mt-3">
                  Track request
                </LinkButton>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Recent changes" meta="Only changes that matter" />
            <CardBody>
              <ul className="space-y-3">
                {recent.map((event) => (
                  <li key={event.id}>
                    <Link
                      to={`/patient/story/${event.id}`}
                      className="text-[0.88rem] font-medium text-ink hover:underline"
                    >
                      {event.title}
                    </Link>
                    <p className="text-[0.78rem] text-muted">
                      {formatDate(event.date)} · {event.category}
                    </p>
                  </li>
                ))}
              </ul>
              <LinkButton to="/patient/story" className="mt-4">
                Open my story
              </LinkButton>
            </CardBody>
          </Card>
        </Grid>
      </div>

      {/* --------------------------------------------------- follow-ups */}
      <div className="mt-8">
        <SectionTitle>Follow-ups</SectionTitle>
        <Card>
          <CardBody className="space-y-3">
            <FollowUp
              to="/patient/support/st-2"
              text="Add how the quiet-room trial went last week"
              due="Due 22 August"
            />
            <FollowUp
              to="/patient/care/appointments/ap-1"
              text="Add any questions for your session on 25 August"
              due="Before 25 August"
            />
            <FollowUp
              to="/patient/privacy"
              text="Six-month review of who can see your information"
              due="Due 20 October"
            />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function AttentionRow({
  to,
  title,
  detail,
  status,
}: {
  to: string
  title: string
  detail: string
  status: Parameters<typeof StatusPill>[0]['status']
}) {
  return (
    <Link
      to={to}
      className="flex items-start justify-between gap-4 rounded-[10px] border border-line bg-surface px-5 py-4 hover:border-line-strong"
    >
      <span>
        <span className="block text-[0.92rem] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[0.84rem] leading-relaxed text-ink-2">{detail}</span>
      </span>
      <StatusPill status={status} />
    </Link>
  )
}

function FollowUp({ to, text, due }: { to: string; text: string; due: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-4 text-[0.88rem] hover:underline">
      <span className="text-ink">{text}</span>
      <span className="shrink-0 text-[0.78rem] text-muted">{due}</span>
    </Link>
  )
}
