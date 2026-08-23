import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Card,
  CardBody,
  DefinitionList,
  EvidenceTag,
  FilterChips,
  PageHeader,
  StatusPill,
  formatDate,
} from '../../components/ui'
import { eventsFor, personName, timeline } from '../../data/db'
import type { EventCategory } from '../../data/types'
import { useRecordId } from '../../state/record'

const FILTERS: (EventCategory | 'All')[] = [
  'All',
  'Personal',
  'Functional',
  'Clinical',
  'Support',
  'Work',
  'University',
  'Appointments',
  'Documents',
  'Stakeholder observations',
]

/** 5.1 Longitudinal timeline. */
export function PatientStory() {
  const patientId = useRecordId()
  const [filter, setFilter] = useState<string>('All')
  const events = eventsFor(patientId).filter((e) => filter === 'All' || e.category === filter)

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My story"
        description="Everything ORCA holds about you, in the order it happened, with where each item came from."
        breadcrumbs={[{ label: 'Home', to: '/patient' }, { label: 'My story' }]}
      />

      <div className="mb-5">
        <FilterChips options={FILTERS} active={filter} onChange={setFilter} />
      </div>

      <ol className="space-y-3">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              to={`/patient/story/${event.id}`}
              className="block rounded-[20px]  bg-surface-2 px-5 py-4 hover:border-line-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.78rem] text-muted">
                    {formatDate(event.date)} · {event.category}
                  </p>
                  <p className="mt-0.5 text-[0.95rem] font-medium text-ink">{event.title}</p>
                  <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-2">{event.summary}</p>
                  <p className="mt-2 text-[0.78rem] text-muted">
                    Source: {event.sourceId === 'orca' ? 'ORCA' : personName(event.sourceId)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusPill status={event.status} />
                  <EvidenceTag status={event.evidence} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 5.2 Event detail. */
export function PatientStoryEvent() {
  const { eventId } = useParams()
  const event = timeline.find((e) => e.id === eventId)

  if (!event) {
    return <p className="text-[0.9rem] text-muted">That entry could not be found.</p>
  }

  const related = timeline.filter((e) => event.relatedIds?.includes(e.id))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={event.title}
        breadcrumbs={[
          { label: 'Home', to: '/patient' },
          { label: 'My story', to: '/patient/story' },
          { label: 'Entry' },
        ]}
        actions={<EvidenceTag status={event.evidence} />}
      />

      <Card>
        <CardBody className="space-y-5">
          <div>
            <h2 className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-muted">
              What happened
            </h2>
            <p className="text-[0.92rem] leading-relaxed text-ink">{event.summary}</p>
          </div>

          <DefinitionList
            items={[
              { label: 'Source', value: event.sourceId === 'orca' ? 'ORCA (interpretation)' : personName(event.sourceId) },
              {
                label: 'Date',
                value: event.occurredOn
                  ? `Recorded ${formatDate(event.date)} · happened ${formatDate(event.occurredOn)}`
                  : formatDate(event.date),
              },
              { label: 'Context', value: event.context ?? 'No additional context recorded.' },
              { label: 'Evidence status', value: <EvidenceTag status={event.evidence} /> },
              {
                label: 'Who can see it',
                value: event.visibleTo
                  .map((r) => (r === 'patient' ? 'You' : r === 'ot' ? 'OT' : r[0].toUpperCase() + r.slice(1)))
                  .join(', '),
              },
            ]}
          />
        </CardBody>
      </Card>

      {related.length ? (
        <div className="mt-6">
          <h2 className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-muted">
            Related history
          </h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/patient/story/${r.id}`}
                  className="block rounded-[20px]  bg-surface-2 px-4 py-3 hover:border-line-strong"
                >
                  <span className="text-[0.88rem] font-medium text-ink">{r.title}</span>
                  <span className="mt-0.5 block text-[0.78rem] text-muted">
                    {formatDate(r.date)} · {r.category}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
