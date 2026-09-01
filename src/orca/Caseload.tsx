/**
 * Caseload — the one screen Ananya never sees.
 *
 * NO STATUS COLOURS, NO RISK INDICATORS, NO COUNTS BEYOND WHAT IS FACTUAL. A
 * caseload list that visually ranks people by concern is a clinical judgement,
 * and it is one the system has no authority to make: it would be made from
 * entry frequency and recency, which measure how much somebody has been
 * writing rather than how they are. So the only things on a card are when this
 * clinician last saw the person and how many entries have appeared since —
 * both of which are facts about the record, not opinions about the person.
 */
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { eventsFor } from '../data/db'
import { useSubject } from './subject'
import { Card, Loading, Nothing, PageTitle, longDate } from './parts'
import { useLive } from '../lib/live'

/**
 * How the list is ordered.
 *
 * Three orders, and none of them is a ranking of people. "Last seen" and "new
 * activity" are facts about the record — when this clinician last wrote
 * something, and how many entries have appeared since — and by name is the
 * order somebody uses when they already know who they are looking for.
 *
 * WHAT IS NOT HERE IS ANYTHING SHAPED LIKE CONCERN. Sorting a caseload by
 * urgency, risk or need would be a clinical judgement assembled from entry
 * frequency and recency, which measure how much has been written rather than
 * how somebody is. A list in that order is read as a priority order whatever
 * the column header says, so the order is not offered.
 */
type Order = 'name' | 'seen' | 'new'

const ORDERS: { key: Order; label: string }[] = [
  { key: 'name', label: 'By name' },
  { key: 'seen', label: 'Longest since I saw them' },
  { key: 'new', label: 'Most new entries' },
]

