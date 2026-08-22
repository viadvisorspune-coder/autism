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
} from '../../components/ui'
import {
  guidePrompts,
  strategiesFor,
  timeline,
} from '../../data/db'
import { WorkStream } from '../../components/Priority'
import { OrcaSuggests, SinceYouWereHere } from '../../components/Returning'

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
  const recent = timeline.filter((e) => e.patientId === 'pt-ananya').slice(0, 3)

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[1.6rem] font-semibold tracking-[-0.015em] text-ink">Good morning, Ananya</h1>
      <p className="mt-1 text-[0.9rem] text-muted">Wednesday, {formatDate('2026-08-19')}</p>

      {/* Orientation, then urgency, then what is worth doing next — and each
          of the three only appears when it has something to say. */}
      <div className="mt-6">
        <SinceYouWereHere />
        <WorkStream />
      </div>

      {/* ------------------------------------------- primary interaction */}
      <Card>
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

      <div className="mt-8">
        <OrcaSuggests />
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


function FollowUp({ to, text, due }: { to: string; text: string; due: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-4 text-[0.88rem] hover:underline">
      <span className="text-ink">{text}</span>
      <span className="shrink-0 text-[0.78rem] text-muted">{due}</span>
    </Link>
  )
}
