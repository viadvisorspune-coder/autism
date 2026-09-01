/**
 * Tasks — the open items, which everybody was keeping in a notebook.
 *
 * Priya's home screen and everybody else's second one. Her whole job is chasing
 * and connecting: the fifteen-step workflow names her as the requester and she
 * had no interface at all, which was an omission rather than a decision. A
 * clinician reaches this from the other end — reading an answer, thinking
 * "somebody should follow that up", and having nowhere to put the thought.
 *
 * ADDRESSED TO A ROLE, NEVER TO A PERSON. "The occupational therapist needs to
 * set a review date" survives that occupational therapist going on leave; the
 * same item addressed to somebody by name becomes invisible the moment they
 * change job, which is exactly when it most needs not to be. It also means
 * nobody can quietly hand their backlog to a named colleague.
 *
 * NOT PART OF THE RECORD. An open item is a fact about work, not about
 * somebody's life, and it is deliberately kept out of the timeline. Ananya
 * never sees a task list: handing the person a record is about a system's
 * backlog would make her responsible for chasing the people looking after her.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/session'
import { useSubject } from './subject'
import { actOnRecord, useLive } from '../lib/live'
import { connections, patientName, people } from '../data/db'
import {
  Card,
  CouldNotLoad,
  Loading,
  Nothing,
  PageTitle,
  SectionHead,
  Updated,
  longDate,
} from './parts'
import { ActionButton, useAction } from './action'
import { ROLE_LABEL } from './system'

export interface TaskRow {
  id: string
  patient_id?: string | null
  title: string
  detail?: string | null
  due_on?: string | null
  for_roles?: string[] | null
  status?: string
  created_at?: string
}

/** Today, as an ISO date, for the overdue comparison. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Open is everything that has not ended.
 *
 * Not `status === 'Active'`. The column is a `workflow_status`, which has
 * fourteen values, and what is actually in the table is Draft, In progress and
 * Awaiting information -- none of them Active. Matching on the one value this
 * code happens to write put every seeded item under "Closed" while the page
 * said nothing was open, which is the worst direction for this particular
 * screen to be wrong in: an open-items list that hides open items.
 *
 * Two endings, and everything else is work. That also means a status nobody
 * has thought of yet shows up rather than disappearing.
 */
const ENDED = new Set(['Completed', 'Cancelled'])

function isOpen(status?: string): boolean {
  return !ENDED.has(status ?? '')
}

