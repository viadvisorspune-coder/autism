/**
 * Record — browsable, and scoped to what you may see.
 *
 * Reverse chronological, grouped by month, with colour encoding who wrote each
 * entry rather than how important it is. There is no ranking here and there is
 * not going to be one: a list that visually sorts a life by concern is a
 * clinical judgement the interface has no authority to make.
 *
 * Nothing is hidden from the person it belongs to, including the parts that
 * have been replaced. History is the product — an entry that was superseded
 * says so, dated, with the current version one tap away.
 */
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { eventsFor, personName } from '../data/db'
import type { EventCategory, Role, TimelineEvent } from '../data/types'
import { useSubject } from './subject'
import { Back, Card, Nothing, PageTitle, longDate, shortDate } from './parts'
import type { Tone } from './system'
import { boundaryFor } from './system'
import { NotShown } from './parts'

/**
 * The colour an entry carries.
 *
 * Who wrote it and whether it still stands. Never how serious it is.
 */
function toneOf(event: TimelineEvent, patientId: string): Tone {
  if (event.status === 'Cancelled' || event.status === 'Requires adaptation') return 'past'
  if (event.sourceId === patientId.replace(/^pt-/, 'u-')) return 'current'
  if (event.evidence === 'Professionally documented' || event.evidence === 'Validated')
    return 'confirmed'
  return 'past'
}

function visible(events: TimelineEvent[], role: Role | null): TimelineEvent[] {
  if (!role) return []
  if (role === 'patient') return events
  return events.filter((e) => e.visibleTo.includes(role))
}

export default function Record() {
  const { role } = useSession()
  // Re-read when the live record lands: hydrate() refills the record arrays in
  // place, so the status change is the only signal React gets that the rows
  // under these screens are no longer the seeded ones.
  const { status } = useRecordStatus()
  const { subjectId, subjectName, choosable } = useSubject()
  const [filter, setFilter] = useState<EventCategory | 'Everything'>('Everything')

  const mine = role === 'patient'
  const events = useMemo(() => {
    if (!subjectId) return []
    return visible(eventsFor(subjectId), role).slice().sort((a, b) => b.date.localeCompare(a.date))
  }, [subjectId, role, status])

  const categories = useMemo(() => {
    const seen = new Set<EventCategory>()
    for (const e of events) seen.add(e.category)
    return [...seen]
  }, [events])

  const shown = filter === 'Everything' ? events : events.filter((e) => e.category === filter)

  const months = useMemo(() => {
    const groups: { label: string; items: TimelineEvent[] }[] = []
    for (const e of shown) {
      const label = new Date(e.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(e)
      else groups.push({ label, items: [e] })
    }
    return groups
  }, [shown])

  if (choosable && !subjectId) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <Link to="/caseload" className="o-btn o-btn-primary no-underline">
          Go to your caseload
        </Link>
      </>
    )
  }

  return (
    <>
      <PageTitle>{mine ? 'Your record' : `${subjectName}’s record`}</PageTitle>

      {categories.length > 1 ? (
        <div className="mb-12 flex flex-wrap gap-3">
          {(['Everything', ...categories] as (EventCategory | 'Everything')[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className={`o-btn o-btn-small ${filter === c ? 'o-btn-primary' : ''}`}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {!shown.length ? (
        <Nothing>
          {mine
            ? 'There is nothing in your record under this heading yet. Anything you write, and anything a professional writes about you, appears here.'
            : 'There is nothing here that is part of your access to this record.'}
        </Nothing>
      ) : null}

      <div className="space-y-16">
        {months.map((group) => (
          <section key={group.label}>
            <hr className="o-rule mb-5" />
            <h2 className="o-h2 mb-6">{group.label}</h2>
            <ul className="space-y-6">
              {group.items.map((e) => (
                <li key={e.id}>
                  <Link to={`/record/${e.id}`} className="block no-underline">
                    <Card tone={toneOf(e, subjectId ?? '')}>
                      <div className="p-6">
                        <p className="o-meta">{shortDate(e.date)}</p>
                        <p className="o-h3 mt-1">{e.title}</p>
                        <p className="o-meta mt-2">
                          {e.sourceId === (subjectId ?? '').replace(/^pt-/, 'u-')
                            ? mine
                              ? 'You wrote this'
                              : `${subjectName} wrote this`
                            : `${personName(e.sourceId)} wrote this`}
                        </p>
                        {e.status === 'Cancelled' || e.status === 'Requires adaptation' ? (
                          <>
                            <hr className="o-rule my-4" />
                            <p className="o-meta">
                              {e.status === 'Cancelled'
                                ? 'This was withdrawn. It is kept because it happened.'
                                : 'This has been replaced by a later entry.'}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="o-section">
        <hr className="o-rule mb-8" />
        <NotShown boundary={boundaryFor(role)} />
      </section>
    </>
  )
}

/** One entry, opened from a source line on an answer or from the list. */
export function Entry() {
  const { entryId = '' } = useParams()
  const { role } = useSession()
  const { subjectId, subjectName } = useSubject()
  const mine = role === 'patient'

  const event = subjectId
    ? visible(eventsFor(subjectId), role).find((e) => e.id === entryId)
    : undefined

  if (!event) {
    return (
      <>
        <Back to="/record">Back to Record</Back>
        {/* Never confirms existence. An entry outside this person's access and
            an entry that was never written read identically. */}
        <Nothing>That entry is not part of your access to this record.</Nothing>
      </>
    )
  }

  return (
    <>
      <Back to="/record">Back to Record</Back>
      <p className="o-meta mb-3">{longDate(event.date)}</p>
      <h1 className="o-h2 o-measure mb-8">{event.title}</h1>

      <Card tone={toneOf(event, subjectId ?? '')}>
        <div className="o-card-body">
          <p className="o-answer o-measure">{event.summary}</p>
          {event.context ? <p className="o-body o-measure mt-6">{event.context}</p> : null}
        </div>
      </Card>

      <section className="o-section">
        <hr className="o-rule mb-8" />
        <h2 className="o-h2 mb-6">Where this came from</h2>
        <dl className="space-y-4">
          <Fact
            label="Written by"
            value={
              event.sourceId === (subjectId ?? '').replace(/^pt-/, 'u-')
                ? mine
                  ? 'You'
                  : subjectName
                : personName(event.sourceId)
            }
          />
          <Fact label="Recorded on" value={longDate(event.date)} />
          <Fact label="How well established" value={event.evidence} />
          <Fact label="Part of the record" value={event.category} />
          <Fact label="Reference" value={event.id} />
        </dl>
      </section>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <dt className="o-body w-52 shrink-0 font-semibold">{label}</dt>
      <dd className="o-body">{value}</dd>
    </div>
  )
}
