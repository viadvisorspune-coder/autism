/**
 * The administrator, served by absence.
 *
 * Three screens, pure black and white, and — the important part — NO ASK BOX.
 * Tejas has no conversational interface onto the record at all, because there
 * is nothing he may ask it. That is a stronger claim than refusing his
 * questions would be: the capability does not exist in his interface, so there
 * is nothing to enforce, nothing to get wrong, and nothing to be tempted by.
 *
 * What he sees is that runs happen, who holds access to which record, and
 * whether the platform is working. Never a name attached to a question, never
 * the text of one, never an answer.
 */
import { useMemo, useState } from 'react'
import { useLive } from '../lib/live'
import { connections, patients, people } from '../data/db'
import { isSupabaseConfigured } from '../lib/supabase'
import { CouldNotLoad, Loading, Nothing, PageTitle, SectionHead, Updated, longDate } from './parts'

interface AdminRun {
  id: string
  patient_id: string | null
  type: string | null
  status: string | null
  current_step: string | null
  workflow_name: string | null
  started_at: string | null
  finished_at: string | null
  updated_at: string | null
}

function useRuns() {
  // Explicitly null: this read is not about one record, and letting it default
  // to the session's would silently scope the platform view to one person.
  return useLive<{ runs: AdminRun[] }>('workflow_runs', null)
}

