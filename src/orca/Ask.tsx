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
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../state/session'
import { ACCEPTED_FILES, type Attached, attachFile } from '../lib/attach'
import { type Ask, useAsks } from './asks'
import { useSubject } from './subject'
import { Card, PageTitle, SectionHead, shortDate } from './parts'
import { boundaryFor, toneClass } from './system'
import { ActionButton, useAction } from './action'
import { clearQuestion, readQuestion, writeQuestion } from './question'

export default function Ask() {
  const { role, option } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const { ask, recent } = useAsks()
  const navigate = useNavigate()

  /**
   * Coming back from an answer arrives with the question still in hand.
   *
   * Pressing "Back to Ask" used to land on an empty box, which asks somebody to
   * retype a sentence that was on the screen they just left — and for anyone
   * who found writing it expensive the first time, that is the whole task
   * again. The answer screen sends the question along with the navigation and
   * this picks it up.
   *
   * Read once, into the initial state. Reading it on every render would fight
   * the person's editing, and re-seeding it after they cleared the box would
   * put back something they deliberately removed.
   */
  const { state } = useLocation()
  const returned = (state as { question?: string } | null)?.question
  const personId = option?.personId ?? ''
  /**
   * Whichever is more recent: what you were brought back with, or what you
   * left in the box.
   *
   * The returned question wins because it is the more deliberate of the two —
   * somebody pressed Back to Ask from an answer, which is a request for that
   * question specifically.
   */
  const [question, setQuestion] = useState(() => returned ?? readQuestion(personId))
  const [file, setFile] = useState<Attached | null>(null)
  const [fileProblem, setFileProblem] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)

  /**
   * And the cursor is in the box, at the end of what is already there.
   *
   * Returning to edit a question and then having to click into the field first
   * is the small, constant tax that makes an interface feel like a form rather
   * than a conversation. Only on a return — an unprompted focus on a first
   * visit would scroll the page and start a screen reader mid-sentence.
   */
  useEffect(() => {
    if (!returned) return
    /**
     * Deferred by one frame, to win an argument it would otherwise lose.
     *
     * The shell focuses the page heading after every navigation, which is the
     * right default and is what orients somebody arriving at a screen. React
     * runs a child's effects before its parent's, so this would put the cursor
     * in the box and the shell would immediately take it back out again. One
     * frame later, both have run and this is the last word.
     *
     * Only on a return. Focusing a text field unprompted on a first visit
     * scrolls the page and starts a screen reader in the middle of a form.
     */
    const id = requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    })
    return () => cancelAnimationFrame(id)
  }, [returned])

  /**
   * Written down as it is typed, and never discarded without saying so.
   *
   * There is no Save button here and there should not be one. What this
   * replaces is silence: a question typed and then interrupted used to be gone
   * with nothing said about it, and the interruptions this has to survive are
   * ordinary ones — a nav press, a Back, a phone locking mid-sentence.
   */
  useEffect(() => {
    writeQuestion(personId, question)
  }, [personId, question])

  /**
   * Closing the tab is the one interruption this cannot save you from.
   *
   * Session storage survives a navigation and a reload; it does not survive the
   * tab being closed, which is exactly when somebody is least expecting to lose
   * something. The browser's own prompt is the only thing that can interrupt
   * that, and it is only registered while there is genuinely something to lose
   * — a permanent handler would make every ordinary tab close ask a question.
   */
  useEffect(() => {
    if (!question.trim()) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [question])

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

  async function send(rehearse: boolean) {
    const body = question.trim()
    if (!body) return false
    const id = await ask(body, { file, rehearse })
    // Cleared only once the question has been accepted, never before. A box
    // emptied by a press that then failed has thrown the sentence away on the
    // person's behalf.
    clearQuestion(personId)
    setQuestion('')
    setFile(null)
    navigate(`/ask/${id}`)
    return true
  }

  /**
   * Two controls, one at a time.
   *
   * Each holds its own state so the label that changes is the one that was
   * pressed — the old single `sending` flag disabled both and re-labelled
   * neither, so somebody who pressed Rehearse watched Ask say "Sending". They
   * still lock each other out, because one question cannot be both rehearsed
   * and sent.
   *
   * Both of these navigate away on success, so the finished label is not really
   * for the person who is still looking — it is for the case where `ask` comes
   * back without a run and the navigation never happens. Before this, that path
   * left the button disabled and silent, and the only recovery on offer was a
   * reload.
   */
  const asking = useAction(() => send(false))
  const rehearsing = useAction(() => send(true))
  const busy = asking.busy || rehearsing.busy

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
          ref={box}
          className="o-input"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        {returned && question === returned ? (
          <p className="o-meta o-measure mt-3">
            This is the question you just asked. Change it, or ask it again as it is.
          </p>
        ) : question.trim() ? (
          <p className="o-meta o-measure mt-3" role="status">
            Kept as you type. Leaving this screen does not lose it.
          </p>
        ) : null}

        {file ? (
          <div className="mt-4 o-panel p-4">
            <p className="o-body">
              {file.fileType} · {file.title}
            </p>
            <button type="button" className="o-meta mt-2 underline" onClick={() => setFile(null)}>
              Remove this file
            </button>
          </div>
        ) : null}

        {/*
          Said in words, next to the control it belongs to, and announced.

          `role="alert"` because the file is chosen in an operating-system dialog
          that closes over this page: somebody using a screen reader is looking
          somewhere else entirely at the moment the message appears, and an
          unannounced sentence four lines above the button is a sentence nobody
          reads. `aria-describedby` ties it to the input rather than leaving the
          association to proximity.
        */}
        {fileProblem ? (
          <p id="orca-file-problem" role="alert" className="o-body o-measure mt-4 o-panel p-4">
            {fileProblem}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-4">
          {/*
            The words the wait is actually about.

            "Sending" describes the network; "Checking your record" describes
            what is happening to the person's own life, which is the thing they
            are waiting on. It is the same sentence the answer screen continues
            with, so the two screens read as one action rather than two.

            The button is as wide as this label from the first paint — see the
            label stack in action.tsx. That is deliberate: a control that grows
            when pressed moves everything beside it at the moment somebody's
            pointer is over it.
          */}
          <ActionButton
            action={asking}
            idle="Ask"
            working="Checking your record…"
            done="Asked"
            failed="Did not send"
            primary
            disabled={busy || !question.trim()}
          />
          <label className="o-btn cursor-pointer">
            Attach a file
            <input
              type="file"
              className="sr-only"
              accept={ACCEPTED_FILES}
              aria-invalid={fileProblem ? true : undefined}
              aria-describedby={fileProblem ? 'orca-file-problem' : undefined}
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
          <ActionButton
            action={rehearsing}
            idle="Rehearse"
            working="Composing"
            done="Composed"
            failed="Did not run"
            disabled={busy || !question.trim()}
            title="Decide the route and compose the request, without running anything"
          />
        </div>

        <p className="o-meta o-measure mt-5">
          {mine
            ? 'Your record is read to answer this. Nothing is sent to anyone else unless you decide to send it.'
            : `This is answered from ${subjectName ? `${subjectName}’s` : 'this'} record, within what you may see. Nothing is sent to anyone without ${subjectName ? `${subjectName.split(' ')[0]}’s` : 'their'} decision.`}
        </p>
      </div>

      <Boundary />

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
                {/*
                  The shape mark, and only for Ananya.

                  Eight cards of identical type is a wall to be read rather than
                  scanned; the mark is what lets her find the one about her
                  mornings before she has read a word. It says nothing the title
                  does not — see shape.tsx — so the professionals below get the
                  colour band they already had and lose nothing by it.
                */}
                <Link to={`/ask/${a.id}`} className="block no-underline">
                  <Card
                    tone={a.tone}
                    tall
                    mark={mine ? (a.domain ?? 'Personal') : undefined}
                    className="h-full"
                  >
                    <div className="flex h-full flex-col justify-between p-6">
                      <p className="o-h3">{a.question}</p>
                      <p className="o-meta mt-6">
                        {shortDate(a.at)}
                        {outcomeLabel(a)}
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

/**
 * What this person cannot ask about, said before they ask it.
 *
 * The boundary was only ever stated on the way out — on the answer screen, and
 * in the "Not shown" section of the record. Both are after the fact. Anil's
 * first act in this product was therefore to spend a question finding out that
 * a whole category of question is not his to ask, and Sana's was to discover
 * mid-task that the clinical half of what she wanted runs through Ananya.
 *
 * Learning a rule by breaking it is a reasonable way to learn a game and a poor
 * way to learn what you are allowed to know about a colleague's medical record.
 * The refusals stay exactly as they are — this does not replace them, and it is
 * deliberately not a list of permitted phrasings, which would turn an open box
 * into a guessing game about wording.
 *
 * Renders nothing for the people who have no boundary: Ananya, and the three
 * clinicians who hold the whole clinical record. A standing notice telling them
 * about a limit they do not have would invent one.
 */
function Boundary() {
  const { role } = useSession()
  const boundary = boundaryFor(role)
  if (!boundary) return null

  return (
    <section className="o-section">
      <SectionHead>What is not part of your access</SectionHead>
      <p className="o-body o-measure">{boundary.what}</p>
      <p className="o-body o-measure mt-4">
        It is held by {boundary.who}.
      </p>
      <p className="o-meta o-measure mt-5">
        Asking about it is not a mistake and costs nothing. You will be told plainly, and nothing
        is read from the record to tell you.
      </p>
    </section>
  )
}

function showsRecent(role: string | null): boolean {
  return role !== 'employer' && role !== 'university'
}

/** Matches the answer screen: past this, "still working" stops being true. */
const SILENT_AFTER_MS = 10 * 60 * 1000

/**
 * How a card says what became of the question.
 *
 * In words, on every card, because the colour block above it cannot carry this
 * on its own — a reader who does not distinguish coral from mint would
 * otherwise have six identical cards. Colour is the second signal here, never
 * the only one.
 */
function outcomeLabel(a: Ask): string {
  switch (a.shape) {
    case 'waiting':
      // A card that still says "working" an hour later is the same false
      // promise the answer screen used to make, in miniature.
      return Date.now() - Date.parse(a.at) > SILENT_AFTER_MS
        ? ' · no answer came back'
        : ' · still working'
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
              className="h-6 w-12 shrink-0 border border-[var(--ink)]"
              style={{ background: 'var(--tone)' }}
            />
            <span className="o-body">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
