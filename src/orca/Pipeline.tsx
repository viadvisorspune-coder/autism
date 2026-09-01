/**
 * The launcher for the fifteen-step pipeline, and nothing else.
 *
 * WHY THIS IS A SEPARATE SCREEN. Ask routes: it reads the sentence, weighs what
 * is already on the record, and picks one of several lanes. That is the right
 * behaviour and it is exactly wrong when the thing you want to see is one
 * specific chain running. A question phrased slightly differently goes
 * somewhere else, and you are left wondering whether the pipeline is broken or
 * the wording was. Here the lane is fixed before the box is drawn.
 *
 * IT DOES NOT SHOW THE ANSWER, ON PURPOSE. The governed chain's output is a
 * file that arrives after a run that stops for human approval on the way. That
 * is a job for Decisions and Documents, which already do it properly. What this
 * screen owes you is narrower and it is what a launcher owes: proof the trigger
 * left, the two ids needed to follow it, and the run's state as the record sees
 * it. Watching it happen belongs in Yoxa's own monitor, which is better at it.
 *
 * NOTHING HERE IS A SECOND CONVERSATION. It does not write into the chat, it
 * keeps no history of its own, and a run started here appears on the record
 * like any other. A launcher that accumulated its own thread would be a second
 * place to look for the same runs.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/session'
import { useLive } from '../lib/live'
import { useSubject } from './subject'
import { PageTitle, Updated } from './parts'
import { IconArrow, IconChevron } from './icons'

interface RunRow {
  id: string
  workflow_name?: string | null
  status?: string | null
  current_step?: string | null
  path?: string | null
  yoxa_run_id?: string | null
  started_at?: string
  trigger_text?: string | null
}

interface Sent {
  runId: string
  yoxaRunId: string | null
  triggerText: string | null
}

/** What came back when the trigger did not leave. */
interface Refused {
  error: string
  detail: string | null
}

