import { useState } from 'react'
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
 * A month grid was the obvious thing to build and the wrong one. Ananya has
 * four appointments in six weeks; thirty mostly-empty boxes make her hunt for
 * them, and the two questions she actually has — when is the next one, and is
 * anyone waiting on me — are answerable in a sentence. So it is a list, in
 * time order, with the ones needing an answer first.
 */

interface Appointment {
  id: string
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
}

const PROPOSED = 'Awaiting stakeholder'

export default function Calendar({ patientId = 'pt-ananya' }: { patientId?: string }) {
  const { role, option } = useSession()
  const { say } = useUI()
  const { data, refresh } = useLive<CalendarData>('calendar', patientId, 15000)
  const [busy, setBusy] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)

  const appointments = data?.appointments ?? []
  const nameOf = (id: string | null) => (id ? (data?.people?.[id]?.name ?? 'your clinician') : 'someone yet to be assigned')

  const isPatient = role === 'patient'
  const upcoming = appointments.filter((a) => a.status !== 'Cancelled' && a.status !== 'Completed')
  const waiting = upcoming.filter((a) => a.status === PROPOSED)
  const agreed = upcoming.filter((a) => a.status !== PROPOSED)
  const past = appointments.filter((a) => a.status === 'Completed' || a.status === 'Cancelled')

  async function answer(id: string, choice: 'accept' | 'decline' | 'reschedule', when?: string) {
    setBusy(id)
    const result = await actOnRecord('answer_appointment', patientId, option?.personId ?? '', {
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
            ? 'Declined. Nothing is booked.'
            : 'A different time has been suggested.'
        : (result.error ?? 'That could not be saved.'),
    )
    if (result.ok) refresh()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Calendar"
        description={
          isPatient
            ? 'Everything arranged, and anything anyone has asked to arrange. Nothing is booked until you agree to it.'
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
          patientId={patientId}
          onDone={() => {
            setProposing(false)
            refresh()
          }}
        />
      ) : null}

      {waiting.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-state-wait">
            Waiting on an answer
          </h2>
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {waiting.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <Slot appointment={a} who={nameOf(a.professional_id)} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        disabled={busy === a.id}
                        onClick={() => answer(a.id, 'accept')}
                      >
                        That works
                      </Button>
                      <Button disabled={busy === a.id} onClick={() => answer(a.id, 'decline')}>
                        Not this one
                      </Button>
                      <Reschedule onPick={(when) => answer(a.id, 'reschedule', when)} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
          Agreed
        </h2>
        <Card>
          <CardBody className={agreed.length ? 'p-0' : ''}>
            {agreed.length ? (
              <ul className="divide-y divide-line">
                {agreed.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <Slot appointment={a} who={nameOf(a.professional_id)} />
                    <Edit
                      appointment={a}
                      patientId={patientId}
                      actorId={option?.personId ?? ''}
                      onDone={refresh}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.88rem] text-muted">Nothing arranged at the moment.</p>
            )}
          </CardBody>
        </Card>
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[0.78rem] font-semibold uppercase tracking-[0.07em] text-muted">
            Been and gone
          </h2>
          <Card>
            <CardBody>
              <ul className="space-y-2">
                {past.map((a) => (
                  <li key={a.id} className="text-[0.86rem] text-muted">
                    {formatDate(a.scheduled_for.slice(0, 10))} — {a.purpose}
                    {a.status === 'Cancelled' ? ' (did not happen)' : ''}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

/** One appointment, said the way a person would say it. */
function Slot({ appointment, who }: { appointment: Appointment; who: string }) {
  const when = new Date(appointment.scheduled_for)
  const time = Number.isNaN(when.getTime())
    ? appointment.scheduled_for
    : when.toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <div>
      <p className="text-[0.95rem] font-medium text-ink">{time}</p>
      <p className="text-[0.88rem] leading-relaxed text-ink-2">
        {appointment.purpose} · with {who}
      </p>
      <p className="text-[0.8rem] text-muted">
        {appointment.location || 'Location to be confirmed'}
        {appointment.preparation_status !== 'Not started'
          ? ` · brief ${appointment.preparation_status.toLowerCase()}`
          : ''}
      </p>
    </div>
  )
}

/** Suggesting a different time, without leaving the row. */
function Reschedule({ onPick }: { onPick: (when: string) => void }) {
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')

  if (!open) return <Button onClick={() => setOpen(true)}>Suggest another time</Button>

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="rounded-2xl bg-surface-2 px-3 py-2 text-[0.85rem] text-ink outline-none"
      />
      <Button
        variant="primary"
        disabled={!when}
        onClick={() => {
          onPick(new Date(when).toISOString())
          setOpen(false)
        }}
      >
        Suggest it
      </Button>
    </span>
  )
}

/** Changing details. A new time goes back to being a proposal. */
function Edit({
  appointment,
  patientId,
  actorId,
  onDone,
}: {
  appointment: Appointment
  patientId: string
  actorId: string
  onDone: () => void
}) {
  const { say } = useUI()
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState(appointment.purpose)
  const [location, setLocation] = useState(appointment.location ?? '')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-[0.83rem] font-medium text-brand underline-offset-2 hover:underline"
      >
        Change something
      </button>
    )
  }

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
    if (result.ok) {
      setOpen(false)
      onDone()
    }
  }

  return (
    <div className="mt-3 rounded-[20px] bg-canvas px-4 py-3">
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
        <Button onClick={() => setOpen(false)}>Leave it</Button>
      </div>
    </div>
  )
}

/** Asking for a time, from either side. */
function Propose({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { option, role } = useSession()
  const { say } = useUI()
  const [when, setWhen] = useState('')
  const [purpose, setPurpose] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const result = await actOnRecord('propose_appointment', patientId, option?.personId ?? '', {
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
    <Card className="mb-8">
      <CardBody>
        <h2 className="text-[0.98rem] font-semibold text-ink">Propose a time</h2>
        <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">
          {role === 'patient'
            ? 'Ask for a time that suits you. Your clinician sees it and either agrees or suggests another.'
            : 'Offer a time. The patient sees it and either agrees or suggests another — it is not booked until they do.'}
        </p>

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
          disabled={saving || !when || !purpose}
          onClick={submit}
        >
          {saving ? 'Proposing…' : 'Propose it'}
        </Button>
      </CardBody>
    </Card>
  )
}
