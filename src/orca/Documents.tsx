/**
 * Documents — what has been produced, and where each one stands.
 *
 * Four states and no others, because a document about somebody's health is
 * only ever one of four things: still being written, waiting on a decision,
 * sent, or deliberately not sent. "Not sent" is on that list on purpose. A
 * draft the person decided against is a real outcome and disappearing it would
 * make the decision look like it never happened.
 *
 * The New document form is the one place in the platform where work starts
 * from a form rather than a question. It exists because the six-month review
 * and the occupational-health note genuinely are forms — they have a type, a
 * recipient and a period, and asking somebody to phrase those as a sentence so
 * a router can parse them back out is a worse experience than four fields.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { documentsFor, patientName, people } from '../data/db'
import type { DocumentRecord, Role } from '../data/types'
import { type Attachment, type ConversationData, useLive } from '../lib/live'
import { useAsks } from './asks'
import { useSubject } from './subject'
import {
  Card,
  CouldNotLoad,
  Disclosure,
  Loading,
  Nothing,
  PageTitle,
  SectionHead,
  Updated,
  longDate,
} from './parts'
import { type DocumentDraft, ago, clearDraft, hasContent, readDraft, writeDraft } from './draft'
import type { Tone } from './system'
import { ActionButton, useAction } from './action'

type State = 'Draft' | 'Waiting for a decision' | 'Sent' | 'Not sent'

function stateOf(d: DocumentRecord): State {
  if (d.status === 'Awaiting review') return 'Waiting for a decision'
  if (d.status === 'Saved') return d.sharingHistory.length ? 'Sent' : 'Not sent'
  return 'Draft'
}

/**
 * How many of the four fields have something in them.
 *
 * The form asks for a type, a recipient, a period and a purpose. The type is
 * always set — it opens on Handover — so it counts, and the count is honest
 * about that rather than pretending nothing has been chosen.
 */
function filledIn(d: DocumentDraft): number {
  return (
    1 +
    (d.recipient.trim() ? 1 : 0) +
    (d.from.trim() || d.to.trim() ? 1 : 0) +
    (d.purpose.trim() ? 1 : 0)
  )
}

const stateTone: Record<State, Tone> = {
  Draft: 'current',
  'Waiting for a decision': 'decision',
  Sent: 'shared',
  'Not sent': 'past',
}

