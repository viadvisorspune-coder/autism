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
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { eventsFor, personName } from '../data/db'
import type { EventCategory, Role, TimelineEvent } from '../data/types'
import { useSubject } from './subject'
import { Back, Card, Loading, Nothing, PageTitle, SectionHead, longDate, shortDate } from './parts'
import { ActionButton, useAction } from './action'
import { actOnRecord } from '../lib/live'
import Compare from './Compare'
import { useAsks } from './asks'
import { toneClass } from './system'
import { IconChevron, IconRecord } from './icons'
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
  const { ask } = useAsks()
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

  /**
   * Which entries are open, in the URL for the same reason the filter is.
   *
   * Somebody opens three entries, taps into one to read the whole thing, comes
   * back — and in component state all three would have closed behind them. The
   * URL survives Back, survives a reload, and can be sent to somebody else with
   * the same three entries open.
   *
   * `replace`, so expanding four entries does not put four steps in the
   * browser's history and turn Back into an undo button for reading.
   */
  const open = new Set((params.get('open') ?? '').split(',').filter(Boolean))
  const toggleOpen = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const updated = new URLSearchParams(params)
    if (next.size) updated.set('open', [...next].join(','))
    else updated.delete('open')
    setParams(updated, { replace: true })
  }

  const mine = role === 'patient'
  const events = useMemo(() => {
    if (!subjectId) return []
    return visible(eventsFor(subjectId), role).slice().sort((a, b) => b.date.localeCompare(a.date))
    /**
     * `status` is load-bearing, not a stray dependency.
     *
     * `hydrate()` refills the record arrays with `splice(0, length, ...next)`,
     * so the array identity never changes and React has no way to know the
     * contents did. The status flipping from loading to live is the only
     * signal there is. Remove it and every screen shows the seeded example
     * record for the rest of the session.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/*
        Her own account, in her own record.

        Ananya could read every word written about her and add none of her own,
        which makes the record something done to her rather than something she
        is in. Her account of her own mornings is the most authoritative source
        it has, and it was the one source with no way in.

        A link rather than a form. The writing happens on Notes, which is the
        same screen and the same act for everybody who writes into a record, and
        two forms doing one job drift apart.
      */}
      {mine ? (
        <p className="o-body o-measure mb-10">
          <Link to="/notes" className="underline">
            Add my own note
          </Link>{' '}
          — what you write is filed as written by you and appears here with
          everything else.
        </p>
      ) : null}

      {categories.length > 1 ? (
        /*
          Chips, not buttons.

          A filter is a choice among peers rather than an action, and the
          distinction is visible: `.o-chip` cannot be mistaken for the primary
          control, which is Part 6's second check — a nine-item filter row
          borrowing the primary style puts nine filled rectangles on a screen
          that has one real action on it.
        */
        <div className="o-chips mb-12">
          {(['Everything', ...categories] as (EventCategory | 'Everything')[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
              className="o-chip"
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
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 o-panel p-5">
          <p className="o-body">
            <span className="font-semibold">{filter}</span> · {shown.length} of {events.length}{' '}
            {events.length === 1 ? 'entry' : 'entries'}
          </p>
          <button type="button" className="o-btn o-btn-small" onClick={() => setFilter('Everything')}>
            Clear filters
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

      {/*
        Nothing moves here, and the explanation is the point.

        An empty state is a person having found nothing, which is the moment
        they are least served by something arriving with a flourish. It says
        which of the three empties this is — a filter hiding things, a record
        with nothing in it yet, or a record whose entries are not part of this
        person's access — and where the filter is at fault it offers the way
        out rather than describing it.
      */}
      {status !== 'loading' && !shown.length ? (
        <Nothing>
          {filter !== 'Everything' ? (
            <>
              No entries in your record are filed under {filter}. Other entries exist — this
              heading is empty, not the record.
              <span className="mt-5 block">
                <button
                  type="button"
                  className="o-btn o-btn-small"
                  onClick={() => setFilter('Everything')}
                >
                  Clear filters
                </button>
              </span>
            </>
          ) : mine ? (
            'There is nothing in your record yet. Anything you write, and anything a professional writes about you, appears here.'
          ) : (
            'There is nothing here that is part of your access to this record.'
          )}
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
            <ul className="space-y-3">
              {group.items.map((e) => (
                /*
                  The rail is the month, drawn.

                  A dot per entry on a single line, in the entry's own
                  governance tone, so the colour down the left is the same
                  vocabulary the rest of the product uses rather than a second
                  one invented for a list. The tone is set as a custom property
                  on the item and read by the dot, which keeps the colour rule
                  in one place.
                */
                <li key={e.id} className={`o-time ${toneClass[toneOf(e, subjectId ?? '')]}`}>
                  <span aria-hidden className="o-time-dot" />
                  <Link to={`/record/${e.id}`} className="o-row no-underline">
                    <span className="o-row-mark">
                      <IconRecord size={17} />
                    </span>
                    <span className="o-row-main">
                      <span className="o-row-title block">{e.title}</span>
                      <span className="o-row-meta block">
                        {e.sourceId === (subjectId ?? '').replace(/^pt-/, 'u-')
                          ? mine
                            ? 'You'
                            : subjectName
                          : personName(e.sourceId)}
                        {' · '}
                        {shortDate(e.date)}
                      </span>
                    </span>
                    {e.status === 'Cancelled' || e.status === 'Requires adaptation' ? (
                      <span className="o-pill">
                        {e.status === 'Cancelled' ? 'Withdrawn' : 'Replaced'}
                      </span>
                    ) : (
                      <span className="o-pill">{e.category}</span>
                    )}
                    <IconChevron size={16} />
                  </Link>

                  {/*
                    Why an entry is not what it looks like, still said in words.

                    The pill above says "Withdrawn" or "Replaced", which is a
                    label and not an explanation, and a record that quietly
                    labels an entry withdrawn without saying it is kept is a
                    record somebody will assume has deleted something.
                  */}
                  {e.status === 'Cancelled' || e.status === 'Requires adaptation' ? (
                    <p className="o-meta mt-2">
                      {e.status === 'Cancelled'
                        ? 'This was withdrawn. It is kept because it happened.'
                        : 'This has been replaced by a later entry.'}
                    </p>
                  ) : null}

                  {/*
                    Reading what an entry says, without leaving the list.

                    Beneath the card rather than inside it, and deliberately so:
                    the whole card is a link to the full entry, and that is the
                    behaviour people have already learned here. A button nested
                    inside an anchor is also invalid, and browsers resolve it by
                    guessing.

                    Only the region below the card changes height. The card
                    itself does not move, the entry above it does not move, and
                    the entries below it are pushed down by exactly the height
                    of what appeared — which is the one thing a disclosure is
                    allowed to do.
                  */}
                  <button
                    type="button"
                    aria-expanded={open.has(e.id)}
                    aria-controls={`entry-${e.id}`}
                    onClick={() => toggleOpen(e.id)}
                    className="o-meta mt-3 underline"
                  >
                    {open.has(e.id) ? 'Hide what it says ▴' : 'Show what it says ▾'}
                  </button>
                  <div
                    id={`entry-${e.id}`}
                    className="o-reveal"
                    data-open={open.has(e.id) ? 'yes' : 'no'}
                  >
                    <div inert={!open.has(e.id)}>
                      <div className="pt-4">
                        <p className="o-body o-measure">{e.summary}</p>
                        <Link
                          to={`/record/${e.id}`}
                          className="o-meta mt-3 inline-block underline"
                        >
                          Open the whole entry
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/*
        For the people who read a record to find out what has changed.

        Ananya reads her record; a clinician interrogates it, and the
        interrogation is nearly always the same one. Not offered to her, not
        because she could not use it but because "compare two periods" is the
        vocabulary of a review meeting rather than of a life, and putting it on
        her screen would be the interface telling her how to think about her own
        year.
      */}
      {!mine && role !== 'trusted' && events.length ? (
        <>
          <Compare events={events} subjectName={subjectName ?? ''} ask={ask} />

          {/*
            A pack for a multidisciplinary meeting.

            It is a document request rather than a download, and that is the
            whole governance argument in one control: a pack assembled in the
            browser would leave here as a file with nobody's name on it and no
            decision behind it, which is precisely the disclosure this product
            exists to stop being routine. Asked as a question, it becomes a
            draft that Ananya decides on before it reaches a room of people.
          */}
          <MdtPack subjectName={subjectName ?? ''} ask={ask} />
        </>
      ) : null}

      <section className="o-section">
        <hr className="o-rule mb-8" />
        <NotShown boundary={boundaryFor(role)} />
      </section>
    </>
  )
}

/**
 * The multidisciplinary meeting pack.
 *
 * The one thing every clinician on a shared case asks for and the one this
 * platform would be most tempted to generate silently. It does not: it composes
 * a document request, which routes through the same approval gate as everything
 * else that leaves this record.
 *
 * That is slower than a download and it is the correct speed. A pack read aloud
 * in a room of eight professionals is the largest single disclosure in
 * somebody's care, and it should be a thing she agreed to rather than a button
 * a colleague pressed.
 */
function MdtPack({
  subjectName,
  ask,
}: {
  subjectName: string
  ask: (q: string) => Promise<string>
}) {
  const navigate = useNavigate()
  const action = useAction(async () => {
    const id = await ask(
      `Prepare a multidisciplinary meeting pack about ${subjectName || 'this person'}: what is ` +
        `current, what has changed, what is outstanding, and what each professional involved ` +
        `needs to know. Name the entries every statement rests on, and say what is not included.`,
    )
    navigate(`/ask/${id}`)
    return true
  })

  return (
    <section className="o-section">
      <h2 className="o-h3 mb-3">Export for a multidisciplinary meeting</h2>
      <p className="o-body o-measure">
        This drafts a pack and sends it to {subjectName ? subjectName.split(' ')[0] : 'them'} for a
        decision. It does not produce a file here — a pack read aloud in a room of eight people is
        the largest single disclosure in somebody&rsquo;s care, and it should be something they
        agreed to rather than something a colleague downloaded.
      </p>
      <div className="mt-6">
        <ActionButton
          action={action}
          idle="Draft a meeting pack"
          working="Creating your document…"
          done="Document ready"
          failed="Not created"
        />
      </div>
    </section>
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

  const all = useMemo(
    () => (subjectId ? visible(eventsFor(subjectId), role) : []),
    /**
     * `status` is load-bearing, not a stray dependency. See Record.tsx: the
     * record arrays are refilled in place, so their identity never changes and
     * this is the only signal React gets that the contents did.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjectId, role, status],
  )
  const event = all.find((e) => e.id === entryId)

  /**
   * Entries that name this one and came after it.
   *
   * `relatedIds` is the only link the record has between a superseded entry and
   * the one that replaced it, and it points forward from the newer entry. The
   * date check is what keeps this from listing an earlier entry that merely
   * referred to the same thing: related is not replaced.
   */
  const replacements = useMemo(
    () =>
      event
        ? all
            .filter((e) => e.relatedIds?.includes(event.id) && e.date >= event.date && e.id !== event.id)
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
        : [],
    [all, event],
  )

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

      <Card tone={toneOf(event, subjectId ?? '')} raised>
        <div className="o-card-body">
          <p className="o-answer o-measure">{event.summary}</p>
          {event.context ? <p className="o-body o-measure mt-6">{event.context}</p> : null}
        </div>
      </Card>

      {/*
        What replaced it, when something did.

        An entry marked "Requires adaptation" says it has been superseded and
        then leaves the person to find the thing that superseded it, which on a
        record of forty entries is a search. History is the product here — the
        old entry stays because it happened — but an old entry with no route to
        the current one is a half-told story, and the half missing is the half
        that is true now.
      */}
      {replacements.length ? (
        <section className="o-section">
          <SectionHead>What replaced this</SectionHead>
          <ul className="space-y-5">
            {replacements.map((r) => (
              <li key={r.id}>
                <Link to={`/record/${r.id}`} state={{ from: `/record/${event.id}`, label: 'this entry' }} className="block no-underline">
                  <Card tone={toneOf(r, subjectId ?? '')}>
                    <div className="p-6">
                      <p className="o-meta">{longDate(r.date)}</p>
                      <p className="o-h3 mt-1">{r.title}</p>
                      <p className="o-body o-measure mt-3">{r.summary}</p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : event.status === 'Requires adaptation' || event.status === 'Cancelled' ? (
        <section className="o-section">
          <SectionHead>What replaced this</SectionHead>
          <p className="o-body o-measure">
            {event.status === 'Cancelled'
              ? 'This was withdrawn and nothing was written in its place.'
              : 'This is marked as superseded, but nothing in the record says what replaced it. That is a gap in the record rather than something being kept from you.'}
          </p>
        </section>
      ) : null}

      {/*
        Saying it is wrong, without touching what is written.

        Nothing here edits or deletes the entry, and that is not a limitation —
        a record you can quietly correct is a record nobody can rely on, and the
        first thing that would go is somebody's ability to prove what was said
        about them and when. What this does is add a second entry, in her words,
        with her name on it, permanently attached to the first.

        Ananya's alone. A professional who thinks a colleague's note is wrong
        writes their own note saying so, which is what Notes is for; a
        correction is the specific right of the person the record is about.
      */}
      {mine ? <Dispute event={event} /> : null}

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

/**
 * "Say this is wrong" — a correction that adds rather than edits.
 *
 * The disclosure is on the button before it is pressed, not in a confirmation
 * afterwards: nothing here changes the entry, and somebody expecting a delete
 * needs to know that before they write two paragraphs on that assumption.
 *
 * The objection goes in as an ordinary entry with the disputed entry's
 * reference in it, so it is findable from either end and cannot be separated
 * from what it disputes. Filed as reported by her, which is the correct weight
 * and also the honest one.
 */
function Dispute({ event }: { event: TimelineEvent }) {
  const { option, patientId } = useSession()
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const send = useAction(async () => {
    setProblem(null)
    const body = why.trim()
    if (!body || !patientId || !option?.personId) return false
    const result = await actOnRecord('add_entry', patientId, option.personId, {
      kind: 'correction',
      kind_label: 'Correction',
      occurred_on: new Date().toISOString().slice(0, 10),
      fields: {
        about: `${event.id} — ${event.title}`,
        what: body,
      },
    })
    if (!result.ok) {
      setProblem(result.error ?? 'That could not be added to the record.')
      return false
    }
    setWhy('')
    setDone(true)
    return true
  })

  if (done) {
    return (
      <section className="o-section">
        <SectionHead>You said this is wrong</SectionHead>
        <div role="status" className="o-panel o-measure p-5">
          <p className="o-body font-semibold">Added to the record ✓</p>
          <p className="o-body mt-3">
            What you wrote is now part of the record, attached to this entry, with your name on
            it. The entry above is unchanged — it stays because it was written, and your account
            of it stays beside it for the same reason.
          </p>
          <p className="o-body mt-3">
            Nobody was notified. If you want somebody to act on it, ask about it or send it from
            Documents.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="o-section">
      <SectionHead>Is something here wrong?</SectionHead>
      <p className="o-body o-measure">
        You can say so, in your own words, and it becomes part of the record attached to this
        entry. Nothing above is edited or removed: a record that can be quietly corrected is a
        record nobody can rely on, and the first thing lost would be your ability to show what
        was said about you and when.
      </p>

      {!open ? (
        <button type="button" className="o-btn mt-6" aria-expanded={false} onClick={() => setOpen(true)}>
          Say this is wrong
        </button>
      ) : null}

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <label htmlFor="dispute" className="o-h3 mb-3 mt-6 block">
            What is wrong, and what is actually the case
          </label>
          <textarea
            id="dispute"
            className="o-input"
            rows={5}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'dispute-problem' : undefined}
          />

          {problem ? (
            <div id="dispute-problem" role="alert" className="o-body o-measure mt-4 o-panel p-5">
              <p className="font-semibold">This was not added to the record.</p>
              <p className="mt-3">{problem}</p>
              <p className="mt-3">
                What you typed is still in the box. Nothing was written and nothing is being
                retried on its own.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-4">
            <ActionButton
              action={send}
              idle="Add this to the record"
              working="Saving…"
              done="Saved ✓"
              failed="Not saved"
              primary
              disabled={!why.trim()}
            />
            <button type="button" className="o-btn" onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
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
