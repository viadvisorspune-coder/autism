/**
 * Ask — the home screen for everyone except the administrator.
 *
 * All thirty-five things people come here to do are phrased as things a person
 * types, so this is not a dashboard with a chat widget bolted on. One input,
 * one primary action, nothing to learn before you can do anything.
 *
 * NO SUGGESTED QUESTIONS. A row of prompts tells the person what the system
 * expects rather than what they want, and the guidance on presuming competence
 * is explicit. What replaces them is the recently-asked cards — which are not
 * suggestions but history, and which exist because asking the same question
 * again should be a tap rather than a retype.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { ACCEPTED_FILES, type Attached, attachFile } from '../lib/attach'
import { type Shape, useAsks } from './asks'
import { useSubject } from './subject'
import { Card, PageTitle, SectionHead, shortDate } from './parts'
import { toneClass } from './system'

export default function Ask() {
  const { role, option } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const { ask, recent } = useAsks()
  const navigate = useNavigate()

  const [question, setQuestion] = useState('')
  const [file, setFile] = useState<Attached | null>(null)
  const [fileProblem, setFileProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const mine = role === 'patient'
  /**
   * A clinician with no subject chosen cannot ask anything.
   *
   * Enforced before the question exists rather than after it is sent. A
   * question composed against no record is not a question that should reach
   * one, and asking which person you meant afterwards is a worse experience
   * than not offering the box until the answer is known.
   */
  const blocked = choosable && !subjectId

  async function take(chosen: File | null | undefined) {
    if (!chosen || !subjectId || !option?.personId) return
    setFileProblem(null)
    const result = await attachFile(chosen, subjectId, option.personId)
    if (result.ok) setFile(result.file)
    else setFileProblem(result.error)
  }

  async function send(rehearse = false) {
    const body = question.trim()
    if (!body || sending) return
    setSending(true)
    const id = await ask(body, { file, rehearse })
    setQuestion('')
    setFile(null)
    setSending(false)
    navigate(`/ask/${id}`)
  }

  if (blocked) {
    return (
      <>
        <PageTitle>Choose who this is about</PageTitle>
        <p className="o-body o-measure mb-8">
          Questions are answered from one person&rsquo;s record. Open somebody from your caseload
          and this becomes their record.
        </p>
        <Link to="/caseload" className="o-btn o-btn-primary no-underline">
          Go to your caseload
        </Link>
      </>
    )
  }

  return (
    <>
      <PageTitle>
        {mine ? 'Ask about your record' : `Ask about ${subjectName || 'this record'}`}
      </PageTitle>

      <div>
        {/*
          A visible label, never a placeholder.

          Placeholder text disappears the moment somebody types, taking the only
          description of the field with it — and it is the first thing lost by
          anyone who looks away mid-sentence.
        */}
        <label htmlFor="orca-ask" className="o-h3 mb-3 block">
          Type your question
        </label>
        <textarea
          id="orca-ask"
          className="o-input"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        {file ? (
          <div className="mt-4 border border-black p-4">
            <p className="o-body">
              {file.fileType} · {file.title}
            </p>
            <button type="button" className="o-meta mt-2 underline" onClick={() => setFile(null)}>
              Remove this file
            </button>
          </div>
        ) : null}

        {fileProblem ? (
          <p className="o-body o-measure mt-4 border border-black p-4">{fileProblem}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-4">
          <button
            type="button"
            className="o-btn o-btn-primary"
            onClick={() => void send()}
            disabled={sending || !question.trim()}
          >
            {sending ? 'Sending' : 'Ask'}
          </button>
          <label className="o-btn cursor-pointer">
            Attach a file
            <input
              type="file"
              className="sr-only"
              accept={ACCEPTED_FILES}
              onChange={(e) => {
                void take(e.target.files?.[0])
                // Clearing lets the same file be chosen again after removing it.
                e.target.value = ''
              }}
            />
          </label>
          {/*
            Rehearse: decide the route and compose the trigger, send nothing.

            A visible control rather than a hidden query parameter, and it earns
            its place on this screen rather than in a developer menu. Two of the
            five routes exist only as a consequence of history — a draft from a
            recent retrieval, a replay of an answer already given — so they
            cannot be reached at all until a real run has come back with an
            answer. Rehearsal is the only way to exercise the routing when the
            workflows are mid-configuration, which is exactly when somebody
            needs to see whether what is on screen came from a real run.

            The answer screen labels it loudly, above everything else, because
            a rehearsal looks identical to a real answer by design: same
            routing, same composition, same rendering. That fidelity is the
            point and also the hazard.
          */}
          <button
            type="button"
            className="o-btn"
            onClick={() => void send(true)}
            disabled={sending || !question.trim()}
            title="Decide the route and compose the request, without running anything"
          >
            Rehearse
          </button>
        </div>

        <p className="o-meta o-measure mt-5">
          {mine
            ? 'Your record is read to answer this. Nothing is sent to anyone else unless you decide to send it.'
            : `This is answered from ${subjectName ? `${subjectName}’s` : 'this'} record, within what you may see. Nothing is sent to anyone without ${subjectName ? `${subjectName.split(' ')[0]}’s` : 'their'} decision.`}
        </p>
      </div>

      {/*
        History, not suggestions.

        Only for the people who ask enough for it to be history: an employer
        asks two or three questions a quarter, and a column of two cards is
        furniture rather than a shortcut.
      */}
      {showsRecent(role) && recent.length ? (
        <section className="o-section">
          <SectionHead>Recently asked</SectionHead>
          <ul className="grid gap-6 sm:grid-cols-2">
            {recent.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link to={`/ask/${a.id}`} className="block no-underline">
                  <Card tone={a.tone} tall className="h-full">
                    <div className="flex h-full flex-col justify-between p-6">
                      <p className="o-h3">{a.question}</p>
                      <p className="o-meta mt-6">
                        {shortDate(a.at)}
                        {outcomeLabel(a.shape)}
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <p className="o-meta o-measure mt-5">
            Opening one of these shows the answer you were already given. Nothing is run again.
          </p>
        </section>
      ) : null}

      {/* A legend, once, on the one screen where all five colours can appear. */}
      {role === 'patient' && recent.length ? <Legend /> : null}
    </>
  )
}

function showsRecent(role: string | null): boolean {
  return role !== 'employer' && role !== 'university'
}

/**
 * How a card says what became of the question.
 *
 * In words, on every card, because the colour block above it cannot carry this
 * on its own — a reader who does not distinguish coral from mint would
 * otherwise have six identical cards. Colour is the second signal here, never
 * the only one.
 */
function outcomeLabel(shape: Shape): string {
  switch (shape) {
    case 'waiting':
      return ' · still working'
    case 'refusal':
      return ' · not available to you'
    case 'gate':
      return ' · needs permission'
    case 'clarify':
      return ' · needs one more detail'
    case 'unknown':
      return ' · the record does not answer this'
    case 'error':
      return ' · did not run'
    default:
      return ''
  }
}

/**
 * What the colours mean, stated rather than left to be inferred.
 *
 * A colour system that has to be guessed at is decoration wearing a uniform.
 * Shown only to the person who has all five, and only once she has asked
 * something, so it is a key to what is on the screen rather than a lesson
 * before it.
 */
function Legend() {
  const rows: [string, string][] = [
    ['current', 'Current — in place now'],
    ['past', 'Past — resolved or historical'],
    ['decision', 'Needs a decision from you'],
    ['shared', 'Shared with someone else'],
    ['confirmed', 'Confirmed by a professional'],
  ]
  return (
    <section className="o-section">
      <SectionHead>What the colours mean</SectionHead>
      <ul className="space-y-4">
        {rows.map(([tone, label]) => (
          <li key={tone} className={`flex items-center gap-4 ${toneClass[tone as never]}`}>
            <span
              aria-hidden
              className="h-6 w-12 shrink-0 border border-black"
              style={{ background: 'var(--tone)' }}
            />
            <span className="o-body">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