export default function Tasks() {
  const { role, option, patientId } = useSession()
  const { subjectId, choosable } = useSubject()

  /**
   * Across every record for a coordinator, within one for everybody else.
   *
   * Priya's question is "what is open anywhere", and scoping her to a chosen
   * subject would make her switch record to find out whether there is anything
   * to switch record for. A clinician's is "what is open on the person I am
   * looking at", because that is what they are doing.
   */
  const acrossAll = role === 'clinic'
  const scope = acrossAll ? null : (subjectId ?? patientId)
  const { data, loading, failed, updatedAt, refresh } = useLive<{ tasks: TaskRow[] }>(
    'tasks',
    scope,
    15000,
  )

  const [showDone, setShowDone] = useState(false)

  // Keyed on the read, not on `tasks`: that is a new array every render, so a
  // memo on it recomputes on every poll and memoizes nothing.
  const open = useMemo(() => (data?.tasks ?? []).filter((t) => isOpen(t.status)), [data])
  const closed = useMemo(() => (data?.tasks ?? []).filter((t) => !isOpen(t.status)), [data])
  const overdue = useMemo(() => open.filter((t) => t.due_on && t.due_on < today()), [open])

  async function change(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const record = scope ?? patientId
    if (!record || !option?.personId) return false
    const result = await actOnRecord('update_task', record, option.personId, {
      task_id: id,
      ...patch,
    })
    if (result.ok) await refresh()
    return result.ok
  }

  if (!acrossAll && choosable && !subjectId) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <p className="o-body o-measure mb-8">
          Open items belong to one person&rsquo;s record. Open somebody from your caseload and this
          becomes their list.
        </p>
        <Link to="/caseload" className="o-btn o-btn-primary no-underline">
          Go to your caseload
        </Link>
      </>
    )
  }

  return (
    <>
      <PageTitle
        sub={
          acrossAll
            ? 'Everything open across the records you coordinate.'
            : 'Open items on this record, for your role.'
        }
      >
        {loading && !data
          ? 'Open items'
          : open.length === 0
            ? 'Nothing is open'
            : open.length === 1
              ? 'One thing is open'
              : `${open.length} things are open`}
      </PageTitle>

      {/*
        Overdue, said once, at the top, in words.

        Not a red badge on each row. A date that has passed is a fact the row
        already carries; what a person needs before they start reading is
        whether any of this is late at all, which is the thing that decides
        whether they read now or later.
      */}
      {overdue.length ? (
        <p role="status" className="o-body o-measure mb-10 o-panel p-5">
          <span className="font-semibold">
            {overdue.length === 1 ? 'One of these is past its date.' : `${overdue.length} of these are past their date.`}
          </span>{' '}
          Nothing was chased automatically and nobody has been told. A date here is a note to
          yourself, not a deadline the system enforces.
        </p>
      ) : null}

      {loading && !data ? <Loading what="what is open" /> : null}
      {failed ? <CouldNotLoad what="Open items" onRetry={refresh} /> : null}

      {!loading && !open.length && !closed.length && !failed ? (
        <Nothing>
          Nothing is open for you here. An item appears when somebody flags a follow-up, or when
          you create one below.
        </Nothing>
      ) : null}

      <ul className="space-y-6">
        {open.map((t) => (
          <li key={t.id}>
            <Card tone={t.due_on && t.due_on < today() ? 'decision' : 'current'}>
              <div className="p-6">
                <p className="o-h3">{t.title}</p>
                <p className="o-meta mt-2">
                  {[
                    t.due_on ? `Due ${longDate(t.due_on)}` : 'No date',
                    (t.for_roles ?? []).map((r) => ROLE_LABEL[r] ?? r).join(', '),
                    acrossAll && t.patient_id ? patientName(t.patient_id) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {/*
                  Late, in words as well as in the colour block above. Somebody
                  who reads no colour still reads this.
                */}
                {t.due_on && t.due_on < today() ? (
                  <p className="o-body mt-2 font-semibold">Past its date</p>
                ) : null}
                {t.detail ? <p className="o-body o-measure mt-4">{t.detail}</p> : null}

                <div className="mt-6 flex flex-wrap gap-4">
                  <Close
                    label="Mark done"
                    working="Saving…"
                    done="Done ✓"
                    run={() => change(t.id, { status: 'Completed' })}
                  />
                  {/*
                    Two endings, kept apart. "This was done" and "this stopped
                    mattering" are different facts about a piece of work, and
                    collapsing them loses the only interesting half — the second
                    one is what somebody looks for when they ask why nothing
                    happened.
                  */}
                  <Close
                    label="No longer needed"
                    working="Saving…"
                    done="Closed"
                    run={() => change(t.id, { status: 'Cancelled' })}
                  />
                </div>

                {/*
                  Chasing, written down.

                  The useful fact is never that somebody chased. It is that
                  they chased three times and nothing happened, which is the
                  thing you take to a meeting — so each one is appended and
                  dated rather than overwriting the last.

                  Nothing is sent by it. Nobody is emailed and no reminder
                  fires; this records that you asked, and asking still happens
                  in whatever way it happens.
                */}
                <Chase onChase={(note) => change(t.id, { chase: note })} />
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <NewTask
        scope={scope ?? patientId}
        actorId={option?.personId ?? null}
        role={role}
        onCreated={refresh}
      />

      {/*
        Who is involved, for the person whose job is connecting them.

        A coordinator's second question after "what is open" is "who is on
        this", and until now the answer lived only inside Sharing — which is
        the subject's screen, not hers. This is the same connections she can
        already see, listed where the chasing happens.
      */}
      {acrossAll ? <Involved /> : null}

      {closed.length ? (
        <section className="o-section">
          <SectionHead>Closed</SectionHead>
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
            className="o-body underline"
          >
            {showDone ? 'Hide closed items ▴' : `Show ${closed.length} closed ▾`}
          </button>
          <div className="o-reveal" data-open={showDone ? 'yes' : 'no'}>
            <div inert={!showDone}>
              <ul className="mt-6 space-y-5">
                {closed.map((t) => (
                  <li key={t.id} className="o-panel p-5">
                    <p className="o-body font-semibold">{t.title}</p>
                    <p className="o-meta mt-1">
                      {t.status === 'Completed' ? 'Done' : 'Closed without being done'}
                      {t.due_on ? ` · was due ${longDate(t.due_on)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * Recording that you chased something.
 *
 * Deliberately not a button that sends anything. ORCA has no way to email
 * somebody's colleague and should not pretend to — what it can do is keep the
 * count and the dates, which is the half that gets lost and the half that
 * matters when a thing has been outstanding for two months.
 */
function Chase({ onChase }: { onChase: (note: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const send = useAction(async () => {
    if (!note.trim()) return false
    const ok = await onChase(note.trim())
    if (ok) {
      setNote('')
      setOpen(false)
    }
    return ok
  })

  return (
    <>
      <button
        type="button"
        className={`o-btn o-btn-small mt-4 ${open ? 'o-btn-on' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        I chased this
      </button>
      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <label className="o-h3 mb-3 mt-5 block" htmlFor="chase-note">
            Who you asked, and how
          </label>
          <input
            id="chase-note"
            className="o-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="o-meta o-measure mt-2">
            Nothing is sent by this. It records that you asked, dated, so a thing outstanding for
            two months shows three chases rather than none.
          </p>
          <div className="mt-5">
            <ActionButton
              action={send}
              idle="Record it"
              working="Saving…"
              done="Recorded ✓"
              failed="Not saved"
              small
              disabled={!note.trim()}
            />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Everybody connected to the records this coordinator holds.
 *
 * WHAT THIS IS NOT is a way to add a professional to somebody's record.
 * Connections are made by the person whose record it is, from Sharing, and a
 * coordinator quietly attaching a colleague to a medical record would be the
 * consent model going round the back of itself. What she can do is see who is
 * there, and raise an open item asking somebody to be brought in — which is a
 * request, addressed to a role, that the subject still has to agree to.
 */
function Involved() {
  const { patientId } = useSession()
  const { caseload } = useSubject()
  const ids = caseload.length ? caseload.map((c) => c.id) : patientId ? [patientId] : []

  const rows = ids.flatMap((id) =>
    connections
      .filter((c) => c.patientId === id && c.consentStatus !== 'Revoked')
      .map((c) => ({
        subject: patientName(id),
        person: people.find((p) => p.id === c.personId),
        connection: c,
      }))
      .filter((r) => r.person),
  )

  if (!rows.length) return null

  return (
    <section className="o-section">
      <SectionHead>Who is involved</SectionHead>
      <p className="o-body o-measure mb-6">
        Read from the connections each person has agreed to. You cannot add anybody here —
        connections are made by the person whose record it is. What you can do is raise an open
        item asking for somebody to be brought in, which they still decide on.
      </p>
      <ul className="space-y-4">
        {rows.map((r, i) => (
          <li key={i} className="o-panel p-4">
            <p className="o-body font-semibold">{r.person?.name}</p>
            <p className="o-meta mt-1">
              {[
                ROLE_LABEL[String(r.person?.role)] ?? r.person?.role,
                r.person?.organisation,
                `for ${r.subject}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="o-meta mt-1">
              Since {longDate(r.connection.consentGiven)}
              {r.connection.reviewDue ? ` · review due ${longDate(r.connection.reviewDue)}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One ending, reporting on itself. A component because it needs its own state. */
function Close({
  label,
  working,
  done,
  run,
}: {
  label: string
  working: string
  done: string
  run: () => Promise<boolean>
}) {
  const action = useAction(run)
  return (
    <ActionButton
      action={action}
      idle={label}
      working={working}
      done={done}
      failed="Not saved"
      small
    />
  )
}

/**
 * Raising one.
 *
 * The role chooser is the part that matters and the part people skip, so it
 * defaults to the person raising it rather than to a plausible other role. An
 * item silently addressed to somebody else is how a backlog gets handed over
 * without anybody agreeing to it.
 */
function NewTask({
  scope,
  actorId,
  role,
  onCreated,
}: {
  scope: string | null
  actorId: string | null
  role: string | null
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [due, setDue] = useState('')
  const [forRoles, setForRoles] = useState<string[]>(role ? [role] : [])
  const [problem, setProblem] = useState<string | null>(null)

  const CHOOSABLE = ['psychologist', 'psychiatrist', 'gp', 'therapist', 'ot', 'clinic']

  const create = useAction(async () => {
    setProblem(null)
    if (!scope || !actorId || !title.trim()) return false
    const result = await actOnRecord('add_task', scope, actorId, {
      title: title.trim(),
      detail: detail.trim() || null,
      due_on: due || null,
      for_roles: forRoles,
    })
    if (!result.ok) {
      setProblem(result.error ?? 'That could not be created.')
      return false
    }
    setTitle('')
    setDetail('')
    setDue('')
    onCreated()
    return true
  })

  return (
    <section className="o-section">
      <SectionHead>Add an open item</SectionHead>

      {!open ? (
        <button type="button" className="o-btn" aria-expanded={false} onClick={() => setOpen(true)}>
          Add an open item
        </button>
      ) : null}

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <label htmlFor="task-title" className="o-h3 mb-3 block">
            What needs doing
          </label>
          <input
            id="task-title"
            className="o-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={problem ? true : undefined}
          />

          <label htmlFor="task-detail" className="o-h3 mb-3 mt-6 block">
            Anything else worth knowing
          </label>
          <textarea
            id="task-detail"
            className="o-input"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />

          <label htmlFor="task-due" className="o-h3 mb-3 mt-6 block">
            By when
          </label>
          <input
            id="task-due"
            type="date"
            className="o-input"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <p className="o-meta o-measure mt-2">
            A note to yourself. Nothing is chased automatically and nobody is told when it passes.
          </p>

          <h3 className="o-h3 mb-3 mt-6">Whose job this is</h3>
          <div className="flex flex-wrap gap-3">
            {CHOOSABLE.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={forRoles.includes(r)}
                onClick={() =>
                  setForRoles((current) =>
                    current.includes(r) ? current.filter((x) => x !== r) : [...current, r],
                  )
                }
                className={`o-btn o-btn-small ${forRoles.includes(r) ? 'o-btn-on' : ''}`}
              >
                {ROLE_LABEL[r] ?? r}
              </button>
            ))}
          </div>
          <p className="o-meta o-measure mt-3">
            A role, not a person — so this survives whoever holds it being away, and nobody&rsquo;s
            name is put on work they have not agreed to.
          </p>

          {problem ? (
            <div role="alert" className="o-body o-measure mt-6 o-panel p-5">
              <p className="font-semibold">This was not created.</p>
              <p className="mt-3">{problem}</p>
              <p className="mt-3">What you typed is still here and nothing is being retried.</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-4">
            <ActionButton
              action={create}
              idle="Add it"
              working="Saving…"
              done="Added ✓"
              failed="Not added"
              primary
              disabled={!title.trim() || !forRoles.length}
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
