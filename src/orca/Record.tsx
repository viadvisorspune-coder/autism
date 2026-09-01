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
import { useMemo } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { eventsFor, personName } from '../data/db'
import type { EventCategory, Role, TimelineEvent } from '../data/types'
import { useSubject } from './subject'
import { Back, Card, Loading, Nothing, PageTitle, longDate, shortDate } from './parts'
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

  /**
   * The filter lives in the URL, not in component state.
   *
   * Held in state, it was lost the moment somebody opened an entry and pressed
   * Back — they returned to the whole record with no memory of the slice they
   * had been reading, and no indication that anything had changed. In the URL
   * it survives Back, it survives a reload, and it can be linked to.
   *
   * `replace` on change, so filtering does not fill the browser's history with
   * one entry per press and turn the Back button into a list of filters.
   */
  const [params, setParams] = useSearchParams()
  const filter = (params.get('only') as EventCategory | null) ?? 'Everything'
  const setFilter = (next: EventCategory | 'Everything') => {
    const updated = new URLSearchParams(params)
    if (next === 'Everything') updated.delete('only')
    else updated.set('only', next)
    setParams(updated, { replace: true })
  }

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

      {/*
        The same confirmation, for somebody who cannot see the strip below.

        Always in the DOM rather than rendered alongside the filter strip: a
        live region that appears at the same moment its text does is announced
        unreliably, and the whole point is that pressing a filter is never
        silent. The strip below says this in the same words on screen — this is
        the second channel, not the only one.
      */}
      <p className="sr-only" aria-live="polite">
        {filter === 'Everything'
          ? `Showing everything · ${events.length} ${events.length === 1 ? 'entry' : 'entries'}`
          : `Filtered to ${filter} · ${shown.length} of ${events.length} ${
              events.length === 1 ? 'entry' : 'entries'
            }`}
      </p>

      {/*
        What is being hidden, and how to stop hiding it.

        A filtered list with no statement of the filter is a record that
        appears to have lost half its entries. The count is part of it: "Health
        · 12 of 47 entries" answers the question the missing entries raise
        before somebody has to ask it.
      */}
      {filter !== 'Everything' ? (
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border border-black p-5">
          <p className="o-body">
            <span className="font-semibold">{filter}</span> · {shown.length} of {events.length}{' '}
            {events.length === 1 ? 'entry' : 'entries'}
          </p>
          <button type="button" className="o-btn o-btn-small" onClick={() => setFilter('Everything')}>
            Show everything
          </button>
        </div>
      ) : null}

      {/*
        Reading, and empty, are different facts about a record.

        The seeded rows are in memory from the first paint, so this screen has
        always had something to draw — which meant a record still being fetched
        looked exactly like a finished one, and a person could read a page of
        entries that were about to be replaced by their own. Said in words for
        the same reason the example-data strip in the footer exists.
      */}
      {status === 'loading' ? (
        <Loading what={mine ? 'your record' : subjectName ? `${subjectName}’s record` : 'this record'} />
      ) : null}

      {status !== 'loading' && !shown.length ? (
        <Nothing>
          {filter !== 'Everything'
            ? `No entries in your record are filed under ${filter}. Other entries exist — this heading is empty, not the record.`
            : mine
              ? 'There is nothing in your record yet. Anything you write, and anything a professional writes about you, appears here.'
              : 'There is nothing here that is part of your access to this record.'}
        </Nothing>
      ) : null}

      {/*
        The seeded entries are held back until the real ones have been fetched.

        They are in memory from the first paint, which is what makes this
        necessary rather than tidy: without it somebody opens Record, reads
        four entries about a life that is not theirs, and watches them be
        replaced. A second of the word "Loading" is cheaper than that.
      */}
      <div className="space-y-16">
        {(status === 'loading' ? [] : months).map((group) => (
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

  /**
   * Back goes where you came from, not where this screen usually sits.
   *
   * An entry opened from a source line on an answer belongs, for the length of
   * that visit, to the answer — sending somebody to the top of Record instead
   * loses the thing they were reading and the question they were reading it
   * for. The route that opened it says so; without that it falls back to
   * Record, which is where the entry lives the rest of the time.
   */
  const { state } = useLocation() as {
    state: { from?: string; label?: string } | null
  }
  const back = state?.from ?? '/record'
  const backLabel = state?.label ?? 'Record'

  const event = subjectId
    ? visible(eventsFor(subjectId), role).find((e) => e.id === entryId)
    : undefined

  if (!event) {
    return (
      <>
        <Back to={back}>Back to {backLabel}</Back>
        {/* Never confirms existence. An entry outside this person's access and
            an entry that was never written read identically. */}
        <Nothing>That entry is not part of your access to this record.</Nothing>
      </>
    )
  }

  return (
    <>
      <Back to={back}>Back to {backLabel}</Back>
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
