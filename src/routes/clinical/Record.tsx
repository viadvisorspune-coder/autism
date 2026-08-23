/**
 * One patient, one destination.
 *
 * Clicking somebody's name used to land on a single long scroll of nine cards
 * that said the same things about everybody, while the rest of their record
 * lived on six other pages reached from the sidebar — a timeline that read one
 * hard-coded patient, documents filtered by role and nothing else, requests
 * somewhere else again. Nothing linked back.
 *
 * This is the whole record behind one name, divided by what you came for
 * rather than by which table the row is in. The division is the point: a
 * clinician looking for last month's check-ins should not have to read the
 * consent history to get there, and a record with forty events should not
 * *feel* like forty events.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  CardBody,
  CardHead,
  DefinitionList,
  EmptyState,
  EvidenceTag,
  FilterChips,
  LinkButton,
  PageHeader,
  Section,
  StatusPill,
  Table,
  formatDate,
  formatDateTime,
} from '../../components/ui'
import { AiProvenance } from '../../components/shared'
import { UploadPanel } from '../../components/Upload'
import {
  appointmentsFor,
  documentsFor,
  patients,
  personName,
  profileFor,
  requestsFor,
  sessionNotes,
  strategiesFor,
  tasks,
} from '../../data/db'
import {
  lastContact,
  nextAppointment,
  recordCounts,
  roleLens,
  visibleEvents,
  visibleTabs,
  whatChanged,
} from '../../lib/record'
import { useSession } from '../../state/session'
import { askOrca } from '../../lib/ask'
import type { Role } from '../../data/types'

const ALL_TABS = ['Overview', 'Timeline', 'Support', 'Documents', 'Requests', 'Diary'] as const
type Tab = (typeof ALL_TABS)[number]

const slug = (t: Tab) => t.toLowerCase()

/** Mirrors the scope rule in lib/record — kept here for the request filter. */
const CLINICAL_VIEW = new Set<Role>(['psychologist', 'psychiatrist', 'therapist', 'ot', 'gp', 'clinic'])

