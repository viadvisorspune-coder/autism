/**
 * Appointments — what to expect, and the questions you meant to ask.
 *
 * THE THREE HEADINGS ARE THE FEATURE. Before, during, after. An appointment is
 * one of the most predictable things in a person's month and one of the least
 * predictable to be inside, and the gap between those two is almost entirely
 * unstated: where to go, how long it takes, who will be there, what happens
 * afterwards. None of that is clinical information and all of it is what makes
 * the day cost less.
 *
 * THE QUESTION LIST IS THE SMALLEST FEATURE HERE AND POSSIBLY THE MOST USEFUL.
 * The reason people leave appointments without asking the thing they came to
 * ask is not that they forgot it. It is that recalling something while
 * somebody is talking at you is a different and much harder task than reading
 * it off a list — so the list exists, it is written days beforehand when
 * thinking is cheap, and it is visible to the clinician too, because one who
 * can see it before the room can plan around it.
 *
 * NOTHING HERE IS A REMINDER SERVICE. Nothing is sent, nobody is notified, and
 * no alert fires. Adding to a calendar hands over a file the person's own
 * calendar reads; ORCA does not keep a copy or watch the date.
 *
 * WHAT IS DELIBERATELY ABSENT is any account of what was discussed. That
 * belongs in the record, written by whoever was in the room, and a summary
 * assembled here would be an unattributed clinical claim about a conversation
 * this screen was not part of.
 */
import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useSubject } from './subject'
import { actOnRecord, useLive } from '../lib/live'
import { Card, CouldNotLoad, Loading, Nothing, PageTitle, SectionHead, Updated } from './parts'
import { ActionButton, useAction } from './action'

interface AppointmentRow {
  id: string
  patient_id?: string
  professional_id?: string | null
  scheduled_for: string
  purpose: string
  location?: string | null
  status?: string
  preparation_status?: string
  questions?: string[] | null
}

