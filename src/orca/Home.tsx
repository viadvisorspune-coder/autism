/**
 * Ananya's front door, and the only screen in ORCA that is a summary.
 *
 * WHY SHE GETS ONE AND NOBODY ELSE DOES. Every other person arrives to do a
 * thing: a coordinator wants the open tasks, an employer wants what is waiting
 * on them, a clinician wants the caseload. Their landing screen is the work.
 * Ananya arrives without a task, most often just to see where things stand, and
 * dropping her into a chat box made her supply the reason for the visit before
 * the product had told her anything at all.
 *
 * THREE THINGS, AND THEY ARE THE THREE QUESTIONS. What is happening today, what
 * has been added since I last looked, and what is waiting on me. Those are the
 * questions somebody actually opens their own record to answer, in that order,
 * and each one is a count and a short list rather than a feed. A fourth card
 * was drafted and cut: any card here that is not one of those three is the
 * product deciding her attention is available.
 *
 * IT SUMMARISES, IT DOES NOT INTERPRET. Every line on this screen is something
 * already written down by somebody, shown with its author and its date. Nothing
 * here is generated, scored, ranked by importance, or described in words other
 * than the ones the entry was written in. A home screen that told Ananya her
 * week had been difficult would be an unattributed clinical claim on the first
 * screen she sees, and it is the easiest place in the product to accidentally
 * build one.
 *
 * NOTHING HERE IS URGENT-LOOKING. No red, no bold counts that grow, no "3 items
 * need your attention". The waiting card carries a number because a number is a
 * fact; it does not carry a colour that says how she should feel about it.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { useLive } from '../lib/live'
import type { PendingApproval } from '../components/ApprovalPanel'
import { useAsks } from './asks'
import { useSubject } from './subject'
import { CouldNotLoad, Updated, longDate } from './parts'
import { greetingName } from './system'
import {
  IconAppointments,
  IconArrow,
  IconBell,
  IconChevron,
  IconDocuments,
  IconRecord,
  IconSearch,
  Whale,
} from './icons'

interface Appointment {
  id: string
  scheduled_for: string
  purpose: string
  location?: string | null
  status?: string
  professional_id?: string | null
}

interface Entry {
  id: string
  title: string
  category?: string | null
  recorded_on?: string
  occurred_on?: string
  source_id?: string | null
  source_label?: string | null
}

/**
 * The greeting, from the clock and nothing else.
 *
 * Read once at mount rather than during render — a component that reads the
 * time while rendering produces a different tree on every re-render, and this
 * one re-renders on every poll. It also means the greeting does not silently
 * change from "morning" to "afternoon" underneath somebody mid-sentence.
 */