export default function Documents() {
  const { role, option } = useSession()
  const { status } = useRecordStatus()
  const { subjectId, subjectName, choosable } = useSubject()
  const [composing, setComposing] = useState(false)
  const personId = option?.personId ?? ''
  // Re-read whenever the form closes, so finishing or discarding one is
  // reflected here without a reload.
  const [draft, setDraft] = useState<DocumentDraft | null>(() => readDraft(personId))
  /** The last draft thrown away, held so it can be put back. */
  const [discarded, setDiscarded] = useState<DocumentDraft | null>(null)
  useEffect(() => {
    if (!composing) setDraft(readDraft(personId))
  }, [composing, personId])
  const { data, loading, failed, updatedAt, refresh } = useLive<ConversationData>(
    'conversation',
    subjectId,
  )

  const mine = role === 'patient'

  const held = useMemo(() => {
    if (!subjectId || !role) return []
    return documentsFor(subjectId)
      .filter((d) => (role === 'patient' ? true : d.access.includes(role)))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [subjectId, role, status])

  const produced: Attachment[] = data?.attachments ?? []

  if (choosable && !subjectId) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <Link to="/caseload" className="o-btn o-btn-primary no-underline">
          Go to your caseload
        </Link>
      </>
    )
  }

  if (composing)
    return (
      <NewDocument
        onCancel={(justDiscarded) => {
          setComposing(false)
          if (justDiscarded) setDiscarded(justDiscarded)
        }}
      />
    )

  const resumable = draft && draft.subjectId === subjectId ? draft : null

  return (
    <>
      <PageTitle>{mine ? 'Your documents' : `Documents about ${subjectName}`}</PageTitle>

      {/* Only the people who write documents about somebody else get the form.
          Ananya's documents start from an answer, which is the honest route:
          she asks a question, reads what her record says, and then decides
          whether that is worth writing down for someone. */}
      {!mine ? (
        <button type="button" className="o-btn o-btn-primary mb-12" onClick={() => setComposing(true)}>
          New document
        </button>
      ) : null}

      {/*
        An unfinished thing, said where it lives.

        A draft nobody can find is a draft that was lost with extra steps. It
        says what it is, who it was for and when it was last touched, so
        picking it up again is recognition rather than recall — nobody should
        have to remember they had an unfinished task.

        Shown only for the record it was started under. A draft about Ananya
        appearing on Rohan's screen would be the worst kind of helpful.
      */}
      {resumable ? (
        <div className="mb-12">
          <Card tone="current">
            <div className="o-card-body">
              <h2 className="o-h3">Continue your draft</h2>
              <p className="o-body o-measure mt-3">
                {resumable.type}
                {resumable.recipient ? ` for ${resumable.recipient}` : ''}
              </p>
              {/*
                How far in you were, not just that you were in.

                "Continue your draft" tells somebody there is unfinished work;
                it does not tell them whether continuing is two minutes or
                twenty, which is the thing they are actually deciding. The count
                is of the four fields the form asks for.
              */}
              <p className="o-body o-measure mt-2">
                You had filled in {filledIn(resumable)} of 4.
              </p>
              <p className="o-meta mt-2">Last edited {ago(resumable.savedAt)}. Nothing has been sent.</p>
              <div className="mt-6 flex flex-wrap gap-4">
                <button
                  type="button"
                  className="o-btn o-btn-primary"
                  onClick={() => setComposing(true)}
                >
                  Continue
                </button>
                {/*
                  Discarded, then undoable — rather than asked about first.

                  This button has never had a confirmation and does not need
                  one: a dialog in front of it would interrupt everybody to
                  protect the few who press it by accident, and it would not
                  even help them, because a person who meant to press Continue
                  and pressed Discard will read "are you sure?" and press yes.
                  Keeping the draft in hand and offering it back costs one line
                  and actually recovers the mistake.
                */}
                <button
                  type="button"
                  className="o-btn"
                  onClick={() => {
                    setDiscarded(resumable)
                    clearDraft(personId)
                    setDraft(null)
                  }}
                >
                  Discard it
                </button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {/*
        The draft that was just discarded, still in hand.

        It stays until it is put back or dismissed — never on a timer. An Undo
        that expires while somebody is working out whether they meant to do
        that is not an undo, it is a reflex test.
      */}
      {discarded ? (
        <div role="status" className="o-body o-measure mb-12 o-panel p-5">
          <p className="font-semibold">Draft discarded</p>
          <p className="mt-3">
            {discarded.type}
            {discarded.recipient ? ` for ${discarded.recipient}` : ''}. Nothing was sent and
            nothing was written to the record. It is still here until you leave this screen.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <button
              type="button"
              className="o-btn o-btn-small o-btn-primary"
              onClick={() => {
                writeDraft(personId, discarded)
                setDraft(readDraft(personId))
                setDiscarded(null)
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="o-btn o-btn-small"
              onClick={() => setDiscarded(null)}
            >
              Leave it discarded
            </button>
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="mb-10">
          <CouldNotLoad what="Documents produced by a workflow" onRetry={refresh} />
        </div>
      ) : null}

      {loading && !data ? <Loading what="documents about this record" /> : null}

      {!loading && !held.length && !produced.length && !failed ? (
        <Nothing>
          {mine
            ? 'Nothing has been written yet. When you ask for something to be written up, the draft appears here and waits for your decision before it goes anywhere.'
            : 'No documents about this person are part of your access.'}
        </Nothing>
      ) : null}

      <ul className="space-y-8">
        {held.map((d) => {
          const state = stateOf(d)
          const last = d.sharingHistory[d.sharingHistory.length - 1]
          return (
            <li key={d.id}>
              <Card tone={stateTone[state]}>
                <div className="p-6">
                  <p className="o-h3">{d.title}</p>
                  <p className="o-meta mt-2">
                    {[d.fileType, d.category, longDate(d.date)].filter(Boolean).join(' · ')}
                  </p>
                  <p className="o-body mt-4 font-semibold">{state}</p>
                  {last ? (
                    <p className="o-meta mt-1">
                      Sent to {last.recipient} on {longDate(last.date)} — {last.purpose}
                    </p>
                  ) : state === 'Not sent' ? (
                    <p className="o-meta mt-1">
                      This was written and not sent. It stays here because the decision not to
                      send it is part of the record.
                    </p>
                  ) : null}

                  {/*
                    Everyone who has it, not just the last one.

                    The card said "Sent to Anil on 3 March" and stopped there,
                    which on a document sent to four people over two years names
                    one of them and silently drops three. Who holds a document
                    about you is not a footnote — it is the question the whole
                    Sharing screen exists to answer, and it should be answerable
                    from the document as well as from the person.
                  */}
                  {d.sharingHistory.length ? (
                    <div className="mt-5">
                      <Disclosure
                        summary="Who has received this"
                        note={
                          <p className="o-meta">
                            {d.sharingHistory.length}{' '}
                            {d.sharingHistory.length === 1 ? 'recipient' : 'recipients'}.
                          </p>
                        }
                      >
                        <ul className="space-y-4">
                          {d.sharingHistory.map((s, i) => (
                            <li key={i} className="o-panel p-4">
                              <p className="o-body font-semibold">{s.recipient}</p>
                              <p className="o-meta mt-1">Sent {longDate(s.date)}</p>
                              <p className="o-body o-measure mt-2">{s.purpose}</p>
                            </li>
                          ))}
                        </ul>
                        <p className="o-meta o-measure mt-5">
                          Sending cannot be undone — a copy somebody already holds is theirs.
                          Stopping future access to the record is on Sharing.
                        </p>
                      </Disclosure>
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      {produced.length ? (
        <section className="o-section">
          <SectionHead>Produced by a workflow</SectionHead>
          <ul className="space-y-8">
            {produced.map((f) => (
              <li key={f.id}>
                <Card tone="current">
                  <div className="p-6">
                    <p className="o-h3">{f.title}</p>
                    <p className="o-meta mt-2">
                      {f.file_type} · prepared {f.recorded_on}
                    </p>
                    {f.url ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="o-btn o-btn-small no-underline"
                        >
                          Open it
                        </a>
                        {/*
                          Opening and keeping are different things.

                          A signed URL opened in a tab is a document you are
                          looking at on somebody else's server for the next half
                          hour. `?download=` sets the disposition header at
                          source, so this is the copy somebody takes to an
                          appointment — which for a document about your own
                          health is the one that matters.
                        */}
                        <a
                          href={`${f.url}${f.url.includes('?') ? '&' : '?'}download=${encodeURIComponent(f.title)}`}
                          className="o-btn o-btn-small no-underline"
                        >
                          Download a copy
                        </a>
                      </div>
                    ) : (
                      <p className="o-meta mt-3">Still being prepared.</p>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <p className="o-meta o-measure mt-5">
            These links last about half an hour. Reload this page for a fresh one.
          </p>
        </section>
      ) : null}

      <Updated at={updatedAt} />
    </>
  )
}

/**
 * Four fields, on one screen.
 *
 * The guidance asks for only what is needed, and this is what is needed: what
 * kind of document, who it is for, what period it covers, and what it is for.
 * Everything else — the record it draws on, who is asking, what may be
 * disclosed to that recipient — is already known and asking for it again would
 * be the form checking its own homework.
 *
 * The output is a draft. It goes to Decisions, and Ananya decides.
 */
function NewDocument({
  onCancel,
}: {
  /** Closes the form. A draft passed back is one the person just discarded. */
  onCancel: (discarded?: DocumentDraft) => void
}) {
  const { role, option } = useSession()
  const { subjectId, subjectName } = useSubject()
  const { ask } = useAsks()
  const navigate = useNavigate()
  const personId = option?.personId ?? ''

  /**
   * Opened on whatever was left behind, when it belongs to this record.
   *
   * Read once, at mount, into the initial state — reading it on every render
   * would fight the person's typing.
   */
  const saved = useMemo(() => {
    const held = readDraft(personId)
    return held && held.subjectId === subjectId ? held : null
  }, [personId, subjectId])

  const [type, setType] = useState(saved?.type ?? 'Handover')
  const [recipient, setRecipient] = useState(saved?.recipient ?? '')
  const [from, setFrom] = useState(saved?.from ?? '')
  const [to, setTo] = useState(saved?.to ?? '')
  const [purpose, setPurpose] = useState(saved?.purpose ?? '')
  const [confirming, setConfirming] = useState(false)

  const current = { type, recipient, from, to, purpose, subjectId: subjectId ?? '' }
  const dirty = hasContent(current)

  /**
   * Saved as it is typed, and said so.
   *
   * A draft that only survives if you remember to press something is not a
   * draft, it is a quiz — so there is no Save button and never has been. What
   * was missing is the other half: an interface that saves silently is
   * indistinguishable from one that is not saving, and the person cannot tell
   * which until they lose something.
   *
   * "Draft saved" without a "Saving draft…" before it, because there is no
   * interval to report. This is one synchronous write to this device; there is
   * no moment at which it is in progress, and inventing one would be a
   * progress indicator for something that has already finished.
   */
  const [savedAt, setSavedAt] = useState<string | null>(null)
  useEffect(() => {
    writeDraft(personId, current)
    if (hasContent(current)) setSavedAt(new Date().toISOString())
    // The fields are the dependency; `current` is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, type, recipient, from, to, purpose, subjectId])

  const types = typesFor(role)
  const roster = useMemo(() => {
    if (!subjectId) return []
    return people
      .filter((p) => p.role !== 'admin' && p.active !== false)
      .map((p) => ({ id: p.id, label: [p.name, p.title].filter(Boolean).join(', ') }))
  }, [subjectId])

  /**
   * The failure outlives the button.
   *
   * `useAction` returns a control to rest after a few seconds, which is right
   * for a label — a button permanently named "Did not send" has been renamed
   * rather than reported on. It is wrong for the explanation, which is the only
   * place the person is told their four fields survived. A recovery notice that
   * removes itself while somebody is reading it is the disappearing toast this
   * interface is not allowed to use, so this is held separately and cleared
   * only by trying again.
   */
  const [couldNotStart, setCouldNotStart] = useState(false)

  async function submit() {
    if (!recipient) return false
    setCouldNotStart(false)
    const period = from && to ? ` covering ${longDate(from)} to ${longDate(to)}` : ''
    const why = purpose.trim() ? ` The purpose is ${purpose.trim()}` : ''
    try {
      const id = await ask(
        `Write a ${type.toLowerCase()} about ${subjectName || patientName(subjectId ?? '')} for ${recipient}${period}.${why}`,
      )
      // Finished, so it is no longer a draft. Cleared only after the request
      // has been accepted, never before.
      clearDraft(personId)
      navigate(`/ask/${id}`)
      return true
    } catch {
      setCouldNotStart(true)
      return false
    }
  }

  const writing = useAction(submit)

  /**
   * Cancel means cancel — and says what it would cost.
   *
   * Not saved silently, not discarded silently, and not returned somewhere
   * unexpected. The one case that needs asking is a form with work in it; an
   * untouched form just closes.
   */
  if (confirming) {
    return (
      <>
        <PageTitle>You have unsaved changes</PageTitle>
        <Card tone="decision">
          <div className="o-card-body">
            <p className="o-body o-measure">
              You have filled in {[
                recipient.trim() && 'a recipient',
                (from.trim() || to.trim()) && 'a period',
                purpose.trim() && 'a purpose',
              ]
                .filter(Boolean)
                .join(', ')}
              . Discarding removes all of it. Nothing has been written or sent either way.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button type="button" className="o-btn o-btn-primary flex-1" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
              {/*
                Discarded, and handed back up so Documents can offer it again.

                A confirmation the person read and answered is not a licence to
                make the answer irreversible. They said discard, so it is
                discarded; Undo on the screen they land on is what turns a
                misread question into a two-second correction instead of
                twenty minutes of retyping.
              */}
              <button
                type="button"
                className="o-btn flex-1"
                onClick={() => {
                  const snapshot: DocumentDraft = { ...current, savedAt: new Date().toISOString() }
                  clearDraft(personId)
                  onCancel(snapshot)
                }}
              >
                Discard changes
              </button>
            </div>
            <p className="o-meta o-measure mt-6">
              You can also leave it. It waits on Documents and nothing expires — and if you
              discard it, Documents offers it back until you leave that screen.
            </p>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      {/*
        Wrapped, not passed straight through. `onCancel` now takes a discarded
        draft as its first argument, and handing it an onClick directly would
        pass it a MouseEvent — which is truthy, and would have Documents offer
        to undo a discard that never happened.
      */}
      <button
        type="button"
        className="o-body mb-8 block font-semibold underline"
        onClick={() => onCancel()}
      >
        ← Back to Documents
      </button>
      <PageTitle
        sub={
          saved
            ? `Picked up where you left off — last edited ${ago(saved.savedAt)}.`
            : undefined
        }
      >
        New document
      </PageTitle>

      <div className="space-y-10">
        <div>
          <label htmlFor="doc-type" className="o-h3 mb-3 block">
            Type
          </label>
          <div className="flex flex-wrap gap-3" id="doc-type">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`o-btn o-btn-small ${type === t ? 'o-btn-primary' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="doc-for" className="o-h3 mb-3 block">
            For
          </label>
          <select
            id="doc-for"
            className="o-input"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            <option value="">Choose who this is for</option>
            {roster.map((r) => (
              <option key={r.id} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="o-h3 mb-3">Period</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex-1">
              <span className="o-meta mb-1 block">From</span>
              <input type="date" className="o-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex-1">
              <span className="o-meta mb-1 block">To</span>
              <input type="date" className="o-input" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="doc-purpose" className="o-h3 mb-3 block">
            Purpose
          </label>
          <textarea
            id="doc-purpose"
            className="o-input"
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <ActionButton
            action={writing}
            idle="Write the draft"
            working="Creating your document…"
            done="Document ready"
            failed="Not created"
            primary
            disabled={!recipient}
            className="flex-1"
          />
          <button
            type="button"
            className="o-btn flex-1"
            disabled={writing.busy}
            onClick={() => (dirty ? setConfirming(true) : onCancel())}
          >
            Cancel
          </button>
        </div>

        {/*
          A failure that says what it did not cost, before it says anything else.

          Somebody who has just filled in four fields about a child's support
          needs will not read a word of a recovery instruction until they know
          the four fields are still there. They are: the form writes itself to
          this device on every keystroke, and `submit` clears that only after
          the request has been accepted. So this states it, rather than leaving
          it to be discovered by pressing something and finding out.

          "Leave it as a draft" is the second way out the brief asks for, and it
          is a real one here rather than a button that pretends to save: the
          draft already exists, and this closes the form without touching it.
          Nothing retries on its own — a request that produces a document
          somebody else will read must not be sent twice by helpfulness.
        */}
        {couldNotStart ? (
          <div role="alert" className="o-body o-measure o-panel p-5">
            <p className="font-semibold">The document couldn&rsquo;t be created.</p>
            <p className="mt-3">
              Everything you typed is still on this screen and kept on this device. Nothing was
              written and nothing was sent.
            </p>
            <p className="mt-3">Nothing is being retried on its own.</p>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <button type="button" className="o-btn o-btn-primary" onClick={writing.fire}>
                Try again
              </button>
              {/*
                "Save request" as a real second way out rather than a button
                that pretends. The four fields are already on this device —
                written on every keystroke, and cleared only after a request has
                been accepted — so this closes the form without touching them
                and Documents offers them straight back.
              */}
              <button type="button" className="o-btn" onClick={() => onCancel()}>
                Save request
              </button>
            </div>
          </div>
        ) : null}

        <p className="o-meta o-measure">
          The draft is written from {subjectName || 'this person'}&rsquo;s record, within what you
          may see. It goes to {subjectName ? `${subjectName.split(' ')[0]}` : 'them'} for a
          decision before it reaches anyone. Nothing is sent by writing it.
        </p>

        {dirty ? (
          <p className="o-meta o-measure" role="status">
            <span className="font-semibold">Draft saved</span>
            {savedAt ? ` ${ago(savedAt)}` : ''}. What you have typed is kept on this device as you
            go. Leaving this screen does not lose it, and nothing here expires.
          </p>
        ) : null}
      </div>
    </>
  )
}

function typesFor(role: Role | null): string[] {
  if (role === 'employer') return ['Occupational health note', 'Adjustment summary', 'Letter']
  if (role === 'university') return ['Accommodation confirmation', 'Support summary', 'Letter']
  if (role === 'trusted') return ['Note for Ananya']
  return ['Handover', 'Summary', 'Referral', 'Six-month review']
}