interface PersonRow {
  name?: string
  title?: string
  role?: string
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Days from now, negative for the past. Used only to sort and to label. */
function daysAway(iso: string): number {
  const ms = Date.parse(iso) - Date.now()
  return Math.floor(ms / 86_400_000)
}

export default function Appointments() {
  const { role, option, patientId } = useSession()
  const { subjectId, subjectName } = useSubject()
  const record = subjectId ?? patientId
  const mine = role === 'patient'

  const { data, loading, failed, updatedAt, refresh } = useLive<{
    appointments: AppointmentRow[]
    people: Record<string, PersonRow>
  }>('calendar', record)

  const rows = data?.appointments ?? []

  /**
   * One instant, taken once, and the split keyed on the read.
   *
   * Two problems in one place before this. `Date.now()` in the memo body made
   * the same render impure -- upcoming and past could be computed against
   * different instants and an appointment an hour old could land in both lists
   * or neither. And `data?.appointments ?? []` is a new array every render, so
   * memos keyed on it recomputed on every four-second poll and memoized
   * nothing.
   *
   * A day's grace either side of now, so something that finished this morning
   * is still the thing you are looking at rather than history.
   *
   * Taken once at mount and held in state. A memo is not a place to keep a
   * clock -- it recomputes on whatever its dependencies happen to do, which is
   * a different instant for no reason anybody chose. This list is not a
   * countdown; if it ever needs to move it should move on a deliberate
   * interval, the way the waiting card on the answer screen does.
   */
  const [cutoff] = useState(() => Date.now() - 86_400_000)

  const upcoming = useMemo(
    () =>
      (data?.appointments ?? [])
        .filter((a) => a.status !== 'Cancelled' && Date.parse(a.scheduled_for) >= cutoff)
        .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)),
    [data, cutoff],
  )
  const past = useMemo(
    () =>
      (data?.appointments ?? [])
        .filter((a) => Date.parse(a.scheduled_for) < cutoff)
        .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for)),
    [data, cutoff],
  )

  async function prepare(id: string, questions: string[]): Promise<boolean> {
    if (!record || !option?.personId) return false
    const result = await actOnRecord('prepare_appointment', record, option.personId, {
      appointment_id: id,
      questions,
    })
    if (result.ok) await refresh()
    return result.ok
  }

  const next = upcoming[0]

  return (
    <>
      <PageTitle
        sub={
          mine
            ? 'What is coming, what to expect, and the things you want to ask.'
            : `Appointments with ${subjectName || 'this person'}, and what they have written down to ask.`
        }
      >
        {loading && !data
          ? 'Appointments'
          : !upcoming.length
            ? 'Nothing is coming up'
            : upcoming.length === 1
              ? 'One appointment coming up'
              : `${upcoming.length} appointments coming up`}
      </PageTitle>

      {loading && !data ? <Loading what="your appointments" /> : null}
      {failed ? <CouldNotLoad what="Appointments" onRetry={refresh} /> : null}

      {!loading && !rows.length && !failed ? (
        <Nothing>
          {mine
            ? 'Nothing is in the diary. When somebody offers you a time it appears here, with what to expect and room to write down what you want to ask.'
            : 'Nothing is in the diary for this person.'}
        </Nothing>
      ) : null}

      <ul className="space-y-10">
        {upcoming.map((a) => (
          <li key={a.id}>
            <Appointment
              appointment={a}
              person={data?.people?.[String(a.professional_id ?? '')]}
              mine={mine}
              /* Tier 2 is the one you are going to next. The others are real
                 and are not the thing being decided about today. */
              first={a.id === next?.id}
              prepare={prepare}
            />
          </li>
        ))}
      </ul>

      {past.length ? (
        <section className="o-section">
          <SectionHead>Already happened</SectionHead>
          {/*
            No account of what was discussed, deliberately.

            That belongs in the record, written by whoever was in the room. A
            summary assembled on this screen would be an unattributed clinical
            claim about a conversation the screen was not part of.
          */}
          <p className="o-body o-measure mb-6">
            What was discussed is in the record, written by whoever was there. This is only the
            diary.
          </p>
          <ul className="space-y-5">
            {past.slice(0, 12).map((a) => (
              <li key={a.id} className="o-panel p-5">
                <p className="o-body font-semibold">{a.purpose}</p>
                <p className="o-meta mt-1">
                  {[when(a.scheduled_for), data?.people?.[String(a.professional_id ?? '')]?.name]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {a.questions?.length ? (
                  <p className="o-meta mt-2">
                    You had {a.questions.length} {a.questions.length === 1 ? 'question' : 'questions'}{' '}
                    written down.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * One appointment: when, where, who, and the three parts of the day.
 *
 * Before, during and after are separate headings rather than one paragraph
 * because they are answered at different times — the night before, on the way
 * in, and walking out — and a person looking for one of them should not have to
 * read the other two to find it.
 */
function Appointment({
  appointment,
  person,
  mine,
  first,
  prepare,
}: {
  appointment: AppointmentRow
  person?: PersonRow
  mine: boolean
  first: boolean
  prepare: (id: string, questions: string[]) => Promise<boolean>
}) {
  const away = daysAway(appointment.scheduled_for)
  const who = [person?.name, person?.title].filter(Boolean).join(', ')

  return (
    <Card tone={away <= 1 ? 'decision' : 'current'} raised={first} active={first}>
      <div className="o-card-body">
        <h2 className="o-h2 mb-3">{appointment.purpose}</h2>
        <p className="o-body o-measure">{when(appointment.scheduled_for)}</p>
        {/* Said in words as well as by the colour block: somebody who reads no
            colour still learns this is the one that is nearly here. */}
        <p className="o-meta mt-2">
          {away < 0
            ? 'This has passed'
            : away === 0
              ? 'Today'
              : away === 1
                ? 'Tomorrow'
                : `In ${away} days`}
          {appointment.location ? ` · ${appointment.location}` : ''}
          {who ? ` · ${who}` : ''}
        </p>

        <hr className="o-rule my-8" />
        <h3 className="o-h3 mb-2">Before</h3>
        <p className="o-body o-measure">
          {appointment.location
            ? `It is at ${appointment.location}. `
            : 'The place has not been written down here — ask whoever offered the time. '}
          Nothing is expected of you beforehand. Anything you want to ask can go in the list
          below, and writing it days early is easier than remembering it in the room.
        </p>

        <h3 className="o-h3 mb-2 mt-8">During</h3>
        <p className="o-body o-measure">
          {who ? `${who} will be there.` : 'Who will be there is not recorded here.'} You can bring
          somebody with you, you can ask for a break, and you can ask for anything you are told to
          be written down so you can read it afterwards rather than hold it.
        </p>

        <h3 className="o-h3 mb-2 mt-8">After</h3>
        <p className="o-body o-measure">
          Whatever is written up appears in {mine ? 'your record' : 'the record'} with the name of
          whoever wrote it. Nothing is sent to anybody else because this appointment happened.
        </p>

        <hr className="o-rule my-8" />
        <Questions appointment={appointment} mine={mine} prepare={prepare} />

        <div className="mt-8">
          <AddToCalendar appointment={appointment} who={who} />
        </div>
      </div>
    </Card>
  )
}

/**
 * The list of things to ask.
 *
 * Editable by the person whose appointment it is; readable by the clinician
 * they are seeing. That second half is not an afterthought — a clinician who
 * knows before the room that the questions are all about medication side
 * effects runs a different twenty minutes.
 *
 * One question per line, in one textarea, rather than a repeater with an add
 * button. A repeater makes writing three questions three interactions and
 * makes reordering them impossible; a text box makes it typing.
 */
function Questions({
  appointment,
  mine,
  prepare,
}: {
  appointment: AppointmentRow
  mine: boolean
  prepare: (id: string, questions: string[]) => Promise<boolean>
}) {
  const existing = appointment.questions ?? []
  const [text, setText] = useState(existing.join('\n'))
  const [problem, setProblem] = useState<string | null>(null)

  const save = useAction(async () => {
    setProblem(null)
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const ok = await prepare(appointment.id, lines)
    if (!ok) {
      setProblem('That could not be saved. What you typed is still here and nothing was sent.')
      return false
    }
    return true
  })

  if (!mine) {
    return (
      <>
        <h3 className="o-h3 mb-3">What they want to ask</h3>
        {existing.length ? (
          <>
            <ul className="space-y-3">
              {existing.map((q, i) => (
                <li key={i} className="o-body o-measure">
                  {q}
                </li>
              ))}
            </ul>
            <p className="o-meta o-measure mt-4">
              Written by them, before the appointment. Reading it first is the point of it being
              visible to you.
            </p>
          </>
        ) : (
          <p className="o-body o-measure">
            Nothing written down. That is not a signal about anything — most people do not, and
            the list is offered rather than asked for.
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <h3 className="o-h3 mb-3">What you want to ask</h3>
      <p className="o-body o-measure mb-4">
        One per line. Written now rather than remembered later, because recalling something while
        somebody is talking at you is a much harder job than reading it off a list.
      </p>
      <label htmlFor={`q-${appointment.id}`} className="sr-only">
        Questions for this appointment, one per line
      </label>
      <textarea
        id={`q-${appointment.id}`}
        className="o-input"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={problem ? true : undefined}
      />

      {problem ? (
        <p role="alert" className="o-body o-measure mt-4 o-panel p-5">
          {problem}
        </p>
      ) : null}

      <div className="mt-6">
        <ActionButton
          action={save}
          idle="Save these questions"
          working="Saving…"
          done="Saved ✓"
          failed="Not saved"
          disabled={text === existing.join('\n')}
        />
      </div>
      <p className="o-meta o-measure mt-4">
        Kept with the appointment. Nothing is sent and nobody is told — the clinician you are
        seeing can read it, which is what makes writing it worth doing.
      </p>
    </>
  )
}

/**
 * Add to calendar, as a file rather than as a subscription.
 *
 * A `.ics` the person's own calendar reads, built in the browser from what is
 * already on screen. ORCA does not keep a copy, does not watch the date and
 * does not remind anybody — which is worth saying plainly, because an interface
 * that offers a calendar button and is silently not a reminder service is one
 * somebody will rely on once.
 *
 * A blob URL rather than a data URI: iOS Safari will not open a long
 * `data:text/calendar` and fails silently rather than telling anybody.
 */
function AddToCalendar({ appointment, who }: { appointment: AppointmentRow; who: string }) {
  function download() {
    const start = new Date(appointment.scheduled_for)
    // No duration is recorded anywhere, so an hour is assumed rather than
    // invented as a fact — the description says so rather than the block
    // quietly asserting a finish time.
    const end = new Date(start.getTime() + 60 * 60_000)
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ORCA//EN',
      'BEGIN:VEVENT',
      `UID:${appointment.id}@orca`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(appointment.purpose)}`,
      appointment.location ? `LOCATION:${escape(appointment.location)}` : null,
      `DESCRIPTION:${escape(
        [
          who ? `With ${who}.` : null,
          'Length is not recorded, so this is set to an hour.',
          appointment.questions?.length
            ? `You wrote down ${appointment.questions.length} question${appointment.questions.length === 1 ? '' : 's'} to ask.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      )}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n')

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${appointment.purpose.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <button type="button" className="o-btn" onClick={download}>
        Add to my calendar
      </button>
      <p className="o-meta o-measure mt-3">
        This saves a file your own calendar opens. ORCA does not keep a copy, does not watch the
        date, and will not remind you — your calendar does that if you ask it to.
      </p>
    </>
  )
}