/** How long a run took, or how long it has been going. */
function duration(run: AdminRun): string {
  if (!run.started_at) return '—'
  const end = run.finished_at ?? run.updated_at
  if (!end) return 'running'
  const ms = Date.parse(end) - Date.parse(run.started_at)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return 'under a second'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function stamp(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const FAILED = new Set(['Blocked', 'Cancelled', 'Escalated'])

export function Runs() {
  const { data, loading, failed, updatedAt, refresh } = useRuns()
  const runs = data?.runs ?? []

  const [status, setStatus] = useState('Everything')
  const [workflow, setWorkflow] = useState('Everything')
  const [today, setToday] = useState(false)

  /**
   * Keyed on the read, not on `runs`.
   *
   * `data?.runs ?? []` is a new array on every render, so these recomputed on
   * every one of the four-second polls and memoized nothing -- two set builds a
   * second over a hundred rows to produce the same two filter lists.
   */
  const statuses = useMemo(
    () => ['Everything', ...new Set((data?.runs ?? []).map((r) => r.status ?? 'Unknown'))],
    [data],
  )
  const workflows = useMemo(
    () => [
      'Everything',
      ...new Set((data?.runs ?? []).map((r) => r.workflow_name ?? r.type ?? 'Unknown')),
    ],
    [data],
  )

  const shown = runs.filter((r) => {
    if (status !== 'Everything' && (r.status ?? 'Unknown') !== status) return false
    if (workflow !== 'Everything' && (r.workflow_name ?? r.type ?? 'Unknown') !== workflow) return false
    if (today) {
      const d = r.started_at ? new Date(r.started_at) : null
      if (!d || d.toDateString() !== new Date().toDateString()) return false
    }
    return true
  })

  return (
    <>
      <PageTitle
        sub="A run is a piece of work the platform did. What it was about is not shown here, and cannot be."
      >
        Runs
      </PageTitle>

      <div className="mb-10 space-y-5">
        <Filter label="Status" value={status} options={statuses} onChange={setStatus} />
        <Filter label="Workflow" value={workflow} options={workflows} onChange={setWorkflow} />
        <div>
          <button
            type="button"
            aria-pressed={today}
            className={`o-btn o-btn-small ${today ? 'o-btn-on' : ''}`}
            onClick={() => setToday((t) => !t)}
          >
            Today only
          </button>
        </div>
      </div>

      {failed ? <CouldNotLoad what="The run log" onRetry={refresh} /> : null}
      {loading && !runs.length && !failed ? <Loading what="the run log" /> : null}
      {!loading && !shown.length && !failed ? (
        <Nothing>No runs match those filters.</Nothing>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">Workflow runs, newest first</caption>
          <thead>
            <tr className="border-b border-black text-left">
              {['Run', 'Workflow', 'Subject', 'Status', 'Took', 'Started'].map((h) => (
                <th key={h} className="o-meta py-3 pr-6 font-semibold text-black">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-black align-top">
                <td className="o-meta py-4 pr-6 font-mono">{r.id.slice(0, 8)}</td>
                <td className="o-meta py-4 pr-6">{r.workflow_name ?? r.type ?? '—'}</td>
                {/* The subject identifier and nothing else. No names here: the
                    administrator can see that a run touched a record without
                    learning whose life it is. */}
                <td className="o-meta py-4 pr-6 font-mono">{r.patient_id ?? '—'}</td>
                <td className="o-meta py-4 pr-6">{r.status ?? '—'}</td>
                <td className="o-meta py-4 pr-6 tabular-nums">{duration(r)}</td>
                <td className="o-meta py-4 pr-6 tabular-nums">{stamp(r.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="o-meta o-measure mt-8">
        Question text, answer content and subject names are not part of this view and are not
        loaded into it.
      </p>

      {/*
        Freshness matters more here than anywhere else in the product. This is
        the screen somebody watches while a run is in flight, and a table that
        has quietly stopped refreshing looks exactly like a run that has quietly
        stopped moving.
      */}
      <Updated at={updatedAt} />
    </>
  )
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="o-meta mb-2">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`o-btn o-btn-small ${value === o ? 'o-btn-on' : ''}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Who holds access to which record.
 *
 * A list of relationships. Never content — which is the whole distinction the
 * administrator's role rests on: he governs who may read, and is not himself a
 * reader.
 */
export function Access() {
  const rows = useMemo(
    () =>
      connections
        .map((c) => ({
          connection: c,
          person: people.find((p) => p.id === c.personId),
          subject: patients.find((p) => p.id === c.patientId),
        }))
        .filter((r) => r.person)
        .sort((a, b) => (a.subject?.id ?? '').localeCompare(b.subject?.id ?? '')),
    [],
  )

  return (
    <>
      <PageTitle sub="Who may read which record, and on what basis. No record content appears on this screen.">
        Access
      </PageTitle>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">Access relationships</caption>
          <thead>
            <tr className="border-b border-black text-left">
              {['Person', 'Role', 'Subject', 'Since', 'Consent', 'Review due'].map((h) => (
                <th key={h} className="o-meta py-3 pr-6 font-semibold text-black">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ connection, person, subject }) => (
              <tr key={connection.id} className="border-b border-black align-top">
                <td className="o-meta py-4 pr-6">{person?.name}</td>
                <td className="o-meta py-4 pr-6">{person?.role}</td>
                <td className="o-meta py-4 pr-6 font-mono">{subject?.id ?? connection.patientId}</td>
                <td className="o-meta py-4 pr-6">{longDate(connection.consentGiven)}</td>
                <td className="o-meta py-4 pr-6">{connection.consentStatus}</td>
                <td className="o-meta py-4 pr-6">{longDate(connection.reviewDue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Health — operational only.
 *
 * Counted from the run log rather than asserted, so the numbers are the same
 * numbers the Runs screen shows. A dashboard whose figures disagree with the
 * table underneath it is worse than no dashboard.
 */
export function Health() {
  const { data, loading, failed } = useRuns()
  const runs = data?.runs ?? []

  const open = runs.filter((r) => r.status === 'In progress' || r.status === 'Queued')
  const waiting = runs.filter((r) => (r.status ?? '').startsWith('Awaiting'))
  // Named apart from the read's own `failed`: one is "runs that did not
  // complete", the other is "this screen could not find out". Sharing a name
  // made the second silently shadow the first.
  const notCompleted = runs.filter((r) => FAILED.has(r.status ?? ''))
  const done = runs.filter((r) => r.status === 'Completed')
  const rate = runs.length ? Math.round((notCompleted.length / runs.length) * 100) : 0

  return (
    <>
      <PageTitle sub="Counted from the last twenty-five runs. Operational only.">Health</PageTitle>

      <section>
        <SectionHead>Endpoints</SectionHead>
        <dl className="space-y-5">
          <Line
            label="Record and workflow API"
            value={
              !isSupabaseConfigured
                ? 'Not configured in this build'
                : failed
                  ? 'Not answering'
                  : 'Answering'
            }
          />
          <Line
            label="Run log"
            value={loading && !runs.length ? 'Reading' : `${runs.length} runs visible`}
          />
        </dl>
      </section>

      <section className="o-section">
        <SectionHead>Queue</SectionHead>
        <dl className="space-y-5">
          <Line label="Running now" value={String(open.length)} />
          <Line label="Stopped for a person" value={String(waiting.length)} />
          <Line label="Finished" value={String(done.length)} />
        </dl>
        <p className="o-meta o-measure mt-6">
          A run stopped for a person is not a fault. It is the platform waiting for a decision,
          and it waits as long as it takes.
        </p>
      </section>

      <section className="o-section">
        <SectionHead>Errors</SectionHead>
        <dl className="space-y-5">
          <Line label="Runs that did not complete" value={String(notCompleted.length)} />
          <Line label="Share of runs" value={`${rate}%`} />
        </dl>
      </section>
    </>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-black pb-4">
      <dt className="o-body w-64 shrink-0 font-semibold">{label}</dt>
      <dd className="o-body tabular-nums">{value}</dd>
    </div>
  )
}

/* -------------------------------------------------------------- incidents */

/**
 * Incidents — the audit story made operational.
 *
 * Every refusal this platform has ever produced already exists: `recordAudit`
 * writes a row whenever somebody is stopped, and the result column says
 * `Denied`. Nothing has ever read them. A governance model whose refusals are
 * invisible is a governance model nobody can check, which is the same as not
 * having one.
 *
 * WHAT LANDS HERE. An approval decided by somebody it was not addressed to. A
 * write attempted outside a person's scope. A disclosure blocked before it
 * left. A signature that did not verify. Each of those is the model working —
 * the incident is not that ORCA failed, it is that ORCA stopped something — and
 * that is exactly why it is worth a screen rather than a log file.
 *
 * STILL NO CONTENT. The administrator sees who was stopped, doing what, to
 * which record, and why. He does not see what the record says, and this screen
 * changes nothing about that: the reason column holds the refusal's reason,
 * never the information that was refused.
 *
 * REVIEWED IS LOCAL AND SAYS SO. There is no column in the audit table for it —
 * an audit log that can be edited from the interface it audits is not an audit
 * log. So "reviewed" is a note this browser keeps about what its user has read,
 * marked as such rather than dressed up as a workflow.
 */
const DENIED = new Set(['Denied', 'Blocked', 'Refused', 'Failed'])
const REVIEWED_KEY = 'orca:incidents-reviewed'

function readReviewed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(REVIEWED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function Incidents() {
  const { data, loading, failed, updatedAt, refresh } = useLive<{ entries: AuditRow[] }>(
    'audit',
    null,
    15000,
  )
  const [reviewed, setReviewed] = useState<Set<string>>(readReviewed)
  const [showReviewed, setShowReviewed] = useState(false)

  const incidents = useMemo(
    () => (data?.entries ?? []).filter((e) => DENIED.has(String(e.result ?? ''))),
    [data],
  )
  const outstanding = incidents.filter((e) => !reviewed.has(e.id))
  const seen = incidents.filter((e) => reviewed.has(e.id))

  function markReviewed(id: string) {
    const next = new Set(reviewed)
    next.add(id)
    setReviewed(next)
    try {
      localStorage.setItem(REVIEWED_KEY, JSON.stringify([...next]))
    } catch {
      /* Private browsing. The mark applies for this session only. */
    }
  }

  return (
    <>
      <PageTitle sub="Every time this platform stopped something. Who was stopped, doing what, and why — never what the record says.">
        {loading && !data
          ? 'Incidents'
          : outstanding.length === 0
            ? 'Nothing is unreviewed'
            : outstanding.length === 1
              ? 'One incident to review'
              : `${outstanding.length} incidents to review`}
      </PageTitle>

      {loading && !data ? <Loading what="the audit log" /> : null}
      {failed ? <CouldNotLoad what="The audit log" onRetry={refresh} /> : null}

      {!loading && !incidents.length && !failed ? (
        <Nothing>
          Nothing has been refused. That is a real state and not an empty screen: every refusal
          this platform makes is written down, so an empty list means none were made rather than
          that none were recorded.
        </Nothing>
      ) : null}

      {outstanding.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Refusals and blocked actions, newest first</caption>
            <thead>
              <tr className="border-b border-black text-left">
                {['When', 'Who', 'Role', 'What they tried', 'Record', 'Why it was stopped', ''].map(
                  (h) => (
                    <th key={h} className="o-meta py-3 pr-6 font-semibold text-black">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {outstanding.map((e) => (
                <tr key={e.id} className="border-b border-black align-top">
                  <td className="o-meta py-4 pr-6 tabular-nums">{stamp(e.occurred_at)}</td>
                  <td className="o-meta py-4 pr-6">{e.actor_label ?? '—'}</td>
                  <td className="o-meta py-4 pr-6">{e.actor_role ?? '—'}</td>
                  <td className="o-meta py-4 pr-6">{e.action}</td>
                  <td className="o-meta py-4 pr-6 font-mono">{e.record ?? '—'}</td>
                  <td className="o-meta py-4 pr-6">{e.why ?? '—'}</td>
                  <td className="py-4 pr-6">
                    <button
                      type="button"
                      className="o-btn o-btn-small"
                      onClick={() => markReviewed(e.id)}
                    >
                      Mark reviewed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {seen.length ? (
        <section className="o-section">
          <SectionHead>Already reviewed</SectionHead>
          {/*
            Said plainly rather than implied. "Reviewed" here is a note this
            browser keeps about what its user has read — there is no column for
            it in the audit table, and adding one would mean an audit log that
            can be edited from the interface it audits.
          */}
          <p className="o-body o-measure mb-6">
            Marked on this device only. The audit log itself is unchanged and cannot be changed
            from here — an audit log editable from the interface it audits would not be one.
          </p>
          <button
            type="button"
            aria-expanded={showReviewed}
            onClick={() => setShowReviewed((s) => !s)}
            className="o-body underline"
          >
            {showReviewed ? 'Hide reviewed ▴' : `Show ${seen.length} reviewed ▾`}
          </button>
          <div className="o-reveal" data-open={showReviewed ? 'yes' : 'no'}>
            <div inert={!showReviewed}>
              <ul className="mt-6 space-y-4">
                {seen.map((e) => (
                  <li key={e.id} className="o-panel p-4">
                    <p className="o-body">{e.action}</p>
                    <p className="o-meta mt-1">
                      {[e.actor_label, e.actor_role, stamp(e.occurred_at)].filter(Boolean).join(' · ')}
                    </p>
                    {e.why ? <p className="o-meta mt-1">{e.why}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <p className="o-meta o-measure mt-8">
        Question text, answer content and subject names are not part of this view and are not
        loaded into it. The reason column holds why something was refused, never what was refused.
      </p>

      <Updated at={updatedAt} />
    </>
  )
}

interface AuditRow {
  id: string
  occurred_at: string
  actor_label?: string
  actor_role?: string
  action: string
  record?: string
  why?: string
  result?: string
}
