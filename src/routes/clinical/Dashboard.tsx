import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  Grid,
  PageHeader,
  SectionTitle,
  formatDate,
} from '../../components/ui'
import { AiProvenance, WhyButton } from '../../components/shared'
import { RaiseDecision } from '../../components/Inbox'
import { WorkStream } from '../../components/Priority'
import { OrcaSuggests, SinceYouWereHere } from '../../components/Returning'
import { PrepareSessionButton } from '../../components/PrepareSession'
import { MyDay } from '../../components/MyDay'
import { WhatOrcaRemembers } from '../../components/Remembers'
import { Shortcuts } from '../../components/Shortcuts'
import { ActionBar } from '../../components/ActionBar'
import { CaseloadAttention } from '../../components/Caseload'
import { StatRow } from '../../components/ui'
import {
  TODAY,
  appointments,
  memoryCandidates,
  patients,
  patientsFor,
  requests,
  requestsFor,
  reviewItems,
  strategiesFor,
} from '../../data/db'
import { whatChanged } from '../../lib/record'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'
import type { Role } from '../../data/types'

const INTRO: Partial<Record<Role, { title: string; description: string }>> = {
  psychologist: {
    title: 'Dashboard',
    description: 'Today’s work, what needs attention, and what has changed since you last looked.',
  },
  psychiatrist: {
    title: 'Dashboard',
    description: 'Today’s appointments, relevant changes, and anything routed for clinical review.',
  },
  therapist: {
    title: 'Dashboard',
    description: 'Sessions, goals needing attention, and the outcomes of what is being tried.',
  },
  ot: {
    title: 'Dashboard',
    description: 'Functional work in progress: environments, adaptations and trials.',
  },
  gp: {
    title: 'Dashboard',
    description: 'A short view: who you are seeing, what changed, and what needs coordinating.',
  },
}

