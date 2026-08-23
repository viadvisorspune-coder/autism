import { Link, useNavigate } from 'react-router-dom'
import {
  Card,
  CardBody,
  CardHead,
  Grid,
  LinkButton,
  Section,
  StatusPill,
  formatDate,
} from '../../components/ui'
import { TODAY, guidePrompts, strategiesFor, timeline } from '../../data/db'
import { WorkStream } from '../../components/Priority'
import { DecidedWithoutAsking, OrcaSuggests, SinceYouWereHere } from '../../components/Returning'
import { GettingStarted } from '../../components/GettingStarted'
import { WhatOrcaRemembers } from '../../components/Remembers'
import { Shortcuts } from '../../components/Shortcuts'
import { useDraft } from '../../lib/draft'
import { followUps } from '../../lib/record'
import { useRecordId } from '../../state/record'
import { useSession } from '../../state/session'

/**
 * 3.1 Patient home.
 *
 * Three questions, in this order: is anything waiting on me, what do I want to
 * say, and what is going on underneath. Everything belonging to the third
 * question is folded away with a line saying what is inside it.
 *
 * This screen used to stack eleven blocks unconditionally — orientation,
 * priorities, shortcuts, a composer, four tiles, three "here is what ORCA
 * noticed" panels, current activity, and a hard-coded follow-up list — every
 * one of them open, every time. For someone whose difficulty is filtering, a
 * page that shows everything it has is not generous, it is loud. Depth is
 * fine; depth that arrives all at once is not.
 */
export default function PatientHome() {
  const patientId = useRecordId()
  // Their name, not the demo patient's. A greeting is the first thing on the
  // screen and the fastest way to tell somebody this is not their account.
  const { personName } = useSession()
  const first = personName.split(' ')[0]
  const navigate = useNavigate()
  // The home composer keeps what was typed. Someone interrupted halfway
  // through describing a bad week should not have to find the words twice.
  const { value: message, setValue: setMessage, clear: clearMessage } = useDraft('home.compose')

  const strategies = strategiesFor(patientId)
  const active = strategies.find((s) => s.status === 'Active')
  const recent = timeline.filter((e) => e.patientId === patientId).slice(0, 3)
  const waiting = followUps(patientId)

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[1.6rem] font-semibold tracking-[-0.015em] text-ink">
        {greeting()}
        {first ? `, ${first}` : ''}
      </h1>
      <p className="mt-1 text-[0.9rem] text-muted">{formatDate(TODAY)}</p>

      {/* ------------------------------------------------ 1. anything waiting */}
      {/* Each of these draws nothing when it has nothing, so a quiet week is a
          short page rather than a page full of reassurances. */}
      <div className="mt-6">
        <SinceYouWereHere />
        <WorkStream />
      </div>

      {waiting.length ? (
        <Card className="mb-6">
          <CardHead title="Waiting on you" meta={`${waiting.length} ${waiting.length === 1 ? 'thing' : 'things'}`} />
          <CardBody className="space-y-3">
            {waiting.map((f) => (
              <Link
                key={f.to + f.text}
                to={f.to}
                className="flex items-center justify-between gap-4 text-[0.88rem] hover:underline"
              >
                <span className="text-ink">{f.text}</span>
                <span className="shrink-0 text-[0.78rem] text-muted">{f.due}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------------------------------- 2. the main thing */}
      <Card>
        <CardBody>
          <label htmlFor="guide-input" className="block text-[1.05rem] font-medium text-ink">
            Talk to ORCA
          </label>
          <p className="mt-0.5 text-[0.86rem] text-ink-2">What do you need help with today?</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              clearMessage()
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
              className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="rounded-2xl bg-brand px-4 py-2 text-[0.88rem] font-medium text-white hover:bg-brand-ink"
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
                className="rounded-full border-line px-3 py-1.5 text-[0.82rem] text-ink-2 hover:text-ink"
              >
                {prompt}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* --------------------------------------------- 3. the four workflows */}
      {/* Under the conversation rather than above it, because the sentence
          somebody arrives wanting to type is the fastest route to any of these.
          They are here for the days when the words do not come. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Workflow
          to="/patient/story"
          title="Tell ORCA something"
          detail="A hard day, something that helped, anything worth keeping."
        />
        <Workflow
          to="/patient/support"
          title="Get support"
          detail="Try something new, or add how the current one is going."
        />
        <Workflow
          to="/patient/work"
          title="Prepare or share"
          detail="Ask for an adjustment, or get ready for an appointment."
        />
        <Workflow
          to="/patient/progress"
          title="Review progress"
          detail="What has changed, and whether any of it is working."
        />
      </div>

      {/* ------------------------------------------------- 4. folded away */}
      <div className="mt-8">
        <Section
          title="What I am working on"
          count={(active ? 1 : 0) + recent.length}
          summary={
            active
              ? `Currently trying ${active.title.toLowerCase()}. ${recent.length} recent ${recent.length === 1 ? 'change' : 'changes'}.`
              : recent.length
                ? `${recent.length} recent ${recent.length === 1 ? 'change' : 'changes'}, nothing being trialled.`
                : 'Nothing recorded yet.'
          }
        >
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
                {recent.length ? (
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
                ) : (
                  <p className="text-[0.85rem] text-muted">Nothing on your record yet.</p>
                )}
                <LinkButton to="/patient/story" className="mt-4">
                  Open my story
                </LinkButton>
              </CardBody>
            </Card>
          </Grid>
        </Section>

        <Section
          title="What ORCA has noticed"
          summary="Suggestions, what it is holding on to, and anything it decided without asking."
        >
          <OrcaSuggests />
          <WhatOrcaRemembers />
          <DecidedWithoutAsking />
        </Section>

        <Section title="Finding your way around" summary="Shortcuts, and what is still worth setting up.">
          <Shortcuts />
          <GettingStarted />
        </Section>
      </div>
    </div>
  )
}

/** Morning, afternoon or evening — read off the clock, not assumed. */
function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * One of the four things somebody actually comes here to do.
 *
 * Named as verbs, because "My Support" is a filing cabinet and "Get support"
 * is a thing you can decide to do. Quiet by design — the conversation above is
 * the primary route, and these must not compete with it.
 */
function Workflow({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link to={to} className="rounded-[20px] bg-surface px-4 py-3.5 shadow-sm hover:bg-brand-tint">
      <span className="block text-[0.94rem] font-semibold text-ink">{title}</span>
      <span className="mt-0.5 block text-[0.83rem] leading-relaxed text-ink-2">{detail}</span>
    </Link>
  )
}
