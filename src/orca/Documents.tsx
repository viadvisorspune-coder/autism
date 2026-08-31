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
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { documentsFor, patientName, people } from '../data/db'
import type { DocumentRecord, Role } from '../data/types'
import { type Attachment, type ConversationData, useLive } from '../lib/live'
import { useAsks } from './asks'
import { useSubject } from './subject'
import { Card, Nothing, PageTitle, SectionHead, longDate } from './parts'
import type { Tone } from './system'

type State = 'Draft' | 'Waiting for a decision' | 'Sent' | 'Not sent'

function stateOf(d: DocumentRecord): State {
  if (d.status === 'Awaiting review') return 'Waiting for a decision'
  if (d.status === 'Saved') return d.sharingHistory.length ? 'Sent' : 'Not sent'
  return 'Draft'
}

const stateTone: Record<State, Tone> = {
  Draft: 'current',
  'Waiting for a decision': 'decision',
  Sent: 'shared',
  'Not sent': 'past',
}

export default function Documents() {
  const { role } = useSession()
  const { status } = useRecordStatus()
  const { subjectId, subjectName, choosable } = useSubject()
  const [composing, setComposing] = useState(false)
  const { data } = useLive<ConversationData>('conversation', subjectId)

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

  if (composing) return <NewDocument onCancel={() => setComposing(false)} />

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

      {!held.length && !produced.length ? (
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
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="o-btn o-btn-small mt-4 no-underline"
                      >
                        Open it
                      </a>
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
function NewDocument({ onCancel }: { onCancel: () => void }) {
  const { role } = useSession()
  const { subjectId, subjectName } = useSubject()
  const { ask } = useAsks()
  const navigate = useNavigate()

  const [type, setType] = useState('Handover')
  const [recipient, setRecipient] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [purpose, setPurpose] = useState('')
  const [sending, setSending] = useState(false)

  const types = typesFor(role)
  const roster = useMemo(() => {
    if (!subjectId) return []
    return people
      .filter((p) => p.role !== 'admin' && p.active !== false)
      .map((p) => ({ id: p.id, label: [p.name, p.title].filter(Boolean).join(', ') }))
  }, [subjectId])

  async function submit() {
    if (sending || !recipient) return
    setSending(true)
    const period = from && to ? ` covering ${longDate(from)} to ${longDate(to)}` : ''
    const why = purpose.trim() ? ` The purpose is ${purpose.trim()}` : ''
    const id = await ask(
      `Write a ${type.toLowerCase()} about ${subjectName || patientName(subjectId ?? '')} for ${recipient}${period}.${why}`,
    )
    setSending(false)
    navigate(`/ask/${id}`)
  }

  return (
    <>
      <button type="button" className="o-body mb-8 block font-semibold underline" onClick={onCancel}>
        ← Back to Documents
      </button>
      <PageTitle>New document</PageTitle>

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
          <button
            type="button"
            className="o-btn o-btn-primary flex-1"
            onClick={submit}
            disabled={sending || !recipient}
          >
            {sending ? 'Writing' : 'Write the draft'}
          </button>
          <button type="button" className="o-btn flex-1" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <p className="o-meta o-measure">
          The draft is written from {subjectName || 'this person'}&rsquo;s record, within what you
          may see. It goes to {subjectName ? `${subjectName.split(' ')[0]}` : 'them'} for a
          decision before it reaches anyone. Nothing is sent by writing it.
        </p>
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