/** 16.1 / 23.1 / 24.1 / 25 / 26.1 — professional dashboards. */
export default function ClinicalDashboard() {
  const { role, option, personName } = useSession()
  const { say } = useUI()
  if (!role || !option) return null

  const base = option.home
  const intro = INTRO[role] ?? { title: 'Dashboard', description: '' }
  // The soonest appointment that has not happened, which is the one the
  // "prepare" button in the header is about.
  const mine = patientsFor(role ?? 'psychologist', option?.personId)
  const ids = new Set(mine.map((p) => p.id))
  // Both of these read the whole platform: a clinician's "prepare for your next
  // appointment" button pointed at whichever appointment in the system happened
  // to be soonest, and the escalation count included requests raised by people
  // they have never met.
  const next = appointments
    .filter((a) => a.status !== 'Completed' && a.datetime >= TODAY && ids.has(a.patientId))
    .sort((a, b) => a.datetime.localeCompare(b.datetime))[0]
  const memory = memoryCandidates.filter((m) => m.raisedFor.includes(role))
  const escalations = requests.filter(
    (r) => ids.has(r.patientId) && r.clarifications.some((c) => !c.answer),
  )
  // One line each, from that person's own rows. Two names used to be written
  // into this card, so every clinical role opened it and read the same two
  // patients — including roles holding no connection to either of them.
  const summary: { id: string; name: string; line: string }[] = mine
    .map((p) => ({ id: p.id, name: p.name, line: whatChanged(p.id, role ?? 'psychologist')[0] ?? '' }))
    .filter((p) => p.line)
  const reviews = reviewItems.filter((r) => r.assignedTo.includes(role))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={intro.title}
        description={intro.description}
        actions={
          <>
            {/* The one thing a clinician is trying to do in the five minutes
                before an appointment gets a button, not a path through the
                navigation. */}
            {next ? <PrepareSessionButton patientId={next.patientId} variant="primary" /> : null}
            <Button onClick={() => say('ORCA summarised today’s caseload changes.')}>
              What changed today?
            </Button>
            <Link
              to={`${base}/patients`}
              className="rounded-2xl  bg-surface-2 px-3.5 py-2 text-[0.85rem] text-ink hover:bg-surface-2"
            >
              Open patient list
            </Link>
          </>
        }
      />

      <StatRow
        stats={[
          { label: 'People in your caseload', value: patients.length, detail: 'Connected to you' },
          {
            label: 'Waiting on you',
            value: reviews.filter((r) => r.status === 'Awaiting approval').length,
            detail: 'Nothing moves until you decide',
            tone: 'wait',
          },
          {
            label: 'Patterns to confirm',
            value: memory.length,
            detail: 'Not in any record until confirmed',
          },
          {
            label: 'Unanswered questions',
            value: escalations.length,
            detail: 'Somebody is waiting on a reply',
            tone: 'alert',
          },
        ]}
      />

      <ActionBar />

      <CaseloadAttention />

      <SinceYouWereHere />

      <MyDay />

      <WorkStream />

      <OrcaSuggests />

      <Shortcuts subject="your caseload" />

      <WhatOrcaRemembers />

      <div className="mb-6">
        <RaiseDecision />
      </div>

      <p className="mb-6 text-[0.85rem] text-muted">
        Signed in as {personName} · {option.label}
      </p>

      <Grid cols={2}>
        <Card>
          <CardHead
            title="Prepared by ORCA"
            meta="Significant changes across your caseload"
            action={
              <WhyButton
                title="Caseload summary"
                bundle={{
                  input: `Changes across the ${mine.length} ${mine.length === 1 ? 'person' : 'people'} connected to you.`,
                  relevantHistory: summary.map((p) => `${p.name} — ${p.line}`),
                  supporting: ['Strategy check-ins', 'Open requests', 'Recent timeline entries'],
                  conflicting: [],
                  interpretation:
                    'Each line is the most recent movement on that record, read from the record itself.',
                  uncertainty:
                    'Derived from what has been written down. Nothing here is a clinical judgement.',
                  sources: ['Patient check-ins', 'Workflow states', 'Session notes'],
                }}
              />
            }
          />
          <CardBody>
            {summary.length ? (
              <ul className="space-y-3 text-[0.87rem] leading-relaxed text-ink">
                {summary.map((p) => (
                  <li key={p.id}>
                    <Link to={`${base}/patients/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>{' '}
                    — {p.line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.86rem] text-muted">
                Nothing has moved on any of your records in the last six weeks.
              </p>
            )}
            <AiProvenance />
          </CardBody>
        </Card>
      </Grid>

      <div className="mt-8">
        <SectionTitle>
          {role === 'gp' ? 'Today’s patients' : 'Patients with recent change'}
        </SectionTitle>
        <Grid cols={3}>
          {patients.slice(0, 3).map((p) => (
            <Card key={p.id}>
              <CardHead title={p.name} meta={`${p.age} · ${p.pronouns}`} />
              <CardBody>
                <PatientSignals patientId={p.id} fallback={p.context} />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <PrepareSessionButton patientId={p.id} />
                  <Link
                    to={`${base}/patients/${p.id}`}
                    className="text-[0.85rem] font-medium text-clinical hover:underline"
                  >
                    Open overview
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </div>
    </div>
  )
}


/**
 * What is worth knowing about this person at a glance.
 *
 * The card used to carry a paragraph of standing context — true, unchanging,
 * and therefore worthless on a dashboard, because it reads the same on the day
 * everything is fine as on the day it is not. A card that never changes is a
 * card people stop reading.
 *
 * So it carries signals instead: the review that has come due, the strategy
 * that stopped reporting, the question nobody answered. If none of those
 * exist, it falls back to the standing context and says the quiet part —
 * nothing needs attention — rather than manufacturing an alarm.
 */
function PatientSignals({ patientId, fallback }: { patientId: string; fallback: string }) {
  const signals: string[] = []

  strategiesFor(patientId).forEach((s) => {
    if (s.status !== 'Active') return
    const due = Math.round((Date.parse(s.reviewDate) - Date.parse(TODAY)) / 86_400_000)
    if (due <= 7) signals.push(`${s.title} is due for review ${due < 0 ? 'and is overdue' : `in ${due} days`}`)
    const last = s.checkIns.map((c) => c.date).sort().pop()
    if (last && Math.round((Date.parse(TODAY) - Date.parse(last)) / 86_400_000) >= 14) {
      signals.push(`No check-in on ${s.title.toLowerCase()} since ${formatDate(last)}`)
    }
  })

  requestsFor(patientId).forEach((r) =>
    r.clarifications
      .filter((c) => !c.answer)
      .forEach((c) => signals.push(`${r.destination} asked: “${c.question}”`)),
  )

  if (!signals.length) {
    return (
      <>
        <p className="text-[0.85rem] leading-relaxed text-ink-2">{fallback}</p>
        <p className="mt-1 text-[0.8rem] text-muted">Nothing needs attention.</p>
      </>
    )
  }

  return (
    <ul className="space-y-1.5">
      {signals.slice(0, 3).map((signal) => (
        <li key={signal} className="flex gap-2 text-[0.84rem] leading-relaxed text-ink-2">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-state-wait" />
          {signal}
        </li>
      ))}
    </ul>
  )
}
