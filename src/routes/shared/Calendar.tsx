import { useMemo, useState } from 'react'
import { Button, Card, CardBody, PageHeader, formatDate } from '../../components/ui'
import { actOnRecord, useLive } from '../../lib/live'
import { useSession } from '../../state/session'
import { useUI } from '../../state/ui'

/**
 * What is happening, and what somebody has asked to happen.
 *
 * Proposals and confirmed times share one list. From the point of view of a
 * person planning a week they are the same kind of object — a thing that may
 * happen on Tuesday — and the difference between them is whether it is settled,
 * which is a property of the row rather than a reason to keep two lists.
 *
 * Nothing here books anything. Either side can propose and the other agrees,
 * because a clinic offering a slot has not booked the person and a person
 * asking for one has not booked the clinician. Moving an agreed time un-agrees
 * it: somebody who said yes to Tuesday has not said yes to Thursday, and
 * sliding it silently would be exactly the unannounced change this record
 * exists to prevent.
 *
 * TWO PANES, NOT ONE. The first version of this screen was a list on its own,
 * on the argument that four appointments in six weeks do not need thirty
 * mostly-empty boxes. That is still true of the list — so the list stayed, and
 * it is still the thing that answers "what is next" and "is anyone waiting on
 * me". What it could not answer is the shape question: is that week already
 * heavy, is the assessment the day after the meeting. A grid answers that at a
 * glance and a list never does, so both are here, and each does the job it is
 * actually good at. Picking a day in the grid filters the list to it; the list
 * is where things get agreed, moved and cancelled.
 */

interface Appointment {
  id: string
  patient_id: string
  professional_id: string | null
  scheduled_for: string
  purpose: string
  location: string | null
  status: string
  preparation_status: string
  questions: string[]
}

interface CalendarData {
  appointments: Appointment[]
  people: Record<string, { name: string }>
  patients?: Record<string, { name: string }>
}

const PROPOSED = 'Awaiting stakeholder'
const DONE = new Set(['Completed', 'Cancelled'])

type View = 'day' | 'week' | 'month'

/**
 * `scope="mine"` is a person's own diary — every appointment they are party
 * to, across every record they hold a connection to. Without it, one record.
 *
 * Every route used to mount this with no props at all, and the default was the
 * demo patient, so a psychologist, an employer and an administrator all opened
 * the calendar and found the same four appointments in it. The scope is now
 * something a route has to say out loud.
 */
