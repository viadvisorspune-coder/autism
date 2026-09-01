/**
 * The answer, and the six other things an answer can turn out to be.
 *
 * Seven shapes, one treatment each, the same for every user so each shape is
 * learnable once: answered, needs one more detail, the record cannot settle it,
 * waiting on someone, not available to you, needs a permission only Ananya can
 * give, or it did not run.
 *
 * Which one you get is decided by who is asking and what they asked about —
 * never by whether the record happens to hold it, because a difference between
 * "there is nothing" and "you may not see it" is itself a disclosure.
 *
 * The three that are easiest to collapse into each other, and must not be:
 *
 *   NOT AVAILABLE  a boundary around access. Somebody else can see this.
 *   CANNOT ANSWER  a boundary around evidence. Nobody wrote it down.
 *   DID NOT RUN    neither. The question never reached the record.
 *
 * Rendering any of those as the others tells the person something false about
 * their own life, and for a record made mostly of gaps that is the most likely
 * way this interface could mislead somebody.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../state/session'
import { type Ask, useAsks } from './asks'
import { useSubject } from './subject'
import {
  Back,
  Card,
  Disclosure,
  Gate,
  NotShown,
  Nothing,
  Prose,
  Refusal,
  SectionHead,
  longDate,
} from './parts'
import { boundaryFor, pathMeaning, pathName } from './system'
import { ActionButton, useAction } from './action'

export default function Answer() {
  const { askId = '' } = useParams()
  const { role } = useSession()
  const { subjectName } = useSubject()
  const { find, ask, requestAccess } = useAsks()
  const navigate = useNavigate()
  const item = find(askId)

  if (!item) {
    return (
      <>
        <Back to="/ask">Back to Ask</Back>
        <Nothing>
          That question is not in this session. Questions are kept for as long as you are signed
          in on this device.
        </Nothing>
      </>
    )
  }

  const boundary = boundaryFor(role)

  return (
    <>
      <Back to="/ask" state={{ question: item.question }}>
        Back to Ask
      </Back>
      <h1 className="o-h2 o-measure mb-3" tabIndex={-1} data-focus-target>
        {item.question}
      </h1>
      <Routing item={item} />

      {item.attached ? (
        <p className="o-meta mb-6">
          Sent with {item.attached.fileType} · {item.attached.title}
        </p>
      ) : null}

      {item.rehearsed ? (
        <p className="o-body o-measure mb-6 o-panel p-4 font-semibold">
          Rehearsal. This was routed and composed exactly as a real question would be, and then
          not sent. Nothing was read from the record.
        </p>
      ) : null}

      {item.shape === 'refusal' ? (
        <Refusal
          domain={item.domain}
          instead={
            role === 'trusted' ? (
              <>
                Ananya can tell you herself if she wants to. ORCA will not share her health
                information without her deciding to.
              </>
            ) : undefined
          }
        />
      ) : null}

      {item.shape === 'gate' ? (
        <Gate
          domain={item.domain}
          kind={item.gateKind ?? 'domain'}
          requested={item.requested}
          onRequest={() => requestAccess(item.id)}
        />
      ) : null}

      {item.shape === 'waiting' ? <Waiting at={item.at} status={item.status} /> : null}

      {/*
        The answer arrives whole.

        No typing animation and nothing revealed a line at a time. An answer
        about somebody's own health is not a performance, and text that is still
        assembling cannot be read, skimmed, or copied — it can only be watched.
        The whole block is there on the first frame it exists.

        `data-arrive` is the only movement: one 220ms settle, once, so the
        change from "Working on this" to an answer reads as this card replacing
        that one rather than as the page having been different all along. The
        answer is fully legible throughout it and the CSS drops it entirely
        under reduced motion.

        Keyed by shape so it plays when the shape changes and not on the
        four-second poll that re-renders this screen with the same answer in it.
      */}
      {item.shape === 'answer' && item.answer ? (
        <div key={`answer-${item.id}`} data-arrive className="my-12">
          {/*
            Tier 2. The one thing on this screen.

            Everything else here — the routing line, the sources, the boundary —
            is supporting, and now looks it: resting elevation, smaller radius,
            quieter. This block is the reason the person came.
          */}
          <Card tone={item.tone} raised>
            <div className="o-card-body">
              <Prose html={item.answer} />
            </div>
          </Card>
        </div>
      ) : null}

      {/*
        One more detail needed — a conversational state, not a failure.

        The options come from the workflow, so they are rendered rather than
        invented, and tapping one asks the question again with that answer
        appended. The person can also ignore them and type something else:
        offering choices should never become a requirement to pick one.
      */}
      {item.shape === 'clarify' ? (
        <Card tone="decision">
          <div className="o-card-body">
            <h2 className="o-h2 mb-6">I need one more detail</h2>
            <p className="o-body o-measure">
              {item.clarifyQuestion ??
                'Something is missing before this can be answered from the record.'}
            </p>

            {/*
              The original question, shown rather than remembered.

              It is already the heading of this screen, and it is still the
              heading of the next one — picking an option asks the same question
              with the detail added, which is what keeps the thread continuous
              instead of starting a new one. Saying so removes the fear that
              answering a follow-up throws away what was typed.
            */}
            <h3 className="o-h3 mb-2 mt-8">What you asked</h3>
            <p className="o-body o-measure">&ldquo;{item.question}&rdquo;</p>
            <p className="o-meta o-measure mt-2">
              This is kept. Choosing below asks it again with the detail added, and the answer
              arrives on a screen that still shows this question.
            </p>

            {item.clarifyOptions?.length ? (
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                {item.clarifyOptions.map((o) => (
                  <ClarifyOption
                    key={o}
                    label={o}
                    run={async () => {
                      const id = await ask(`${item.question} ${o}`)
                      navigate(`/ask/${id}`)
                      return true
                    }}
                  />
                ))}
              </div>
            ) : null}

            <p className="o-meta o-measure mt-6">
              Nothing has been answered yet. You can also go back and ask it differently — your
              question comes back with you.
            </p>
          </div>
        </Card>
      ) : null}

      {/*
        The record does not settle it.

        Kept strictly apart from a refusal, which is the single most important
        distinction on this screen. "You may not see this" is a boundary around
        access. "The record does not say" is a boundary around evidence. Told
        the first when the truth is the second, a person concludes their record
        is closed to them; told the second when the truth is the first, they
        conclude nothing happened. For a record built out of gaps, those are
        opposite and equally damaging mistakes.
      */}
      {item.shape === 'unknown' ? (
        /*
         * Not animated, and not styled as a failure.
         *
         * This is an answer — the record was read, and what it holds does not
         * settle the question. Giving it an arrival transition would group it
         * with the answer card as a thing that happened, and giving it the
         * decision tone would group it with the failures. It is neither. It
         * appears in place, in the tone the record uses for things that are
         * settled and quiet, and the person can read it at their own pace.
         *
         * Said in the first person, because it is ORCA's limit rather than the
         * person's. "The record does not answer this" puts the shortfall on
         * their record and, by implication, on the life it describes.
         */
        <Card tone="past">
          <div className="o-card-body">
            <h2 className="o-h2 mb-6">I can&rsquo;t determine this from the record</h2>

            <h3 className="o-h3 mb-2">What the record shows</h3>
            <p className="o-body o-measure">
              {item.detail ??
                'Your record was read in full, within what you may see. What is in it does not settle this question either way.'}
            </p>

            <h3 className="o-h3 mb-2 mt-8">What is unknown</h3>
            <p className="o-body o-measure">
              Whatever would answer this was never written down. Nobody recorded it, which is a
              fact about the record and not about you.
            </p>

            <h3 className="o-h3 mb-2 mt-8">What this does not mean</h3>
            <p className="o-body o-measure">
              It does not mean nothing happened, and it does not mean anything was hidden from
              you. A record shows what somebody wrote down, and silence in it is silence about
              the writing, not about the life.
            </p>
          </div>
        </Card>
      ) : null}

      {item.shape === 'error' ? (
        <Card tone="past">
          <div className="o-card-body">
            <h2 className="o-h2 mb-6">This did not run</h2>
            <p className="o-body o-measure">
              {item.detail ?? 'No reason was given for this stopping.'}
            </p>
            <h3 className="o-h3 mb-2 mt-8">What happened to your question</h3>
            <p className="o-body o-measure">
              Nothing was read from the record, nothing was retried, and nothing else was run in
              its place. Asking again is safe.
            </p>
            <Link to="/ask" className="o-btn o-btn-primary mt-8 no-underline">
              Ask it again
            </Link>
          </div>
        </Card>
      ) : null}

      {/*
        Where this comes from, as a list rather than as footnotes.

        Each line is a record id, who wrote it, and when. That is the difference
        between an answer and an assertion, and it is the part a clinician reads
        first.
      */}
      {/*
        What the answer rests on, and — the half usually left out — the
        statement that it rests on nothing else.

        A list of citations tells you what was used. It does not tell you
        whether anything else was consulted and discarded, which for a system
        that reads somebody's whole record is the more important question. The
        closing line answers it.

        Each source opens the entry it names. Provenance you cannot follow is a
        reference, not evidence.
      */}
      {item.shape === 'answer' && item.sources?.length ? (
        <section className="o-section">
          {/*
            Opened rather than always open, and the count stays outside it.

            The list is four fields per entry and can run to a dozen entries,
            which on a phone puts the boundary statement below it off the
            bottom of a very long screen. What must never be behind the
            disclosure is the fact that there are sources at all — an answer
            resting on three entries and one resting on none have to be
            distinguishable without pressing anything, so the count is the
            note, not the content.
          */}
          <Disclosure
            summary="Where this comes from"
            note={
              <p className="o-body o-measure">
                Based on {item.sources.length}{' '}
                {item.sources.length === 1 ? 'entry' : 'entries'} in the record.
              </p>
            }
          >
            <ul className="space-y-6">
              {item.sources.map((s, i) => (
                <li key={i} className="o-panel p-5">
                  {/*
                    Four separate lines, not one joined string.

                    They were being concatenated with middots, which reads as a
                    single label and gives the identifier, the person and the
                    date equal weight. A clinician checking provenance is
                    reading three different things, and the record id is the
                    one they will quote.
                  */}
                  {s.id ? <p className="o-meta font-mono">{s.id}</p> : null}
                  <p className="o-body mt-1">{s.label ?? 'Entry in the record'}</p>
                  <p className="o-meta mt-2">
                    {[s.reporter, longDate(s.date) || s.date].filter(Boolean).join(' · ') ||
                      'No reporter or date was given.'}
                  </p>
                  {s.id ? (
                    <Link
                      to={`/record/${s.id}`}
                      state={{ from: `/ask/${item.id}`, label: 'the answer' }}
                      className="o-body mt-3 inline-block underline"
                    >
                      Open this entry
                    </Link>
                  ) : (
                    <p className="o-meta mt-3">
                      This entry did not come back with an identifier, so it cannot be opened.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="o-meta o-measure mt-6">No other entries were used to write this.</p>
          </Disclosure>
        </section>
      ) : null}

      {/*
        An answer that cites nothing says so.

        Silence here used to read as "there were no sources worth listing",
        when what it actually means is that the answer arrived without any —
        and an unattributed statement about somebody's health is exactly the
        thing this product exists to stop being normal.
      */}
      {item.shape === 'answer' && item.answer && !item.sources?.length ? (
        <section className="o-section">
          <SectionHead>Where this comes from</SectionHead>
          <p className="o-body o-measure">
            This answer came back without naming the entries it was drawn from. Treat it as a
            starting point rather than as something the record has confirmed.
          </p>
        </section>
      ) : null}

      {item.files?.length ? (
        <section className="o-section">
          <SectionHead>What this produced</SectionHead>
          <ul className="space-y-5">
            {item.files.map((f) => (
              <li key={f.id} className="o-panel p-6">
                <p className="o-h3">{f.title}</p>
                <p className="o-meta mt-1">
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
              </li>
            ))}
          </ul>
          <p className="o-meta o-measure mt-5">
            These links last about half an hour. Reload this page for a fresh one.
          </p>
        </section>
      ) : null}

      {/*
        The boundary, on every answer rather than only on the refusals.

        Making it exceptional would mean most people never discover it exists;
        standing, it stops reading as a rebuke on the occasions when it matters.
      */}
      {item.shape === 'answer' ? (
        <section className="o-section">
          <hr className="o-rule mb-8" />
          <NotShown boundary={boundary} />
          {!boundary ? (
            <>
              <h3 className="o-h3 mb-2">Not shown</h3>
              <p className="o-body o-measure">
                Nothing was held back from this answer. You can see everything in{' '}
                {role === 'patient' ? 'your own record' : `${subjectName || 'this'} record`} that
                bears on the question you asked.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {item.shape === 'answer' && item.answer ? (
        <section className="o-section">
          <SectionHead>What you can do next</SectionHead>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link to="/ask" className="o-btn flex-1 no-underline">
              Ask something else
            </Link>
            <button
              type="button"
              className="o-btn o-btn-primary flex-1"
              onClick={async () => {
                const id = await ask(
                  `Make this into a document I can share: ${item.question}`,
                )
                navigate(`/ask/${id}`)
              }}
            >
              Make this into a document
            </button>
          </div>
          <p className="o-meta o-measure mt-5">
            A document is written first and shown to {role === 'patient' ? 'you' : 'Ananya'}{' '}
            before it goes anywhere. It appears in Decisions.
          </p>
        </section>
      ) : null}
    </>
  )
}

/**
 * Which combination of workflows this question was routed to.
 *
 * Sits under the question rather than beside the answer, because it describes
 * what is about to happen and is therefore worth reading before the answer
 * arrives — a person handing over a question about their own medical record is
 * owed the knowledge of what will be done with it.
 *
 * The reason sentence comes from the server, which is where the decision was
 * made, so the two cannot drift apart. The path name is added in front of it
 * for anyone reading this as a system rather than as a record.
 *
 * A REFUSAL AND A GATE SAY SO PLAINLY. Nothing ran, nothing was read, and that
 * is the most important thing on the screen after the boundary itself.
 */
function Routing({ item }: { item: Ask }) {
  if (item.shape === 'refusal' || item.shape === 'gate') {
    return (
      <p className="o-meta o-measure mb-8">
        No workflow ran. Nothing was read from the record to produce this.
      </p>
    )
  }

  /**
   * A request that never reached the router chose nothing.
   *
   * This said "Choosing which workflow to run" for anything without a path,
   * which included every failed send — so a question that could not leave the
   * browser sat under a line claiming a decision was still being made about
   * it. Nothing was being decided; nothing had arrived.
   */
  if (item.shape === 'error') {
    return (
      <p className="o-meta o-measure mb-8">
        No workflow ran. The request did not reach the point where one is chosen.
      </p>
    )
  }

  // Between pressing Ask and the server answering the handshake, the route is
  // genuinely not known yet. Naming a workflow here would be a guess.
  if (!item.path) {
    return <p className="o-meta o-measure mb-8">Choosing which workflow to run.</p>
  }

  const name = pathName[item.path]
  const meaning = pathMeaning[item.path]

  return (
    <p className="o-meta o-measure mb-8">
      <span className="font-semibold">{name ?? item.path}</span>
      {meaning ? ` — ${meaning}` : ''}
      {item.reason ? <> {item.reason}</> : null}
    </p>
  )
}

/**
 * How long a run may sit unanswered before the screen says something.
 *
 * Neither of these is a timeout. Nothing is cancelled and the run is still
 * going at Yoxa; these are the two points at which what the screen was saying
 * stops being true.
 *
 * SLOW, at three minutes: longer than usual, still entirely normal.
 *
 * SILENT, at ten: long enough that this is no longer a slow run. The interface
 * had been saying "the answer will be here", which it cannot know and, for a
 * workflow with no return step configured, is simply false — ORCA has no way
 * to ask Yoxa whether a run has finished, so an answer arrives only if the
 * workflow sends one. Continuing to promise it would make this screen the most
 * confidently wrong thing in the product.
 */
/**
 * One of the answers to "one more detail".
 *
 * A component rather than a button in the map, so each option can report on
 * itself — and so pressing one cannot be pressed twice. Two presses here start
 * two runs against the same question, and the person then has two answer
 * screens for one thing they asked once.
 *
 * The working label is the same sentence the Ask button uses, because it is the
 * same act: this is the question being asked again with the detail filled in.
 */
function ClarifyOption({ label, run }: { label: string; run: () => Promise<boolean> }) {
  const action = useAction(run)
  return (
    <ActionButton
      action={action}
      idle={label}
      working="Checking your record…"
      done="Asked"
      failed="Did not send"
    />
  )
}

const SLOW_AFTER_MS = 3 * 60 * 1000
const SILENT_AFTER_MS = 10 * 60 * 1000

function Waiting({ at, status }: { at: string; status?: string }) {
  /**
   * Nothing else on this screen re-renders on a schedule, so the notice needs
   * its own clock — but only for as long as the words can still change.
   *
   * There are two moments this clock exists to catch, at three minutes and at
   * ten. Past the second one the copy is final: a run that has been silent for
   * ten minutes has no further state to reach by waiting, and the answer, if
   * one ever arrives, arrives through the record and re-renders this component
   * anyway. So the timer stands down instead of ticking every fifteen seconds
   * for as long as the tab is open, which on the answer screen somebody leaves
   * open all afternoon is a wake-up every fifteen seconds to redraw text that
   * cannot change.
   */
  const [, tick] = useState(0)
  const settled = Date.now() - Date.parse(at) > SILENT_AFTER_MS
  useEffect(() => {
    if (settled) return
    const id = window.setInterval(() => tick((n) => n + 1), 15_000)
    return () => window.clearInterval(id)
  }, [settled])

  if (status === 'needs_approval') {
    return (
      <Card tone="decision">
        <div className="o-card-body">
          <h2 className="o-h2 mb-6">Waiting on a decision</h2>
          <p className="o-body o-measure">
            This has stopped for a person to decide. Nothing has been sent and nothing will be
            until they do. It is waiting in Decisions.
          </p>
          <Link to="/decisions" className="o-btn o-btn-primary mt-6 no-underline">
            Go to Decisions
          </Link>
        </div>
      </Card>
    )
  }

  const waited = Date.now() - Date.parse(at)

  /**
   * Nothing has come back, and by now that means something.
   *
   * The honest version of this screen, and the reason it exists: ORCA cannot
   * poll Yoxa. There is no read API, so a run's answer reaches this record only
   * because the workflow pushed it — into the conversation, onto the run row,
   * or through an approval gate. A workflow with none of those configured
   * produces a perfectly good answer that has nowhere to go.
   *
   * That is not the person's fault and not a failure of their record, so this
   * says which of those it is, and does not pretend the answer is still on its
   * way.
   */
  if (waited > SILENT_AFTER_MS) {
    return (
      <Card tone="past">
        <div className="o-card-body">
          <h2 className="o-h2 mb-6">No answer has come back</h2>
          <p className="o-body o-measure">
            Your question was accepted and the work was started. Nothing has been returned since,
            and at this point it probably will not be.
          </p>

          <h3 className="o-h3 mb-2 mt-8">What this is not</h3>
          <p className="o-body o-measure">
            Nothing failed in your record, nothing was lost, and nothing was refused. This is a
            connection between two systems, not a boundary and not a fault of yours.
          </p>

          <h3 className="o-h3 mb-2 mt-8">Why it happens</h3>
          <p className="o-body o-measure">
            ORCA cannot ask whether a run has finished — it can only be told. An answer arrives
            because the workflow sends it back, and a workflow that has not been given a way to
            send it will finish quietly on the other side.
          </p>

          <h3 className="o-h3 mb-2 mt-8">What you can do</h3>
          <p className="o-body o-measure">
            Ask it again if you want to. Nothing is duplicated by trying, and nothing was written
            by the attempt that went quiet.
          </p>
          <Link to="/ask" className="o-btn o-btn-primary mt-6 no-underline">
            Ask something
          </Link>
        </div>
      </Card>
    )
  }

  const slow = waited > SLOW_AFTER_MS

  return (
    <Card tone="current">
      {/*
        A live region, because this text changes on a clock rather than on a
        press. It rewrites itself at three minutes to say the wait is longer
        than usual, and somebody who is not watching the screen — which is
        exactly what this card tells them they may do — otherwise never learns
        that. Polite, not an alert: it is progress, not an interruption.
      */}
      <div className="o-card-body" role="status">
        <h2 className="o-h2 mb-6">{slow ? 'Still working on this' : 'Working on this'}</h2>
        <p className="o-body o-measure">
          {slow
            ? 'This is taking longer than usual. Nothing has failed and nothing has been lost. You can leave this page and come back.'
            : 'The record is being read. This usually takes under a minute, and you can leave this page and come back.'}
        </p>
        {/*
          Never "the answer will be here". Whether it arrives depends on the
          workflow sending it, which this screen cannot know and must not
          promise on its behalf.
        */}
        <p className="o-meta o-measure mt-4">
          If an answer comes back it appears here on its own. You do not need to keep this page
          open.
        </p>
      </div>
    </Card>
  )
}
