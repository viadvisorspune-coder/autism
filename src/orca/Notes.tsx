/**
 * Notes — writing into the record, which nobody could do.
 *
 * The gap this fills is the largest one in the product. ORCA could read a
 * record from six angles and answer questions about it, and not one person
 * could add a line to it. A clinician's primary daily action is recording a
 * session; Ananya's own account of her mornings is the most authoritative
 * source in her record and she had no way to put it there; and Divya, who sees
 * more of an ordinary week than anyone with a clinic appointment, could only
 * ask questions about it.
 *
 * ONE SCREEN, FOUR JOBS, AND THE DIFFERENCE IS WHAT IT IS WORTH. The same form
 * writes a session note, a home visit, an observation and Ananya's own entry.
 * What changes is the weight the record gives it, and that is decided on the
 * server from who is signed in — see `add_entry`, which files a professional's
 * note as professionally documented and a trusted person's as reported. It is
 * not a field on this form and must never become one: the value of an entry is
 * a fact about its author, not a claim its author makes.
 *
 * WHAT IT NEVER DOES IS PRETEND. Divya's observation may be written straight
 * into the record or held for Ananya to approve, depending on what the record
 * says about their connection. Which of those happened is on the card
 * afterwards, in words, because contributing into a void is how somebody stops
 * contributing.
 */
import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useSubject } from './subject'
import { actOnRecord, useLive } from '../lib/live'
import { Card, CouldNotLoad, Loading, Nothing, PageTitle, SectionHead, Updated, longDate } from './parts'
import { ActionButton, useAction } from './action'
import { ROLE_LABEL } from './system'

interface Row {
  id: string
  occurred_on?: string | null
  recorded_on?: string | null
  title?: string
  summary?: string
  context?: string | null
  category?: string
  source_id?: string
  source_label?: string
  evidence?: string
  status?: string
  visible_to?: string[] | null
}

const DAY = 24 * 60 * 60 * 1000

/** Whether this is still inside the window in which it can be corrected. */
function editable(row: Row): boolean {
  const written = Date.parse(String(row.recorded_on ?? ''))
  return Number.isFinite(written) && Date.now() - written < DAY
}

/**
 * What this person is writing, in their own words for their own job.
 *
 * A clinician writes a session note; an occupational therapist also writes a
 * home visit, which is a different setting and worth naming as one; Divya
 * shares an observation, which is deliberately not called a note because it is
 * not the same act and should not read as one.
 */
function kindsFor(role: string | null): { key: string; label: string; prompt: string }[] {
  if (role === 'patient')
    return [
      {
        key: 'note',
        label: 'A note about me',
        prompt: 'What happened, or what you want on the record. Your own words are the point.',
      },
    ]
  if (role === 'trusted')
    return [
      {
        key: 'observation',
        label: 'An observation',
        prompt:
          'Something you noticed. Write what you saw rather than what you think it means — the first is evidence and the second is a guess, and the record can tell them apart.',
      },
    ]
  if (role === 'ot' || role === 'therapist')
    return [
      { key: 'session', label: 'Session note', prompt: 'What was worked on, and what came of it.' },
      {
        key: 'home_visit',
        label: 'Home visit',
        prompt: 'What the setting was like, and what you saw there that a clinic would not show.',
      },
    ]
  return [
    { key: 'session', label: 'Session note', prompt: 'What was covered, and what follows from it.' },
  ]
}

const TITLES: Record<string, string> = {
  patient: 'Your notes',
  trusted: 'What you have shared',
}

