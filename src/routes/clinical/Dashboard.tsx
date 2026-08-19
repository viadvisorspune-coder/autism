import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  Grid,
  PageHeader,
  SectionTitle,
  StatusPill,
  formatDateTime,
} from '../../components/ui'
import { AiProvenance, ReviewRequiredCard, WhyButton } from '../../components/shared'
import {
  appointments,
  memoryCandidates,
  patientName,
  patients,
  requests,
  reviewItems,
  tasks,
} from '../../data/db'
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
  const today = appointments.filter((a) => a.datetime.startsWith('2026-08-19'))
  const mine = tasks.filter((t) => t.forRoles.includes(role))
  const memory = memoryCandidates.filter((m) => m.raisedFor.includes(role))
  const escalations = requests.filter((r) => r.clarifications.some((c) => !c.answer))
  const reviews = reviewItems.filter((r) => r.assignedTo.includes(role))

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={intro.title}
        description={intro.description}
        actions={
          <>
            <Button onClick={() => say('ORCA summarised today’s caseload changes.')}>
              What changed today?
            </Button>
            <Link
              to={`${base}/patients`}
              className="rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-[0.85rem] text-ink hover:bg-surface-2"
            >
              Open patient list
            </Link>
          </>
        }
      />

      <p className="mb-6 text-[0.85rem] text-muted">
        Signed in as {personName} · {option.label}
      </p>

      <Grid cols={3}>
        <Card>
          <CardHead title="Today" meta={`${today.length} appointments`} />
          <CardBody>
            <ul className="space-y-3">
              {today.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`${base}/patients/${a.patientId}`}
                    className="text-[0.88rem] font-medium text-ink hover:underline"
                  >
                    {patientName(a.patientId)}
                  </Link>
                  <span className="block text-[0.79rem] text-muted">
                    {formatDateTime(a.datetime)} · {a.purpose}
                  </span>
                </li>
              ))}
              {today.length === 0 ? (
                <li className="text-[0.85rem] text-muted">No appointments today.</li>
              ) : null}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Needs attention" meta={`${mine.length + memory.length} items`} />
          <CardBody>
            <ul className="space-y-3">
              {mine.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-[0.87rem] text-ink">{t.title}</span>
                    <span className="block text-[0.78rem] text-muted">
                      {t.patientId ? `${patientName(t.patientId)} · ` : ''}due {t.due.slice(8)}{' '}
                      {t.due.slice(5, 7) === '08' ? 'August' : ''}
                    </span>
                  </span>
                  <StatusPill status={t.status} />
                </li>
              ))}
              {memory.length ? (
                <li>
                  <Link to={`${base}/memory`} className="text-[0.87rem] text-ink hover:underline">
                    {memory.length} proposed longitudinal update
                    {memory.length === 1 ? '' : 's'} awaiting review
                  </Link>
                  <span className="block text-[0.78rem] text-muted">
                    Nothing enters the record until a person accepts it.
                  </span>
                </li>
              ) : null}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title="Prepared by ORCA"
            meta="Significant changes and unresolved issues"
            action={
              <WhyButton
                title="Caseload summary"
                bundle={{
                  input: 'Changes across your caseload since 12 August 2026.',
                  relevantHistory: [
                    'Ananya Rao — advance-notice strategy under review',
                    'Rohan Mehta — first post-diagnostic session held 19 August',
                    'Farida Qureshi — university clarification outstanding',
                  ],
                  supporting: [
                    'Two failed check-ins reported by Ananya Rao',
                    'Employer clarification request received 19 August',
                  ],
                  conflicting: ['Earlier check-ins for the same strategy reported benefit'],
                  interpretation:
                    'One strategy needs adapting; two workflows are waiting on people outside the clinic.',
                  uncertainty:
                    'Patient-reported check-ins only. No independent measure of lost working time.',
                  sources: ['Patient check-ins', 'Workflow states', 'Session notes'],
                }}
              />
            }
          />
          <CardBody>
            <ul className="space-y-3 text-[0.87rem] leading-relaxed text-ink">
              <li>
                <span className="font-medium">Ananya Rao</span> — advance-notice strategy is
                effective for planned changes only. An adaptation is proposed and waiting on review.
              </li>
              <li>
                <span className="font-medium">Farida Qureshi</span> — university has asked whether
                extra time applies to all assessments.
              </li>
              {escalations.length ? (
                <li>
                  <span className="font-medium">{escalations.length} workflow(s)</span> waiting on an
                  external stakeholder.
                </li>
              ) : null}
            </ul>
            <AiProvenance />
          </CardBody>
        </Card>
      </Grid>

      {reviews.length ? (
        <div className="mt-8">
          <SectionTitle>Waiting for a human decision</SectionTitle>
          <div className="space-y-3">
            {reviews.map((item) => (
              <ReviewRequiredCard key={item.id} item={item} audience="professional" />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <SectionTitle>
          {role === 'gp' ? 'Today’s patients' : 'Patients with recent change'}
        </SectionTitle>
        <Grid cols={3}>
          {patients.slice(0, 3).map((p) => (
            <Card key={p.id}>
              <CardHead title={p.name} meta={`${p.age} · ${p.pronouns}`} />
              <CardBody>
                <p className="text-[0.85rem] leading-relaxed text-ink-2">{p.context}</p>
                <Link
                  to={`${base}/patients/${p.id}`}
                  className="mt-3 inline-block text-[0.85rem] font-medium text-clinical hover:underline"
                >
                  Open overview
                </Link>
              </CardBody>
            </Card>
          ))}
        </Grid>
      </div>
    </div>
  )
}