export default function Pipeline() {
  const { option } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [refused, setRefused] = useState<Refused | null>(null)

  const { data, updatedAt, refresh } = useLive<{ runs: RunRow[] }>('workflow_runs', subjectId)
  const runs = (data?.runs ?? []).filter((r) => r.workflow_name === 'fifteen').slice(0, 8)

  const send = async () => {
    const body = message.trim()
    if (!body || sending) return
    setSending(true)
    setSent(null)
    setRefused(null)
    try {
      const { isSupabaseConfigured, supabase } = await import('../lib/supabase')
      if (!isSupabaseConfigured) {
        setRefused({ error: 'no_backend', detail: 'This build has no backend, so nothing was sent.' })
        return
      }

      /**
       * `workflow: 'fifteen'` is the whole point of this screen.
       *
       * It is the caller override the chat already supports, used deliberately
       * rather than as a correction: routing is skipped, and the run is filed
       * under fifteen_step because that is the lane that ran.
       */
      const { data: reply, error } = await supabase.functions.invoke('orca-chat', {
        body: {
          message: body,
          actor_id: option?.personId ?? null,
          patient_id: subjectId,
          workflow: 'fifteen',
          dry_run: false,
        },
      })

      if (error || !reply?.run_id) {
        setRefused({
          error: typeof reply?.error === 'string' ? reply.error : 'could_not_send',
          detail:
            typeof reply?.detail === 'string'
              ? reply.detail
              : 'The trigger did not leave. Nothing was started and nothing was written.',
        })
        return
      }

      setSent({
        runId: String(reply.run_id),
        yoxaRunId: typeof reply.yoxa_run_id === 'string' ? reply.yoxa_run_id : null,
        triggerText: typeof reply.trigger_text === 'string' ? reply.trigger_text : null,
      })
      setMessage('')
      void refresh()
    } finally {
      setSending(false)
    }
  }

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

  return (
    <>
      <PageTitle sub="Every request here goes down the fifteen-step chain. Nothing is routed and no other workflow runs.">
        Run the full pipeline
      </PageTitle>

      <section className="o-section">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label htmlFor="pipeline-message" className="o-label mb-2 block">
            What should it produce{subjectName ? ` about ${subjectName}` : ''}?
          </label>
          <textarea
            id="pipeline-message"
            className="o-input"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="For example: prepare a formal summary of workplace adjustments for occupational health"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="o-btn o-btn-primary"
              disabled={!message.trim() || sending}
            >
              {sending ? 'Sending…' : 'Send to the pipeline'}
              <IconArrow size={16} />
            </button>
            <p className="o-meta">
              This starts a governed run. It stops for a human before anything leaves.
            </p>
          </div>
        </form>
      </section>

      {/*
        Sent, said as narrowly as it is true.

        A trigger accepted is not an answer produced, and this screen must not
        let those blur: it says the run started and where to watch it, and makes
        no claim about what it will come back with.
      */}
      {sent ? (
        <section className="o-section" role="status">
          <div className="o-card">
            <div className="o-card-body">
              <h2 className="o-h3">Sent. The pipeline is running.</h2>
              <p className="o-body o-measure mt-3">
                Nothing has been produced yet and nothing has been disclosed. When the run reaches
                a decision it will appear on{' '}
                <Link to="/decisions" className="underline">
                  Decisions
                </Link>
                ; anything it produces lands on{' '}
                <Link to="/documents" className="underline">
                  Documents
                </Link>
                .
              </p>

              <dl className="mt-5 space-y-3">
                <div>
                  <dt className="o-label">Yoxa run</dt>
                  <dd className="o-body break-all">
                    {sent.yoxaRunId ?? 'Not reported. The trigger was accepted without one.'}
                  </dd>
                </div>
                <div>
                  <dt className="o-label">ORCA run</dt>
                  <dd className="o-body break-all">{sent.runId}</dd>
                </div>
              </dl>

              {/*
                What actually left, not what this page predicted would leave.

                The preamble naming who is asking and what they may ask for is
                composed on the server, so showing the page's own guess would
                be showing a different sentence than the one that was sent.
              */}
              {sent.triggerText ? (
                <details className="mt-5">
                  <summary className="o-label cursor-pointer">What was sent</summary>
                  <pre className="o-meta o-panel mt-3 overflow-x-auto p-4 whitespace-pre-wrap">
                    {sent.triggerText}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/*
        A refusal, in the words the backend used.

        These are almost always configuration — a trigger URL with the secret
        pasted into it, or a deployment that has not been activated in Yoxa —
        and the backend's own sentence names which. Rewriting it into something
        friendlier would remove the only part that tells you what to fix.
      */}
      {refused ? (
        <section className="o-section" role="alert">
          <div className="o-flat p-6">
            <h2 className="o-h3">Nothing was sent.</h2>
            <p className="o-body o-measure mt-3">{refused.detail}</p>
            <p className="o-meta mt-3">{refused.error}</p>
          </div>
        </section>
      ) : null}

      <section className="o-section">
        <h2 className="o-h2 mb-4">Recent pipeline runs</h2>
        {runs.length ? (
          <ul className="o-rows">
            {runs.map((r) => (
              <li key={r.id}>
                <div className="o-row">
                  <span className="o-row-main">
                    <span className="o-row-title block">
                      {r.trigger_text?.match(/"([^"]+)"/)?.[1] ?? r.current_step ?? 'Run'}
                    </span>
                    <span className="o-row-meta block break-all">
                      {r.yoxa_run_id ? `Yoxa ${r.yoxa_run_id}` : 'No Yoxa run — the trigger never left'}
                    </span>
                  </span>
                  <span
                    className={`o-pill ${
                      r.status === 'Completed'
                        ? 'o-pill-done'
                        : r.status === 'Blocked' || r.status === 'Cancelled'
                          ? ''
                          : 'o-pill-waiting'
                    }`}
                  >
                    {r.status}
                  </span>
                  <IconChevron size={16} />
                </div>
                {/*
                  Why a run stopped, rather than only that it did. "Blocked" on
                  its own sends somebody to the logs; the step that blocked it
                  is usually the whole answer.
                */}
                {r.status === 'Blocked' || r.status === 'Cancelled' ? (
                  <p className="o-meta mt-2">{r.current_step}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="o-body o-measure o-flat p-6">
            No pipeline run has been started from this record yet. One sent from here will appear
            in this list within a few seconds.
          </p>
        )}
        <div className="mt-6">
          <Updated at={updatedAt} />
        </div>
      </section>
    </>
  )
}
