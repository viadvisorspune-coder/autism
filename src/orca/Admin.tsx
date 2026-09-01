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

  const statuses = useMemo(
    () => ['Everything', ...new Set(runs.map((r) => r.status ?? 'Unknown'))],
    [runs],
  )
  const workflows = useMemo(
    () => ['Everything', ...new Set(runs.map((r) => r.workflow_name ?? r.type ?? 'Unknown'))],
    [runs],
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
            className={`o-btn o-btn-small ${today ? 'o-btn-primary' : ''}`}
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
            className={`o-btn o-btn-small ${value === o ? 'o-btn-primary' : ''}`}
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