export default function Calendar({
  patientId,
  scope = 'record',
}: {
  patientId?: string
  scope?: 'record' | 'mine'
}) {
  const { role, option } = useSession()
  const { say } = useUI()
  // A diary read is keyed on the person, not the record: `null` tells the
  // server to answer with what this actor is party to.
  const readFor = scope === 'mine' ? null : (patientId ?? 'pt-ananya')
  const { data, refresh } = useLive<CalendarData>('calendar', readFor, 15000)
  const [busy, setBusy] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [picked, setPicked] = useState<string | null>(null)

  const appointments = data?.appointments ?? []
  const mine = scope === 'mine'

  // Who the other party is. In your own diary that is the patient; in
  // somebody's record it is the clinician they are seeing.
  const nameOf = (a: Appointment) =>
    mine
      ? (data?.patients?.[a.patient_id]?.name ?? 'a patient')
      : a.professional_id
        ? (data?.people?.[a.professional_id]?.name ?? 'your clinician')
        : 'someone yet to be assigned'

  const isPatient = role === 'patient'
  const upcoming = appointments.filter((a) => !DONE.has(a.status))
  const waiting = upcoming.filter((a) => a.status === PROPOSED)
  const past = appointments.filter((a) => DONE.has(a.status))

  // One pass, reused by every cell in the grid.
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of appointments) {
      const when = new Date(a.scheduled_for)
      if (Number.isNaN(when.getTime())) continue
      const key = dayKey(when)
      const bucket = map.get(key)
      if (bucket) bucket.push(a)
      else map.set(key, [a])
    }
    for (const bucket of map.values()) {
      bucket.sort((x, y) => x.scheduled_for.localeCompare(y.scheduled_for))
    }
    return map
  }, [appointments])

  // Waiting first, because those are the ones that need something from you.
  const listed = picked
    ? (byDay.get(picked) ?? [])
    : [...waiting, ...upcoming.filter((a) => a.status !== PROPOSED)]

  function move(by: -1 | 1) {
    setCursor((c) => (view === 'month' ? addMonths(c, by) : addDays(c, by * (view === 'week' ? 7 : 1))))
    setPicked(null)
  }

  function today() {
    const now = startOfDay(new Date())
    setCursor(now)
    setPicked(dayKey(now))
  }

  async function answer(
    appointment: Appointment,
    choice: 'accept' | 'decline' | 'reschedule',
    when?: string,
  ) {
    const id = appointment.id
    setBusy(id)
    // The record it belongs to, not the one this screen happens to be showing.
    const result = await actOnRecord('answer_appointment', appointment.patient_id, option?.personId ?? '', {
      appointment_id: id,
      answer: choice,
      scheduled_for: when,
    })
    setBusy(null)
    say(
      result.ok
        ? choice === 'accept'
          ? 'Agreed. It is in your calendar.'
          : choice === 'decline'
            ? 'Cancelled. Nothing is booked.'
            : 'A different time has been suggested.'
        : (result.error ?? 'That could not be saved.'),
    )
    if (result.ok) refresh()
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendar"
        description={
          isPatient
            ? 'Everything arranged, and anything anyone has asked to arrange. Nothing is booked until you agree to it.'
            : mine
              ? 'Your own appointments, across everyone you are connected to. Times proposed but not yet agreed are shown too.'
              : 'Appointments with this person, including times proposed but not yet agreed.'
        }
        actions={
          <Button variant="primary" onClick={() => setProposing((v) => !v)}>
            {proposing ? 'Cancel' : 'Propose a time'}
          </Button>
        }
      />

      {proposing ? (
        <Propose
          patientId={mine ? null : (patientId ?? 'pt-ananya')}
          choices={mine ? (data?.patients ?? {}) : {}}
          day={picked}
          onDone={() => {
            setProposing(false)
            refresh()
          }}
        />
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* --------------------------------------------------- the list */}
        <section aria-label="Appointments">
          <h2 className="text-[1.25rem] font-semibold tracking-[-0.01em] text-ink">
            {picked ? longDay(picked) : 'Upcoming'}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.85rem] text-muted">
            {picked
              ? `${listed.length === 0 ? 'Nothing' : listed.length === 1 ? 'One thing' : `${listed.length} things`} on this day`
              : waiting.length
                ? `${waiting.length} waiting on an answer`
                : 'Nothing is waiting on you'}
            {picked ? (
              <button
                onClick={() => setPicked(null)}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                Show everything
              </button>
            ) : null}
          </p>

          <div className="mt-4 space-y-3">
            {listed.length ? (
              listed.map((a) => (
                <EventRow
                  key={a.id}
                  appointment={a}
                  who={nameOf(a)}
                  patientId={a.patient_id}
                  actorId={option?.personId ?? ''}
                  busy={busy === a.id}
                  onAnswer={answer}
                  onChanged={refresh}
                />
              ))
            ) : (
              <Card>
                <CardBody>
                  <p className="text-[0.88rem] leading-relaxed text-muted">
                    {picked
                      ? 'Nothing on this day.'
                      : 'Nothing arranged at the moment. You can propose a time whenever you want one.'}
                  </p>
                  {picked ? (
                    <Button
                      className="mt-3"
                      onClick={() => {
                        setProposing(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      Propose a time on this day
                    </Button>
                  ) : null}
                </CardBody>
              </Card>
            )}
          </div>

          {past.length > 0 && !picked ? (
            <details className="mt-6 rounded-[20px] bg-surface-2 px-5 py-4">
              <summary className="cursor-pointer text-[0.85rem] font-medium text-ink-2">
                Been and gone ({past.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {past.map((a) => (
                  <li key={a.id} className="text-[0.85rem] text-muted">
                    {formatDate(a.scheduled_for.slice(0, 10))} — {a.purpose}
                    {a.status === 'Cancelled' ? ' (did not happen)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        {/* --------------------------------------------------- the grid */}
        <Card className="frost">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <h2 className="mr-2 text-[1.05rem] font-semibold text-ink">{heading(cursor, view)}</h2>
                <Step label="Previous" onClick={() => move(-1)}>
                  ‹
                </Step>
                <Step label="Next" onClick={() => move(1)}>
                  ›
                </Step>
                <button
                  onClick={today}
                  className="ml-1 rounded-full px-2.5 py-1 text-[0.8rem] font-medium text-brand hover:bg-brand-tint"
                >
                  Today
                </button>
              </div>

              <div className="flex rounded-full bg-surface-2 p-1">
                {(['day', 'week', 'month'] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`rounded-full px-3.5 py-1.5 text-[0.82rem] font-medium capitalize ${
                      view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink-2'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              {view === 'month' ? (
                <MonthGrid cursor={cursor} byDay={byDay} picked={picked} onPick={setPicked} />
              ) : view === 'week' ? (
                <WeekStrip cursor={cursor} byDay={byDay} picked={picked} onPick={setPicked} />
              ) : (
                <DayColumn cursor={cursor} byDay={byDay} nameOf={nameOf} />
              )}
            </div>

            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-muted">
              <Key tone="agreed">Agreed</Key>
              <Key tone="proposed">Waiting on an answer</Key>
              <Key tone="past">Been and gone</Key>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ list */

/**
 * One appointment, and everything that can be done to it.
 *
 * The two answers a proposal needs are buttons, because they are the reason
 * the row is at the top of the list. Everything else lives behind the menu:
 * moving it, changing what it is for, calling it off. Those are all real, and
 * none of them is what you came to this screen to do.
 */
function EventRow({
  appointment,
  who,
  patientId,
  actorId,
  busy,
  onAnswer,
  onChanged,
}: {
  appointment: Appointment
  who: string
  patientId: string
  actorId: string
  busy: boolean
  onAnswer: (a: Appointment, choice: 'accept' | 'decline' | 'reschedule', when?: string) => void
  onChanged: () => void
}) {
  const [panel, setPanel] = useState<'none' | 'move' | 'edit'>('none')
  const proposed = appointment.status === PROPOSED
  const gone = DONE.has(appointment.status)
  const when = new Date(appointment.scheduled_for)
  const valid = !Number.isNaN(when.getTime())

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.8rem] text-muted">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${gone ? 'bg-muted' : proposed ? 'bg-state-wait' : 'bg-brand'}`}
              />
              {valid
                ? when.toLocaleString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : appointment.scheduled_for}
            </p>
            <p className="mt-1 text-[1rem] font-semibold tracking-[-0.01em] text-ink">
              {appointment.purpose}
            </p>
            <p className="mt-0.5 text-[0.86rem] leading-relaxed text-ink-2">
              With {who} · {appointment.location || 'location to be confirmed'}
            </p>
            {appointment.preparation_status !== 'Not started' ? (
              <p className="mt-0.5 text-[0.8rem] text-muted">
                Brief {appointment.preparation_status.toLowerCase()}
                {appointment.questions.length
                  ? ` · ${appointment.questions.length} question${appointment.questions.length === 1 ? '' : 's'} saved`
                  : ''}
              </p>
            ) : null}
          </div>

          <RowMenu
            proposed={proposed}
            onMove={() => setPanel((p) => (p === 'move' ? 'none' : 'move'))}
            onEdit={() => setPanel((p) => (p === 'edit' ? 'none' : 'edit'))}
            onCancel={() => onAnswer(appointment, 'decline')}
          />
        </div>

        {proposed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => onAnswer(appointment, 'accept')}>
              That works
            </Button>
            <Button disabled={busy} onClick={() => onAnswer(appointment, 'decline')}>
              Not this one
            </Button>
          </div>
        ) : null}

        {panel === 'move' ? (
          <Reschedule
            onPick={(iso) => {
              onAnswer(appointment, 'reschedule', iso)
              setPanel('none')
            }}
            onClose={() => setPanel('none')}
          />
        ) : null}

        {panel === 'edit' ? (
          <Edit
            appointment={appointment}
            patientId={patientId}
            actorId={actorId}
            onDone={() => {
              setPanel('none')
              onChanged()
            }}
            onClose={() => setPanel('none')}
          />
        ) : null}
      </CardBody>
    </Card>
  )
}

/** The three less-common things, kept out of the way until asked for. */
function RowMenu({
  proposed,
  onMove,
  onEdit,
  onCancel,
}: {
  proposed: boolean
  onMove: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative shrink-0">
      <button
        aria-label="More for this appointment"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-2 py-1 text-[1.1rem] leading-none text-muted hover:bg-surface-2 hover:text-ink"
      >
        ⋯
      </button>
      {open ? (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="frost absolute right-0 z-20 mt-1 w-52 rounded-[16px] p-1.5 shadow-lg">
            <MenuItem
              onClick={() => {
                setOpen(false)
                onMove()
              }}
            >
              {proposed ? 'Suggest another time' : 'Move it'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
            >
              Change the details
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false)
                onCancel()
              }}
            >
              Call it off
            </MenuItem>
          </div>
        </>
      ) : null}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-[12px] px-3 py-2 text-left text-[0.86rem] text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ grid */

/** Six weeks, so the height never jumps when the month changes. */
function MonthGrid({
  cursor,
  byDay,
  picked,
  onPick,
}: {
  cursor: Date
  byDay: Map<string, Appointment[]>
  picked: string | null
  onPick: (key: string | null) => void
}) {
  const days = useMemo(() => monthDays(cursor), [cursor])
  const month = cursor.getMonth()
  const todayKey = dayKey(new Date())

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1 text-center text-[0.72rem] font-medium uppercase tracking-[0.06em] text-muted">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dayKey(d)
          const events = byDay.get(key) ?? []
          return (
            <DayCell
              key={key}
              day={d}
              events={events}
              outside={d.getMonth() !== month}
              today={key === todayKey}
              picked={key === picked}
              onPick={() => onPick(key === picked ? null : key)}
            />
          )
        })}
      </div>
    </div>
  )
}

function DayCell({
  day,
  events,
  outside,
  today,
  picked,
  onPick,
}: {
  day: Date
  events: Appointment[]
  outside: boolean
  today: boolean
  picked: boolean
  onPick: () => void
}) {
  const live = events.filter((e) => !DONE.has(e.status))
  return (
    <button
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`${longDay(dayKey(day))}, ${events.length === 0 ? 'nothing' : events.length === 1 ? 'one appointment' : `${events.length} appointments`}`}
      className={`min-h-[4.25rem] rounded-[14px] p-1.5 text-left sm:min-h-[5.5rem] ${
        picked ? 'bg-brand-tint' : outside ? 'bg-transparent' : 'bg-surface-2/70 hover:bg-surface-2'
      }`}
    >
      <span
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.78rem] tabular-nums ${
          today
            ? 'bg-brand font-semibold text-white'
            : outside
              ? 'text-muted/60'
              : 'font-medium text-ink-2'
        }`}
      >
        {day.getDate()}
      </span>

      {/* Labels where there is room, dots where there is not. */}
      <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
        {events.slice(0, 2).map((e) => (
          <span
            key={e.id}
            className={`truncate rounded-[8px] px-1.5 py-0.5 text-[0.68rem] leading-tight ${chip(e)}`}
          >
            {time(e.scheduled_for)} {e.purpose}
          </span>
        ))}
        {events.length > 2 ? (
          <span className="px-1 text-[0.68rem] text-muted">+{events.length - 2} more</span>
        ) : null}
      </span>
      <span className="mt-1 flex gap-0.5 sm:hidden" aria-hidden>
        {events.slice(0, 3).map((e) => (
          <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${dot(e)}`} />
        ))}
      </span>
      {live.length ? <span className="sr-only">{live.length} still to happen</span> : null}
    </button>
  )
}