export default function Caseload() {
  const { option } = useSession()
  const { status } = useRecordStatus()
  const { caseload, choose, subjectId } = useSubject()
  const navigate = useNavigate()

  /**
   * Order and search live in the URL, like every other view state in ORCA.
   *
   * Open somebody, come back, and the list is as you left it. `replace`, so
   * typing into the search box does not put one history entry per keystroke and
   * turn Back into an undo for typing.
   */
  const [params, setParams] = useSearchParams()
  const order = (params.get('by') as Order | null) ?? 'name'
  const query = params.get('q') ?? ''
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'name') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    const me = option?.personId
    const built = caseload.map((c) => {
      const events = eventsFor(c.id)
      const seen = events
        .filter((e) => e.sourceId === me)
        .map((e) => e.date)
        .sort()
        .pop()
      const since = seen ? events.filter((e) => e.date > seen).length : 0
      return { ...c, seen, since }
    })

    const needle = query.trim().toLowerCase()
    const found = needle
      ? built.filter((r) => r.name.toLowerCase().includes(needle))
      : built

    return found.slice().sort((a, b) => {
      if (order === 'seen') {
        // Never seen sorts first: somebody this clinician has never recorded a
        // session with is the strongest case of "longest since", not a missing
        // value to be dropped to the bottom.
        if (!a.seen && !b.seen) return a.name.localeCompare(b.name)
        if (!a.seen) return -1
        if (!b.seen) return 1
        return a.seen.localeCompare(b.seen)
      }
      if (order === 'new') return b.since - a.since || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
  }, [caseload, option?.personId, status, order, query])

  const total = caseload.length

  return (
    <>
      <PageTitle>Your caseload</PageTitle>

      {/*
        Search and order, above the list.

        A caseload of four does not need either and a caseload of forty is
        unusable without them, so both appear only once there is enough to
        justify the row — a search box over three names is a control asking
        somebody to type instead of look.
      */}
      {total > 5 ? (
        <div className="mb-10">
          <label htmlFor="caseload-find" className="o-h3 mb-3 block">
            Find somebody
          </label>
          <input
            id="caseload-find"
            type="search"
            className="o-input"
            value={query}
            onChange={(e) => set('q', e.target.value)}
          />

          <h2 className="o-h3 mb-3 mt-8">Order</h2>
          <div className="flex flex-wrap gap-3">
            {ORDERS.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={order === o.key}
                onClick={() => set('by', o.key)}
                className={`o-btn o-btn-small ${order === o.key ? 'o-btn-on' : ''}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="o-meta o-measure mt-4">
            None of these orders is a ranking of people. They are facts about the record — when
            you last wrote something, and how much has been written since — and there is
            deliberately no order by concern, because one assembled from how often somebody has
            been written about is read as a priority list whatever it is called.
          </p>
        </div>
      ) : null}

      {/*
        What the list is showing, for somebody who cannot see the row above.

        Always in the DOM rather than appearing with the filter, because a live
        region added at the same moment as its text is announced unreliably.
      */}
      <p className="sr-only" aria-live="polite">
        {query.trim()
          ? `${rows.length} of ${total} people match ${query.trim()}`
          : `${total} ${total === 1 ? 'person' : 'people'}, ${ORDERS.find((o) => o.key === order)?.label.toLowerCase()}`}
      </p>

      {/*
        "Still reading" and "you hold nobody's record" are different sentences.

        The second one is a clinician's whole working day being absent, and it
        is the kind of thing somebody acts on immediately — by assuming their
        access was withdrawn. It must never be shown while the answer is still
        being fetched.
      */}
      {status === 'loading' ? <Loading what="your caseload" /> : null}

      {status !== 'loading' && !rows.length && total ? (
        <Nothing>
          Nobody on your caseload matches &ldquo;{query.trim()}&rdquo;. The people are still
          there — this is the search, not the list.
          <span className="mt-5 block">
            <button type="button" className="o-btn o-btn-small" onClick={() => set('q', '')}>
              Clear the search
            </button>
          </span>
        </Nothing>
      ) : null}

      {status !== 'loading' && !total ? (
        <Nothing>
          You do not currently hold a live connection to anyone&rsquo;s record. A connection is
          made by the person whose record it is.
        </Nothing>
      ) : null}

      <ul className="space-y-8">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => {
                choose(r.id)
                navigate('/ask')
              }}
            >
              <Card tone={r.id === subjectId ? 'current' : 'past'}>
                <div className="o-card-body">
                  <p className="o-h2">{r.name}</p>
                  <p className="o-meta mt-2">
                    {r.seen ? `Last seen ${longDate(r.seen)}` : 'You have not recorded a session yet'}
                  </p>
                  {/*
                    "since then" — the sentence used to stop at "since" and
                    name nothing, so a clinician read "3 new entries since" and
                    had to supply the object themselves. It points at the line
                    directly above, which is the date and is always present:
                    `since` is only counted when `seen` exists, so this can
                    never be anaphoric to nothing.
                  */}
                  {r.since ? (
                    <p className="o-body mt-3">
                      {r.since === 1
                        ? 'One new entry since then'
                        : `${r.since} new entries since then`}
                    </p>
                  ) : null}
                  {/*
                    Open items, where there are any. A coordinator's whole
                    question is which of these has something outstanding, and
                    a caseload that does not say makes them open six records
                    to find out.
                  */}
                  <Open patientId={r.id} />
                </div>
              </Card>
            </button>
          </li>
        ))}
      </ul>

      <p className="o-meta o-measure mt-10">
        Opening someone puts their record in scope. Their name stays at the top of every screen
        until you change it, so it is never ambiguous whose record you are in.
      </p>
    </>
  )
}

/**
 * How many open items this record has, for the roles that chase them.
 *
 * One read, shared by every card through the provider's cache — `useLive`
 * against the same resource and scope resolves to the same poll. Absent rather
 * than zero: a card that permanently says "0 open" has taught everybody to stop
 * reading that line.
 */
function Open({ patientId }: { patientId: string }) {
  const { data } = useLive<{ tasks: { patient_id?: string | null; status?: string }[] }>(
    'tasks',
    null,
    30000,
  )
  const count = (data?.tasks ?? []).filter(
    (t) => t.patient_id === patientId && t.status === 'Active',
  ).length
  if (!count) return null
  return (
    <p className="o-meta mt-2">
      {count === 1 ? 'One open item' : `${count} open items`}
    </p>
  )
}