export default function Notes() {
  const { role, option, patientId } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const record = subjectId ?? patientId
  const { data, loading, failed, updatedAt, refresh } = useLive<{
    events: Row[]
  }>('timeline', record)

  const kinds = kindsFor(role)
  const [kind, setKind] = useState(kinds[0]?.key ?? 'note')
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10))
  const [what, setWhat] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const chosen = kinds.find((k) => k.key === kind) ?? kinds[0]

  /**
   * Only what this person wrote.
   *
   * Notes is not a second Record. It is the answer to "what have I put in
   * here", which is a different question with a different use: checking what
   * you already said before saying something that contradicts it.
   */
  const mine = useMemo(() => {
    const me = option?.personId
    return (data?.events ?? []).filter((e) => e.source_id && e.source_id === me)
  }, [data, option?.personId])

  const write = useAction(async () => {
    setProblem(null)
    setSaved(null)
    if (!record || !option?.personId) {
      setProblem('This build cannot reach the record, so nothing was written.')
      return false
    }
    const body = what.trim()
    if (!body) return false
    const result = await actOnRecord('add_entry', record, option.personId, {
      kind,
      kind_label: chosen?.label ?? 'Note',
      occurred_on: when,
      fields: { what: body },
    })
    if (!result.ok) {
      setProblem(result.error ?? 'That could not be written to the record.')
      return false
    }
    // Cleared only after the record accepted it. A box emptied by a press that
    // then failed has thrown the sentence away on the person's behalf.
    setWhat('')
    setSaved(result.note ?? null)
    await refresh()
    return true
  })

  if (choosable && !subjectId) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <p className="o-body o-measure mb-8">
          A note belongs to one person&rsquo;s record. Open somebody from your caseload and this
          becomes their record.
        </p>
      </>
    )
  }

  const heading =
    TITLES[role ?? ''] ?? `Notes about ${subjectName || 'this person'}`

  return (
    <>
      <PageTitle>{heading}</PageTitle>

      <section>
        <SectionHead>Write something</SectionHead>

        {/*
          The kind of thing being written, when there is more than one.

          A single-kind role gets no chooser at all rather than a row of one
          button, which is a control that asks a question with one answer.
        */}
        {kinds.length > 1 ? (
          <div className="mb-6 flex flex-wrap gap-3">
            {kinds.map((k) => (
              <button
                key={k.key}
                type="button"
                aria-pressed={kind === k.key}
                onClick={() => setKind(k.key)}
                className={`o-btn o-btn-small ${kind === k.key ? 'o-btn-on' : ''}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        ) : null}

        <label htmlFor="note-when" className="o-h3 mb-3 block">
          When this was
        </label>
        <input
          id="note-when"
          type="date"
          className="o-input"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />

        <label htmlFor="note-what" className="o-h3 mb-3 mt-8 block">
          {chosen?.label ?? 'Note'}
        </label>
        <p className="o-body o-measure mb-3">{chosen?.prompt}</p>
        <textarea
          id="note-what"
          className="o-input"
          rows={6}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? 'note-problem' : undefined}
        />

        {problem ? (
          <div id="note-problem" role="alert" className="o-body o-measure mt-4 o-panel p-5">
            <p className="font-semibold">This was not written to the record.</p>
            <p className="mt-3">{problem}</p>
            <p className="mt-3">
              What you typed is still in the box above. Nothing was written and nothing is being
              retried on its own.
            </p>
          </div>
        ) : null}

        {/*
          What became of it, said rather than assumed.

          `add_entry` returns a note when the entry did not go straight into the
          record — a trusted person's observation can be held for Ananya to
          approve. Somebody who wrote something and was told nothing about where
          it went has no reason to write a second thing.
        */}
        {saved ? (
          <div role="status" className="o-body o-measure mt-4 o-panel p-5">
            <p className="font-semibold">Written ✓</p>
            <p className="mt-3">{saved}</p>
          </div>
        ) : null}

        <div className="mt-6">
          <ActionButton
            action={write}
            idle={`Add this to the record`}
            working="Saving…"
            done="Saved ✓"
            failed="Not saved"
            primary
            disabled={!what.trim()}
          />
        </div>

        <p className="o-meta o-measure mt-5">
          {role === 'patient'
            ? 'This is filed as written by you. Nobody is told it was added, and it is visible to you until you decide to share it.'
            : role === 'trusted'
              ? 'This is filed as reported by you, with your name on it. It is not filed as clinical evidence, which is the honest weight for something seen at home rather than assessed.'
              : 'This is filed as professionally documented, with your name and role on it, and it becomes part of the record everyone else reads.'}
        </p>
      </section>

      <section className="o-section">
        <SectionHead>
          {role === 'trusted' ? 'What you have shared' : 'What you have written'}
        </SectionHead>

        {loading && !data ? <Loading what="what you have written" /> : null}
        {failed ? <CouldNotLoad what="Your notes" onRetry={refresh} /> : null}

        {!loading && !mine.length && !failed ? (
          <Nothing>
            {role === 'trusted'
              ? 'You have not shared anything yet. What you write here goes into the record with your name on it, and Ananya can see it.'
              : 'Nothing yet. What you write here appears in this list and in the record.'}
          </Nothing>
        ) : null}

        <ul className="space-y-6">
          {mine.map((e) => (
            <li key={e.id}>
              <Card tone={e.evidence === 'Reported' ? 'past' : 'confirmed'}>
                <div className="p-6">
                  <p className="o-meta">{longDate(e.occurred_on ?? e.recorded_on ?? '')}</p>
                  <p className="o-h3 mt-1">{e.title}</p>
                  <p className="o-body o-measure mt-3 whitespace-pre-line">{e.summary}</p>
                  {/*
                    What happened to it, on the card.

                    "Recorded" and "Awaiting review" are different outcomes and
                    the difference matters most to the person least able to find
                    it out any other way. Named in words, never by the colour of
                    the block above.
                  */}
                  <p className="o-meta mt-4">
                    {e.status === 'Recorded'
                      ? 'In the record'
                      : e.status === 'Awaiting review'
                        ? 'Waiting for Ananya to decide whether this goes in'
                        : (e.status ?? 'In the record')}
                    {e.evidence ? ` · ${e.evidence}` : ''}
                  </p>

                  <Entry row={e} record={record} actorId={option?.personId ?? null} onSaved={refresh} />
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <Updated at={updatedAt} />
      </section>
    </>
  )
}

/**
 * What an entry did, and the day in which it can still be corrected.
 *
 * TWO DIFFERENT THINGS, ON PURPOSE. "See what this changed" answers a question
 * about the record — who this became visible to, and what it did or did not
 * set off. "Edit" answers a question about the writing, and only for a day.
 *
 * The window is short because what is being allowed is fixing a sentence that
 * came out wrong while it was being written, not revising last March once you
 * know how it turned out. After a day the way to change a record is to add to
 * it, which is what everything else in this product does — and the message
 * says so rather than leaving somebody to discover the control is gone.
 */
function Entry({
  row,
  record,
  actorId,
  onSaved,
}: {
  row: Row
  record: string | null
  actorId: string | null
  onSaved: () => void
}) {
  const [open, setOpen] = useState<'edit' | 'effect' | null>(null)
  const [text, setText] = useState(row.summary ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const canEdit = editable(row)

  const save = useAction(async () => {
    setProblem(null)
    if (!record || !actorId || !text.trim()) return false
    const result = await actOnRecord('update_entry', record, actorId, {
      entry_id: row.id,
      what: text.trim(),
    })
    if (!result.ok) {
      setProblem(result.error ?? 'That could not be saved. What you typed is still here.')
      return false
    }
    setOpen(null)
    onSaved()
    return true
  })

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className={`o-btn o-btn-small ${open === 'effect' ? 'o-btn-on' : ''}`}
          aria-expanded={open === 'effect'}
          onClick={() => setOpen(open === 'effect' ? null : 'effect')}
        >
          See what this changed
        </button>
        {canEdit ? (
          <button
            type="button"
            className={`o-btn o-btn-small ${open === 'edit' ? 'o-btn-on' : ''}`}
            aria-expanded={open === 'edit'}
            onClick={() => setOpen(open === 'edit' ? null : 'edit')}
          >
            Correct this
          </button>
        ) : null}
      </div>

      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          {open === 'effect' ? (
            <div className="mt-6">
              <h4 className="o-h3 mb-3">What this changed</h4>
              <p className="o-body o-measure">
                {row.status === 'Awaiting review'
                  ? 'Nothing yet. It is waiting for a decision before it goes into the record, so nobody but you and the person it is about can see it.'
                  : 'It is in the record. Anybody who asks a question this bears on can be answered from it, and it is named as a source when it is.'}
              </p>

              <h4 className="o-h3 mb-3 mt-6">Who can see it</h4>
              <p className="o-body o-measure">
                {row.visible_to?.length
                  ? row.visible_to.map((r) => ROLE_LABEL[r] ?? r).join(', ')
                  : 'Only the person whose record this is.'}
              </p>

              <h4 className="o-h3 mb-3 mt-6">What it did not do</h4>
              {/*
                The half people assume wrongly. Writing something down is not
                telling anybody, and somebody who believes an entry alerted a
                colleague will not follow it up with the conversation that was
                actually needed.
              */}
              <p className="o-body o-measure">
                Nobody was notified and nothing was sent. Writing something down is not the same
                as telling somebody — if this needs acting on, it needs a conversation or an open
                item as well.
              </p>

              {row.context ? (
                <>
                  <h4 className="o-h3 mb-3 mt-6">Earlier wording</h4>
                  <p className="o-body o-measure whitespace-pre-line">{row.context}</p>
                </>
              ) : null}
            </div>
          ) : (
            <div className="mt-6">
              <label htmlFor={`edit-${row.id}`} className="o-h3 mb-3 block">
                What it should say
              </label>
              <p className="o-body o-measure mb-3">
                The earlier wording is kept on the entry rather than erased — a record that can be
                silently rewritten cannot show what was known and when, which is most of what a
                record is for. After a day this is no longer offered and the way to change
                something is to add to it.
              </p>
              <textarea
                id={`edit-${row.id}`}
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
              <div className="mt-6 flex flex-wrap gap-4">
                <ActionButton
                  action={save}
                  idle="Save the correction"
                  working="Saving…"
                  done="Saved ✓"
                  failed="Not saved"
                  primary
                  disabled={!text.trim() || text.trim() === row.summary}
                />
                <button type="button" className="o-btn" onClick={() => setOpen(null)}>
                  Leave it as it is
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
