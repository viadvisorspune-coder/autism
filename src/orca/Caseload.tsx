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
import { useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { eventsFor } from '../data/db'
import { useSubject } from './subject'
import { Card, Nothing, PageTitle, longDate } from './parts'

export default function Caseload() {
  const { option } = useSession()
  const { status } = useRecordStatus()
  const { caseload, choose, subjectId } = useSubject()
  const navigate = useNavigate()

  const rows = useMemo(() => {
    const me = option?.personId
    return caseload.map((c) => {
      const events = eventsFor(c.id)
      const seen = events
        .filter((e) => e.sourceId === me)
        .map((e) => e.date)
        .sort()
        .pop()
      const since = seen ? events.filter((e) => e.date > seen).length : 0
      return { ...c, seen, since }
    })
  }, [caseload, option?.personId, status])

  return (
    <>
      <PageTitle>Your caseload</PageTitle>

      {!rows.length ? (
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
                  {r.since ? (
                    <p className="o-body mt-3">
                      {r.since === 1 ? 'One new entry since' : `${r.since} new entries since`}
                    </p>
                  ) : null}
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