export default function PatientRecord() {
  const { patientId, tab } = useParams()
  const { option, role } = useSession()
  const navigate = useNavigate()
  const base = option?.home ?? '/psychologist'
  const patient = patients.find((p) => p.id === patientId)

  if (!patient) {
    return (
      <EmptyState
        title="That record is not open to you"
        detail="Either it does not exist, or nobody has connected it to your account."
      />
    )
  }

  const viewer = (role ?? 'psychologist') as Role
  // Which tabs exist at all is a scope decision, not a layout one. An employer
  // has no business with a Support tab, and offering one that always says
  // "nothing for you" still tells them the tab was worth building.
  const TABS = visibleTabs(viewer) as Tab[]
  const viewing = (TABS.find((t) => slug(t) === (tab ?? 'overview')) ?? 'Overview') as Tab
  const counts = recordCounts(patient.id, viewer)
  const next = nextAppointment(patient.id, viewer)
  const seen = lastContact(patient.id, viewer)

  // A tab that says how much is behind it stops the record feeling like an
  // unknown quantity — and stops someone opening five empty tabs to find out.
  const labelFor = (t: Tab) => {
    const n =
      t === 'Timeline' ? counts.timeline
      : t === 'Support' ? counts.support
      : t === 'Documents' ? counts.documents
      : t === 'Requests' ? counts.requests
      : t === 'Diary' ? counts.calendar
      : 0
    return t === 'Overview' || !n ? t : `${t} · ${n}`
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={patient.name}
        description={`${patient.age} · ${patient.pronouns} · ${patient.context}`}
        breadcrumbs={[{ label: 'People', to: `${base}/patients` }, { label: patient.name }]}
        actions={
          <>
            <Button onClick={() => askOrca(`Catch me up on ${patient.name}`)}>Ask ORCA about them</Button>
            <LinkButton to={`${base}/add?patient=${patient.id}`} variant="primary">
              Add information
            </LinkButton>
          </>
        }
      />

      {/* One strip, three facts, every role. Everything else is behind a tab. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[20px] bg-surface-2 px-5 py-3 text-[0.85rem]">
        {next ? (
          <span className="text-muted">
            Next:{' '}
            <span className="text-ink">
              {formatDateTime(next.datetime)} · {next.purpose}
            </span>
          </span>
        ) : null}
        <span className="text-muted">
          Last entry:{' '}
          <span className="text-ink">{seen ? `${formatDate(seen.date)} · ${seen.by}` : 'none yet'}</span>
        </span>
        {next ? (
          <span className="ml-auto">
            <StatusPill status={next.status} />
          </span>
        ) : null}
      </div>

      <div role="tablist" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === viewing}
            onClick={() => navigate(`${base}/patients/${patient.id}/${slug(t)}`)}
            className={`-mb-px border-b-2 px-3 py-2 text-[0.85rem] font-medium ${
              t === viewing ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {labelFor(t)}
          </button>
        ))}
      </div>

      {viewing === 'Overview' ? <Overview patientId={patient.id} base={base} role={viewer} tabs={TABS} /> : null}
      {viewing === 'Timeline' ? <Timeline patientId={patient.id} role={viewer} /> : null}
      {viewing === 'Support' ? <Support patientId={patient.id} base={base} /> : null}
      {viewing === 'Documents' ? <Documents patientId={patient.id} role={viewer} /> : null}
      {viewing === 'Requests' ? <Requests patientId={patient.id} role={viewer} /> : null}
      {viewing === 'Diary' ? <Diary patientId={patient.id} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

/**
 * The two questions somebody actually opens a record with: what has moved, and
 * what does my own job need from it. Both derived from this patient's rows.
 */
function Overview({
  patientId,
  base,
  role,
  tabs,
}: {
  patientId: string
  base: string
  role: Role
  tabs: Tab[]
}) {
  const changed = whatChanged(patientId, role)
  const lens = roleLens(role, patientId)
  // Goals, session notes and internal tasks are the care team's. An
  // organisation reading this record gets what it was asked for and what it
  // was given, and nothing about how the person is being looked after.
  const inTeam = CLINICAL_VIEW.has(role) || role === 'patient'
  const goals = inTeam ? profileFor(patientId).filter((p) => p.section === 'Current goals') : []
  const notes = inTeam ? sessionNotes.filter((n) => n.patientId === patientId) : []
  const open = inTeam ? tasks.filter((t) => t.patientId === patientId) : []

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <Card className="mb-6">
          <CardHead title="What has changed" meta="Last six weeks" />
          <CardBody>
            {changed.length ? (
              <>
                <ul className="space-y-3 text-[0.88rem] leading-relaxed text-ink">
                  {changed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <AiProvenance />
              </>
            ) : (
              <p className="text-[0.86rem] leading-relaxed text-muted">
                Nothing has been recorded in the last six weeks. That is a fact about the record,
                not about the person.
              </p>
            )}
          </CardBody>
        </Card>

        {lens ? (
          <Card className="mb-6">
            <CardHead title={lens.title} meta="Drawn from this record" />
            <CardBody>
              <DefinitionList items={lens.items} />
            </CardBody>
          </Card>
        ) : null}

        {inTeam ? (
        <Section title="Current goals" count={goals.length} summary={goals[0]?.text}>
          <Card>
            <CardBody>
              {goals.length ? (
                <ul className="space-y-2 text-[0.87rem] leading-relaxed text-ink">
                  {goals.map((g) => (
                    <li key={g.id}>{g.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.86rem] text-muted">No goals recorded.</p>
              )}
            </CardBody>
          </Card>
        </Section>
        ) : null}
      </div>

      <div>
        {inTeam ? (
        <Section title="Professional input" count={notes.length} important>
          <Card>
            <CardBody>
              {notes.length ? (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-[0.86rem]">
                      <span className="text-ink">{personName(n.professionalId)}</span>
                      <span className="block text-[0.79rem] text-muted">
                        {formatDate(n.date)} · session note ({n.status})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.85rem] text-muted">Nobody has written a note yet.</p>
              )}
            </CardBody>
          </Card>
        </Section>
        ) : null}

        {inTeam ? (
        <Section title="Open tasks" count={open.length} summary={open[0]?.title}>
          <Card>
            <CardBody>
              {open.length ? (
                <ul className="space-y-2 text-[0.86rem] text-ink">
                  {open.map((t) => (
                    <li key={t.id}>
                      {t.title}
                      <span className="block text-[0.79rem] text-muted">Due {formatDate(t.due)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.85rem] text-muted">Nothing outstanding.</p>
              )}
            </CardBody>
          </Card>
        </Section>
        ) : null}

        <Section title="Elsewhere in this record">
          <Card>
            <CardBody className="space-y-2">
              {tabs.filter((t) => t !== 'Overview').map((t) => (
                <Link
                  key={t}
                  to={`${base}/patients/${patientId}/${slug(t)}`}
                  className="block text-[0.86rem] text-ink hover:underline"
                >
                  {t}
                </Link>
              ))}
            </CardBody>
          </Card>
        </Section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ timeline */

function Timeline({ patientId, role }: { patientId: string; role: Role }) {
  const [filter, setFilter] = useState('All')
  // Scoped per event, not per record. An employer opening somebody's timeline
  // must not read their psychiatry entries because the name at the top is the
  // same one they are entitled to see.
  const all = visibleEvents(patientId, role)
  const events = all.filter((e) => filter === 'All' || e.category === filter)
  // Only offer a filter the record can actually satisfy. A chip row of nine
  // categories where seven return nothing teaches people the filters are broken.
  const categories = ['All', ...new Set(all.map((e) => e.category))]

  if (!all.length) {
    return (
      <EmptyState
        title="Nothing here for you"
        detail="Either nothing has been recorded, or none of it is shared with your role."
      />
    )
  }

  return (
    <>
      <div className="mb-4">
        <FilterChips options={categories} active={filter} onChange={setFilter} />
      </div>
      <Card>
        <Table
          columns={['Date', 'Event', 'Category', 'Source', 'Evidence']}
          rows={events.map((e) => ({
            key: e.id,
            cells: [
              formatDate(e.date),
              e.title,
              e.category,
              e.sourceId === 'orca' ? 'ORCA' : personName(e.sourceId),
              <EvidenceTag key="ev" status={e.evidence} />,
            ],
          }))}
        />
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------- support */

function Support({ patientId, base }: { patientId: string; base: string }) {
  const strategies = strategiesFor(patientId)
  if (!strategies.length) {
    return <EmptyState title="No strategies yet" detail="Nothing has been tried and recorded here." />
  }

  const live = strategies.filter((s) => s.status !== 'Completed')
  const done = strategies.filter((s) => s.status === 'Completed')

  const list = (items: typeof strategies) => (
    <Card>
      <CardBody>
        <ul className="space-y-4">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link to={`${base}/strategies/${s.id}`} className="text-[0.89rem] font-medium text-ink hover:underline">
                  {s.title}
                </Link>
                <p className="text-[0.82rem] text-muted">
                  {s.checkIns.length} check-ins · review {formatDate(s.reviewDate)} · owner {personName(s.ownerId)}
                </p>
                {s.outcome ? (
                  <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">
                    {s.outcome.effectiveness} — {s.outcome.summary}
                  </p>
                ) : null}
              </div>
              <StatusPill status={s.status} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )

  return (
    <>
      <Section title="In progress" count={live.length} important>
        {live.length ? list(live) : <p className="text-[0.86rem] text-muted">Nothing running.</p>}
      </Section>
      {done.length ? (
        <Section title="Finished" count={done.length} summary="Kept, because what did not work is evidence too.">
          {list(done)}
        </Section>
      ) : null}
    </>
  )
}

/* ----------------------------------------------------------------- documents */

function Documents({ patientId, role }: { patientId: string; role: Role }) {
  const docs = documentsFor(patientId).filter((d) => d.access.includes(role))
  const hidden = documentsFor(patientId).length - docs.length

  return (
    <>
      <UploadPanel patientId={patientId} />

      <Section title="On this record" count={docs.length} important>
        {docs.length ? (
          <Card>
            <Table
              columns={['Document', 'Category', 'Date', 'From', 'Status']}
              rows={docs.map((d) => ({
                key: d.id,
                cells: [d.title, d.category, formatDate(d.date), personName(d.sourceId), d.status],
              }))}
            />
          </Card>
        ) : (
          <EmptyState title="Nothing shared with you" detail="Documents appear here when they are within your access." />
        )}
      </Section>

      {hidden > 0 ? (
        <p className="text-[0.83rem] leading-relaxed text-muted">
          {hidden} further {hidden === 1 ? 'document is' : 'documents are'} on this record and not shared
          with your role. That is a count, not a summary — nothing about their content is shown.
        </p>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ requests */

function Requests({ patientId, role }: { patientId: string; role: Role }) {
  // A request raised with the university is not the employer's to read.
  const all = requestsFor(patientId).filter(
    (r) => role === 'patient' || r.destinationRole === role || CLINICAL_VIEW.has(role),
  )
  if (!all.length) return <EmptyState title="No requests" detail="Nothing has been asked of anybody yet." />

  const open = all.filter((r) => r.status !== 'Completed')
  const closed = all.filter((r) => r.status === 'Completed')

  const rows = (items: typeof all) => (
    <Card>
      <Table
        columns={['Request', 'To', 'Raised', 'With', 'Status']}
        rows={items.map((r) => ({
          key: r.id,
          cells: [
            r.title,
            r.destination,
            formatDate(r.raised),
            r.currentOwner,
            <StatusPill key="s" status={r.status} />,
          ],
        }))}
      />
    </Card>
  )

  return (
    <>
      <Section title="Open" count={open.length} important>
        {open.length ? rows(open) : <p className="text-[0.86rem] text-muted">Nothing outstanding.</p>}
      </Section>
      {closed.length ? (
        <Section title="Closed" count={closed.length}>{rows(closed)}</Section>
      ) : null}
    </>
  )
}

/* --------------------------------------------------------------------- diary */

function Diary({ patientId }: { patientId: string }) {
  const all = appointmentsFor(patientId)
  if (!all.length) return <EmptyState title="Nothing in the diary" detail="No appointments on this record." />

  return (
    <Card>
      <Table
        columns={['When', 'Purpose', 'With', 'Where', 'Status']}
        rows={all.map((a) => ({
          key: a.id,
          cells: [
            formatDateTime(a.datetime),
            a.purpose,
            a.professionalId ? personName(a.professionalId) : '—',
            a.location,
            <StatusPill key="s" status={a.status} />,
          ],
        }))}
      />
    </Card>
  )
}