/** Seven columns of one week — the shape of a week you can actually plan in. */
function WeekStrip({
  cursor,
  byDay,
  picked,
  onPick,
}: {
  cursor: Date
  byDay: Map<string, Appointment[]>
  picked: string | null
  onPick: (key: string | null) => void
}) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const todayKey = dayKey(new Date())

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d) => {
        const key = dayKey(d)
        const events = byDay.get(key) ?? []
        return (
          <button
            key={key}
            onClick={() => onPick(key === picked ? null : key)}
            aria-pressed={key === picked}
            className={`min-h-[9rem] rounded-[14px] p-1.5 text-left ${
              key === picked ? 'bg-brand-tint' : 'bg-surface-2/70 hover:bg-surface-2'
            }`}
          >
            <span className="block text-[0.7rem] uppercase tracking-[0.06em] text-muted">
              {d.toLocaleDateString('en-GB', { weekday: 'short' })}
            </span>
            <span
              className={`mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.8rem] tabular-nums ${
                key === todayKey ? 'bg-brand font-semibold text-white' : 'font-medium text-ink-2'
              }`}
            >
              {d.getDate()}
            </span>
            <span className="mt-1.5 flex flex-col gap-1">
              {events.map((e) => (
                <span key={e.id} className={`rounded-[8px] px-1.5 py-1 text-[0.68rem] leading-tight ${chip(e)}`}>
                  <span className="block font-medium">{time(e.scheduled_for)}</span>
                  <span className="block truncate">{e.purpose}</span>
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** One day, written out. */
function DayColumn({
  cursor,
  byDay,
  nameOf,
}: {
  cursor: Date
  byDay: Map<string, Appointment[]>
  nameOf: (a: Appointment) => string
}) {
  const events = byDay.get(dayKey(cursor)) ?? []
  if (!events.length) {
    return (
      <p className="rounded-[16px] bg-surface-2 px-4 py-6 text-center text-[0.88rem] text-muted">
        Nothing on this day.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className={`rounded-[16px] px-4 py-3 ${chip(e)}`}>
          <p className="text-[0.82rem] font-medium tabular-nums">{time(e.scheduled_for)}</p>
          <p className="text-[0.95rem] font-semibold">{e.purpose}</p>
          <p className="text-[0.84rem] opacity-80">
            With {nameOf(e)} · {e.location || 'location to be confirmed'}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 rounded-full text-[1.05rem] leading-none text-muted hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  )
}

function Key({ tone, children }: { tone: 'agreed' | 'proposed' | 'past'; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${tone === 'agreed' ? 'bg-brand' : tone === 'proposed' ? 'bg-state-wait' : 'bg-muted'}`}
      />
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- panels */

/** Suggesting a different time, without leaving the row. */
function Reschedule({ onPick, onClose }: { onPick: (when: string) => void; onClose: () => void }) {
  const [when, setWhen] = useState('')

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[16px] bg-canvas px-4 py-3">
      <label className="text-[0.8rem] font-medium text-ink-2">
        A different time
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-1 block rounded-2xl bg-surface px-3 py-2 text-[0.85rem] text-ink outline-none"
        />
      </label>
      <Button
        variant="primary"
        className="mt-5"
        disabled={!when}
        onClick={() => onPick(new Date(when).toISOString())}
      >
        Suggest it
      </Button>
      <Button className="mt-5" onClick={onClose}>
        Leave it
      </Button>
    </div>
  )
}

/** Changing details. A new time goes back to being a proposal. */
function Edit({
  appointment,
  patientId,
  actorId,
  onDone,
  onClose,
}: {
  appointment: Appointment
  patientId: string
  actorId: string
  onDone: () => void
  onClose: () => void
}) {
  const { say } = useUI()
  const [purpose, setPurpose] = useState(appointment.purpose)
  const [location, setLocation] = useState(appointment.location ?? '')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const result = await actOnRecord('edit_appointment', patientId, actorId, {
      appointment_id: appointment.id,
      purpose: purpose !== appointment.purpose ? purpose : undefined,
      location: location !== (appointment.location ?? '') ? location : undefined,
      scheduled_for: when ? new Date(when).toISOString() : undefined,
    })
    setSaving(false)
    say(result.ok ? (result.note ?? 'Updated.') : (result.error ?? 'Not saved.'))
    if (result.ok) onDone()
  }

  return (
    <div className="mt-3 rounded-[16px] bg-canvas px-4 py-3">
      <label className="block text-[0.8rem] font-medium text-ink-2">
        What it is for
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="mt-1 w-full rounded-2xl bg-surface px-3 py-2 text-[0.88rem] text-ink outline-none"
        />
      </label>
      <label className="mt-2 block text-[0.8rem] font-medium text-ink-2">
        Where
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="mt-1 w-full rounded-2xl bg-surface px-3 py-2 text-[0.88rem] text-ink outline-none"
        />
      </label>
      <label className="mt-2 block text-[0.8rem] font-medium text-ink-2">
        A different time
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="mt-1 w-full rounded-2xl bg-surface px-3 py-2 text-[0.88rem] text-ink outline-none"
        />
      </label>
      <p className="mt-2 text-[0.79rem] leading-relaxed text-muted">
        Changing the time means it needs agreeing again. Everything else takes effect straight away.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={onClose}>Leave it</Button>
      </div>
    </div>
  )
}

/** Asking for a time, from either side. */
function Propose({
  patientId,
  choices,
  day,
  onDone,
}: {
  /** The record this goes into, when the screen is showing one. */
  patientId: string | null
  /** Whose records this person may offer a time in, when it is not. */
  choices: Record<string, { name: string }>
  day: string | null
  onDone: () => void
}) {
  const { option, role } = useSession()
  const { say } = useUI()
  // A diary spans records, so it has to be said which one this is for. One
  // connected patient and it is not a question worth asking.
  const names = Object.entries(choices)
  const [who, setWho] = useState(patientId ?? (names.length === 1 ? names[0][0] : ''))
  // A day picked in the grid is already an answer to "when", so it is filled in
  // rather than asked for again.
  const [when, setWhen] = useState(day ? `${day}T10:00` : '')
  const [purpose, setPurpose] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!who) return
    setSaving(true)
    const result = await actOnRecord('propose_appointment', who, option?.personId ?? '', {
      scheduled_for: new Date(when).toISOString(),
      purpose,
      location,
    })
    setSaving(false)
    say(
      result.ok
        ? 'Proposed. It is not booked until the other person agrees.'
        : (result.error ?? 'That could not be proposed.'),
    )
    if (result.ok) onDone()
  }

  return (
    <Card className="mb-6">
      <CardBody>
        <h2 className="text-[0.98rem] font-semibold text-ink">Propose a time</h2>
        <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">
          {role === 'patient'
            ? 'Ask for a time that suits you. Your clinician sees it and either agrees or suggests another.'
            : 'Offer a time. The patient sees it and either agrees or suggests another — it is not booked until they do.'}
        </p>

        {!patientId && names.length > 1 ? (
          <label className="mt-4 block text-[0.8rem] font-medium text-ink-2">
            Who it is for
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.88rem] text-ink outline-none"
            >
              <option value="">Choose a person</option>
              {names.map(([id, person]) => (
                <option key={id} value={id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!patientId && names.length === 0 ? (
          <p className="mt-4 text-[0.86rem] text-state-wait">
            You are not connected to anyone's record yet, so there is nobody to offer a time to.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[0.8rem] font-medium text-ink-2">
            When
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.88rem] text-ink outline-none"
            />
          </label>
          <label className="text-[0.8rem] font-medium text-ink-2">
            Where
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Clinic, video call, anywhere"
              className="mt-1 w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.88rem] text-ink outline-none placeholder:text-muted"
            />
          </label>
        </div>

        <label className="mt-3 block text-[0.8rem] font-medium text-ink-2">
          What it is for
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Review how the quiet-room trial has gone"
            className="mt-1 w-full rounded-2xl bg-surface-2 px-3 py-2 text-[0.88rem] text-ink outline-none placeholder:text-muted"
          />
        </label>

        <Button
          variant="primary"
          className="mt-4"
          disabled={saving || !when || !purpose || !who}
          onClick={submit}
        >
          {saving ? 'Proposing…' : 'Propose it'}
        </Button>
      </CardBody>
    </Card>
  )
}

/* ----------------------------------------------------------------- dates */

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function addMonths(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(1)
  x.setMonth(x.getMonth() + n)
  return x
}

function startOfWeek(d: Date) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - x.getDay())
  return x
}

/** Six weeks from the Sunday on or before the first — always 42 cells. */
function monthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** Local, not UTC: an 8pm appointment belongs to the day it feels like. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function longDay(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function heading(cursor: Date, view: View) {
  if (view === 'month') return cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (view === 'day') return cursor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const start = startOfWeek(cursor)
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  return `${start.getDate()}${sameMonth ? '' : ` ${start.toLocaleDateString('en-GB', { month: 'short' })}`} – ${end.getDate()} ${end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
}

function time(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Tint carries the same meaning as the dot in the list, so both read alike. */
function chip(a: Appointment) {
  if (DONE.has(a.status)) return 'bg-surface-2 text-muted'
  if (a.status === PROPOSED) return 'bg-state-wait-tint text-state-wait'
  return 'bg-brand-tint text-brand-ink'
}

function dot(a: Appointment) {
  if (DONE.has(a.status)) return 'bg-muted'
  if (a.status === PROPOSED) return 'bg-state-wait'
  return 'bg-brand'
}