function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** How long ago, in the words a person would use. Never more precise than true. */
function ago(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const days = Math.floor((now - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return longDate(iso.slice(0, 10))
}

/** The time of day on its own, for a row that already says which day it is. */
function clock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function Home() {
  const { option } = useSession()
  const { subjectId } = useSubject()
  const { ask, waiting } = useAsks()
  const navigate = useNavigate()

  // Taken once, at mount. See `greeting` above.
  const [now] = useState(() => Date.now())
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)

  const diary = useLive<{ appointments: Appointment[] }>('calendar', subjectId)
  const record = useLive<{ events: Entry[]; people: Record<string, { name?: string }> }>(
    'timeline',
    subjectId,
  )
  const gates = useLive<{ approvals: PendingApproval[] }>('approvals', subjectId)

  // Not `split(' ')[0]`. See `greetingName` — that rule greets a consultant
  // psychologist as "Dr", and Ananya is not the only account that ever reaches
  // a greeting.
  const firstName = greetingName(option?.name) || 'there'

  /**
   * Today and the next few days, not "today" alone.
   *
   * A card headed "Today's plan" that is empty five days a week teaches people
   * to stop reading it. It shows what is next when today is clear, and says
   * which day that is, so the heading is never lying about what is under it.
   */
  const upcoming = useMemo(() => {
    const rows = (diary.data?.appointments ?? [])
      .filter((a) => Date.parse(a.scheduled_for) >= now - 3 * 3_600_000)
      .sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for))
    return rows.slice(0, 3)
  }, [diary.data, now])

  const todayOnly = useMemo(() => {
    const today = new Date(now).toISOString().slice(0, 10)
    return upcoming.filter((a) => a.scheduled_for.slice(0, 10) === today)
  }, [upcoming, now])

  const added = useMemo(() => (record.data?.events ?? []).slice(0, 3), [record.data])

  const pending = useMemo(
    () => (gates.data?.approvals ?? []).filter((a) => a.status === 'Awaiting approval').slice(0, 3),
    [gates.data],
  )

  /**
   * Every read failed, so this is a blank screen and not a quiet life.
   *
   * Three empty cards are indistinguishable from three cards with nothing in
   * them, and the difference is the whole point: "nothing is waiting on you" is
   * something to act on and "we could not find out" is not.
   */
  const allFailed = diary.failed && record.failed && gates.failed

  const send = async () => {
    const body = question.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const id = await ask(body)
      navigate(`/ask/${id}`)
    } finally {
      setSending(false)
    }
  }

  const lastRead = record.updatedAt ?? diary.updatedAt ?? gates.updatedAt

  return (
    <>
      <div className="o-topbar">
        <Link
          to="/record"
          className="o-row max-w-xs flex-1 !py-2.5 no-underline"
          aria-label="Search your record"
        >
          <IconSearch size={18} />
          <span className="o-row-meta !mt-0">Search your record…</span>
        </Link>
        <Link
          to="/decisions"
          className="o-row !w-auto !px-3 no-underline"
          aria-label={
            waiting > 0 ? `Decisions, ${waiting} waiting` : 'Decisions, nothing waiting'
          }
        >
          <IconBell size={18} />
          {waiting > 0 ? <span className="o-count">{waiting}</span> : null}
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="o-title">
          {greeting(new Date(now).getHours())}, {firstName}
        </h1>
        <p className="o-body mt-2" style={{ color: 'var(--ink-2)' }}>
          Here is what is on your record today. Nothing here was written by ORCA.
        </p>
      </header>

      {allFailed ? (
        <div className="mb-8">
          <CouldNotLoad what="your record" onRetry={record.refresh} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------ today */}
        <section className="o-tile o-tile-plan" aria-labelledby="home-plan">
          <div className="o-tile-head">
            <h2 id="home-plan" className="o-h3">
              {todayOnly.length ? "Today's plan" : 'Coming up'}
            </h2>
            <IconAppointments size={18} />
          </div>

          {diary.loading && !diary.data ? (
            <p className="o-row-meta">Reading your diary…</p>
          ) : upcoming.length ? (
            <ul className="flex flex-col gap-2.5">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="o-row-title truncate">{a.purpose}</span>
                  <span className="o-row-meta !mt-0 shrink-0">
                    {a.scheduled_for.slice(0, 10) === new Date(now).toISOString().slice(0, 10)
                      ? clock(a.scheduled_for)
                      : longDate(a.scheduled_for.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="o-row-meta">
              Nothing in the diary. Appointments appear here once someone books one.
            </p>
          )}

          <Link to="/appointments" className="o-chip mt-4 self-start no-underline">
            View full schedule <IconChevron size={14} />
          </Link>
        </section>

        {/* -------------------------------------------------------- new */}
        <section className="o-tile o-tile-new" aria-labelledby="home-new">
          <div className="o-tile-head">
            <h2 id="home-new" className="o-h3">
              What is new
            </h2>
            <IconRecord size={18} />
          </div>

          {record.loading && !record.data ? (
            <p className="o-row-meta">Reading your record…</p>
          ) : added.length ? (
            <ul className="flex flex-col gap-2.5">
              {added.map((e) => (
                <li key={e.id}>
                  <span className="o-row-title block truncate">{e.title}</span>
                  <span className="o-row-meta">
                    {record.data?.people?.[String(e.source_id)]?.name ??
                      e.source_label ??
                      'Added to your record'}
                    {' · '}
                    {ago(e.recorded_on ?? e.occurred_on, now)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="o-row-meta">Nothing has been added recently.</p>
          )}

          <Link to="/record" className="o-chip mt-4 self-start no-underline">
            View all updates <IconChevron size={14} />
          </Link>
        </section>

        {/* ---------------------------------------------------- waiting */}
        <section className="o-tile o-tile-waiting" aria-labelledby="home-waiting">
          <div className="o-tile-head">
            <h2 id="home-waiting" className="o-h3">
              Waiting for you{' '}
              {pending.length ? <span className="o-count">{pending.length}</span> : null}
            </h2>
            <IconDocuments size={18} />
          </div>

          {gates.loading && !gates.data ? (
            <p className="o-row-meta">Checking…</p>
          ) : pending.length ? (
            <ul className="flex flex-col gap-2.5">
              {pending.map((a) => (
                <li key={a.request_id}>
                  <span className="o-row-title block truncate">{a.title}</span>
                  <span className="o-row-meta">{ago(a.created_at, now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            /*
             * Said as a fact about the record, not as praise.
             *
             * "You're all caught up!" is the interface congratulating somebody
             * for the absence of work other people did not send them, and it
             * reads as cheerful noise on the days it is least welcome.
             */
            <p className="o-row-meta">
              Nothing is waiting on a decision from you. Nothing has been sent to anyone.
            </p>
          )}

          <Link to="/decisions" className="o-chip mt-4 self-start no-underline">
            Go to decisions <IconChevron size={14} />
          </Link>
        </section>
      </div>

      {/* ---------------------------------------------------------- ask */}
      <section className="o-invite mt-4" aria-labelledby="home-ask">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1" style={{ minWidth: '260px' }}>
            <h2 id="home-ask" className="o-h2" style={{ color: 'var(--accent)' }}>
              Ask ORCA
            </h2>
            <p className="o-body o-measure mt-2" style={{ color: 'var(--ink-2)' }}>
              I answer from your record, and I name the entries every answer rests on. Nothing is
              sent to anyone unless you decide to send it.
            </p>

            <form
              className="relative mt-5"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <label htmlFor="home-ask-input" className="sr-only">
                Ask anything about your record
              </label>
              <input
                id="home-ask-input"
                className="o-input-pill"
                placeholder="Ask anything about your record…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                autoComplete="off"
              />
              <button
                type="submit"
                className="o-send"
                disabled={!question.trim() || sending}
                aria-label={sending ? 'Sending your question' : 'Send your question'}
              >
                <IconArrow size={18} />
              </button>
            </form>

            <div className="o-chips mt-4">
              <span className="o-row-meta !mt-0">Try asking</span>
              {[
                'Can you summarise my OT progress?',
                'When is my next appointment?',
                'What accommodations do I have at work?',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="o-chip"
                  onClick={() => setQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div aria-hidden className="hidden shrink-0 lg:block" style={{ color: 'var(--accent)' }}>
            <Whale size={200} />
          </div>
        </div>
      </section>

      <div className="mt-6">
        <Updated at={lastRead} />
      </div>
    </>
  )
}
