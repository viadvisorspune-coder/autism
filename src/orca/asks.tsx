/**
 * The conversation, held once for the whole interface.
 *
 * Ask is the home screen and Answer is a separate destination, so the asks
 * cannot live in either of them — navigating from one to the other would
 * discard the thing being navigated to. They live here, above the router, and
 * survive a reload because the alternative is somebody refreshing after asking
 * about their own medical record and concluding the question was lost.
 *
 * Two roads out of `ask()`, and which one is taken is decided before anything
 * is sent:
 *
 *   THE BOUNDARY IS DECIDED HERE. If this person may not ask this, no run
 *   starts, no record is read, and nothing leaves the browser. A refusal that
 *   arrives after a round trip is a refusal the person watched the system think
 *   about, and thinking about it is exactly what should not be happening.
 *
 *   EVERYTHING ELSE GOES TO THE WORKFLOW. The router on the server picks the
 *   lane, composes the trigger from the actor it resolves, and answers
 *   asynchronously. This polls for that answer rather than awaiting it,
 *   because the request that started the run returned minutes before the run
 *   finished.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useSession } from '../state/session'
import { type Attachment, type ConversationData, persistMessage, useLive } from '../lib/live'
import { type RunStatus, parseEnvelope } from '../lib/envelope'
import type { Attached } from '../lib/attach'
import { type Domain, asksWhy, domainOf, outcomeFor } from './system'
import type { Tone } from './system'
import { useSubject } from './subject'
import {
  type AccessRequest,
  type AccessRequestRow,
  type SharingStopRow,
  REQUESTS_KEY,
  STOPPED_KEY,
  fromRow,
  grantedTo,
  isStopped,
  readRequests,
  readStopped,
  writeRequests,
  writeStopped,
} from './consent'
import { actOnRecord } from '../lib/live'

export type { AccessRequest }

/** One row of `workflow_runs`, as `app-read` returns it. */
interface RunRow {
  id: string
  status: string
  current_step: string
  workflow_name: string | null
  answer_html: string | null
  result: unknown
  trigger_text: string | null
  path: string | null
  route_reason: string | null
}

export interface Source {
  id?: string
  reporter?: string
  date?: string
  label?: string
}

/**
 * A question and everything that became of it.
 *
 * `shape` is the one field the interface branches on, and it is set before a
 * run starts for the two cases that never start one. Four shapes, so the
 * treatment is learnable once:
 *
 *   answer  — it was answered
 *   clarify — the workflow needs one more detail before it can answer
 *   unknown — it ran, nothing went wrong, and the record does not settle it
 *   refusal — this person may not ask this, and there is no route
 *   gate    — this person may not ask this, and the route runs through Ananya
 *   waiting — a run is going, or has stopped for someone
 *   error   — it did not run, or ended without finishing
 *
 * `unknown` and `refusal` are deliberately separate, and the distinction is
 * the most important one on this list. "You may not see this" is a boundary
 * around access; "the record does not say" is a boundary around evidence.
 * Collapsing them would tell somebody their record is closed to them when in
 * fact it is silent, or tell them nothing happened when in fact nobody wrote
 * it down. For a record-based system those are opposite failures.
 *
 * `clarify` exists because the envelope has carried a question and options
 * since the beginning and this interface was dropping both on the floor — a
 * workflow that stopped to ask which period was meant showed up here as a
 * blank answer.
 */
export type Shape = 'answer' | 'clarify' | 'unknown' | 'refusal' | 'gate' | 'waiting' | 'error'

export interface Ask {
  id: string
  at: string
  question: string
  shape: Shape
  tone: Tone
  /** What the question turned out to be about. Drives the refusal's wording. */
  domain: Domain
  runId?: string
  status?: RunStatus
  answer?: string
  sources?: Source[]
  withheld?: { domain?: string; reason?: string }[]
  /**
   * What the workflow needs to know, when it stopped to ask.
   *
   * Named apart from `question`, which is the person's own words and must
   * never be overwritten by the system's — the heading of this screen is the
   * thing they typed, and it stays that way whatever comes back.
   */
  clarifyQuestion?: string
  /** Answers it will accept, so the person taps rather than retypes. */
  clarifyOptions?: string[]
  files?: Attachment[]
  detail?: string
  reason?: string
  path?: string
  /** A file that went with the question. */
  attached?: { title: string; fileType: string }
  /** True when this was routed and composed but never sent. */
  rehearsed?: boolean
  /** Set once the person has asked Ananya for access from a gate. */
  requested?: boolean
  /**
   * Which kind of gate stopped this, when one did.
   *
   * `domain` — you asked directly for something clinical.
   * `reason`  — you asked why an adjustment is needed, which is a perfectly
   *             ordinary question whose answer happens to be clinical. The two
   *             need different words, because telling an employer that
   *             "workplace information is part of the clinical record" is
   *             nonsense, and nonsense at a boundary reads as the system
   *             covering something up.
   */
  gateKind?: 'domain' | 'reason'
}

interface AsksValue {
  asks: Ask[]
  /** Newest first, for the recently-asked cards. */
  recent: Ask[]
  find: (id: string) => Ask | undefined
  ask: (question: string, options?: { file?: Attached | null; rehearse?: boolean; workflow?: string }) => Promise<string>
  requestAccess: (askId: string) => void
  /** Access requests raised from a gate, for Ananya's Decisions. */
  requests: AccessRequest[]
  answerRequest: (id: string, decision: 'granted' | 'declined') => Promise<boolean>
  /** Who the subject has currently stopped sharing with. */
  stops: string[]
  setSharing: (personId: string, sharing: boolean) => Promise<boolean>
}

const AsksContext = createContext<AsksValue | null>(null)

const ASKS_KEY = (personId: string) => `orca.asks.${personId}`

function readAsks(personId: string): Ask[] {
  try {
    const raw = sessionStorage.getItem(ASKS_KEY(personId))
    return raw ? (JSON.parse(raw) as Ask[]) : []
  } catch {
    return []
  }
}

export function AsksProvider({ children }: { children: ReactNode }) {
  const { option, role } = useSession()
  // The record in scope, which for a clinician is the one they chose rather
  // than the first one they happen to be connected to.
  const { subjectId: patientId } = useSubject()
  const personId = option?.personId ?? ''
  const [asks, setAsks] = useState<Ask[]>(() => (personId ? readAsks(personId) : []))
  const [requests, setRequests] = useState<AccessRequest[]>(readRequests)
  const [stops, setStops] = useState<string[]>(readStopped)
  const loadedFor = useRef(personId)

  // Switching account switches conversation. Without this, signing in as Anil
  // after being Ananya would show him her questions, which is the single worst
  // thing this interface could do.
  useEffect(() => {
    if (loadedFor.current === personId) return
    loadedFor.current = personId
    setAsks(personId ? readAsks(personId) : [])
  }, [personId])

  useEffect(() => {
    if (!personId) return
    try {
      sessionStorage.setItem(ASKS_KEY(personId), JSON.stringify(asks))
    } catch {
      /* Private browsing. The conversation simply will not survive a reload. */
    }
  }, [asks, personId])

  useEffect(() => {
    writeRequests(requests)
  }, [requests])

  useEffect(() => {
    writeStopped(stops)
  }, [stops])

  // Another tab deciding something should reach this one, even with no
  // backend. Same browser, two people, one record: that is how this gets
  // demonstrated, and it has to actually work.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === REQUESTS_KEY) setRequests(readRequests())
      if (e.key === STOPPED_KEY) setStops(readStopped())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const { data: runData } = useLive<{ runs: RunRow[] }>('workflow_runs', patientId)
  const { data: convoData } = useLive<ConversationData>('conversation', patientId)
  const { data: consentData, refresh: refreshConsent } = useLive<{
    requests: AccessRequestRow[]
    stops: SharingStopRow[]
  }>('consent', patientId)

  /**
   * The server's answer replaces the local one, wholesale.
   *
   * Not merged. A merge would keep a local row the server has no record of,
   * and in this table that means keeping a grant that was never actually
   * given — which is the one direction this must never fail in. When the
   * backend is reachable it is the only authority; the mirror exists for the
   * build that has no backend at all.
   */
  useEffect(() => {
    if (!consentData) return
    setRequests((consentData.requests ?? []).map(fromRow))
    setStops((consentData.stops ?? []).map((s) => s.person_id))
  }, [consentData])

  /**
   * Answers finding their way back to the question that asked.
   *
   * A run's result is written to its row by whatever transport delivered it,
   * long after the request that started it returned. So this reconciles against
   * the record rather than awaiting a promise: every poll, any ask still
   * waiting is matched by run id and settled if its row now has an answer.
   *
   * Two roads in. A workflow with API connectors answers by writing into the
   * conversation; one without answers onto its run row. Both are checked,
   * because which applies depends on how a workflow was configured in Yoxa
   * rather than on anything this screen can see.
   */
  useEffect(() => {
    const rows = runData?.runs ?? []
    const said = convoData?.messages ?? []
    if (!rows.length && !said.length) return
    setAsks((current) => {
      let changed = false
      const next = current.map((a) => {
        if (a.shape !== 'waiting' || !a.runId) return a

        const files = (convoData?.attachments ?? []).filter((f) => f.workflow_run_id === a.runId)
        const withFiles = files.length ? { files } : {}

        const spoken = said.find((m) => m.author === 'orca' && m.workflow_run_id === a.runId)
        if (spoken) {
          changed = true
          return { ...a, ...withFiles, shape: 'answer' as const, status: 'done' as const, answer: spoken.text }
        }

        const row = rows.find((r) => r.id === a.runId)
        if (!row) return a
        const settled = settleFrom(row)
        if (!settled) return a
        changed = true
        return { ...a, ...withFiles, ...settled }
      })
      return changed ? next : current
    })
  }, [runData, convoData])

  const ask = useCallback<AsksValue['ask']>(
    async (question, opts) => {
      const body = question.trim()
      const id = crypto.randomUUID()
      if (!body) return id

      const domain = domainOf(body)

      /**
       * Ananya's two decisions, applied before anything else.
       *
       * Stopping first, because it outranks everything: somebody she has
       * stopped sharing with is refused whatever they ask, and the refusal is
       * the ordinary one — from their side there is nothing to distinguish
       * "she withdrew this" from "this was never yours", and telling them
       * which would itself be a disclosure.
       *
       * Then granting. A gate she has approved is not a gate any more, so the
       * question that hit it runs the second time it is asked.
       */
      const why = asksWhy(body)
      let outcome = outcomeFor(role, domain, why)
      if (role !== 'patient' && personId && isStopped(personId)) outcome = 'refuse'
      else if (outcome === 'gate' && personId && grantedTo(personId).has(domain)) outcome = 'allow'

      /**
       * The two noes, decided without a round trip.
       *
       * Nothing is sent, nothing is read, and the person is not left watching
       * a spinner while a system decides whether they are allowed to have
       * asked. The refusal never confirms existence either — it reads
       * identically whether the record holds the thing or not.
       */
      if (outcome !== 'allow') {
        const stopped: Ask = {
          id,
          at: new Date().toISOString(),
          question: body,
          shape: outcome === 'gate' ? 'gate' : 'refusal',
          tone: outcome === 'gate' ? 'decision' : 'past',
          domain,
          gateKind:
            outcome === 'gate' ? (why && outcomeFor(role, domain, false) === 'allow' ? 'reason' : 'domain') : undefined,
        }
        setAsks((a) => [...a, stopped])
        return id
      }

      const placed: Ask = {
        id,
        at: new Date().toISOString(),
        question: body,
        shape: 'waiting',
        tone: 'current',
        domain,
        attached: opts?.file ? { title: opts.file.title, fileType: opts.file.fileType } : undefined,
        rehearsed: opts?.rehearse,
      }
      setAsks((a) => [...a, placed])

      /**
       * The screen moves on; the run starts behind it.
       *
       * Awaiting the trigger handshake before showing anything meant the
       * person sat on the Ask screen with a disabled button while a network
       * round trip happened — and if that round trip was slow, the question
       * they had just asked appeared to have gone nowhere. Yoxa is
       * asynchronous anyway: the handshake tells us a run was accepted, not
       * that it was answered, so waiting for it buys nothing the person can
       * use. Placing the ask first and starting the run after means the
       * answer screen is on the screen immediately, saying honestly that the
       * record is being read.
       */
      void startRun({
        message: body,
        actorId: personId || null,
        patientId: patientId ?? null,
        dryRun: opts?.rehearse ?? false,
        workflow: opts?.workflow,
        attached: opts?.file?.describe,
      }).then((started) => {
        setAsks((a) => a.map((x) => (x.id === id ? { ...x, ...started } : x)))

        // The question, written into the record as well as the screen. Without
        // this a reload keeps ORCA's half of the conversation and loses the
        // person's, which reads as though the answers arrived unprompted.
        if (!opts?.rehearse && personId && patientId) {
          persistMessage(patientId, personId, body, 'person', started.runId ?? null)
        }
      })

      return id
    },
    [personId, patientId, role],
  )

  /**
   * Walking through a gate.
   *
   * Written to the record first and mirrored locally second, so that a request
   * raised here reaches the person it is addressed to rather than sitting in
   * the browser of the person who raised it. The optimistic local row is what
   * the asker sees immediately; the next poll replaces it with the server's.
   */
  const requestAccess = useCallback(
    (askId: string) => {
      const target = asks.find((a) => a.id === askId)
      if (!target || target.requested) return
      setAsks((current) => current.map((a) => (a.id === askId ? { ...a, requested: true } : a)))
      setRequests((r) => [
        ...r,
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          fromId: personId,
          fromName: option?.name ?? 'Someone',
          fromRole: option?.title ?? String(role ?? ''),
          question: target.question,
          domain: target.domain,
          status: 'pending',
        },
      ])
      if (personId && patientId) {
        void actOnRecord('request_access', patientId, personId, {
          domain: target.domain,
          question: target.question,
        }).then(refreshConsent)
      }
    },
    [asks, personId, patientId, option?.name, option?.title, role, refreshConsent],
  )

  /**
   * Says whether it worked, for the same reason `setSharing` does.
   *
   * Granting access is a disclosure decision written to the record and read
   * back from it a few seconds later. Sent and forgotten, a failed write showed
   * as decided and then undid itself on the next poll, in front of somebody who
   * had been told it was done.
   */
  const answerRequest = useCallback(
    async (id: string, decision: 'granted' | 'declined'): Promise<boolean> => {
      setRequests((r) =>
        r.map((x) => (x.id === id ? { ...x, status: decision, decidedAt: new Date().toISOString() } : x)),
      )
      if (!personId || !patientId) return false
      const result = await actOnRecord('decide_access', patientId, personId, {
        request_id: id,
        decision,
      })
      await refreshConsent()
      return result.ok
    },
    [personId, patientId, refreshConsent],
  )

  /**
   * Says whether it worked.
   *
   * This was fire-and-forget, and on the one control in the product that
   * decides who can read somebody's medical record. The screen updated
   * immediately, the write went off unwatched, and a failure was swallowed
   * whole — the poll below reconciles `stops` from the record every few
   * seconds, so a write that never landed showed as done and then quietly
   * undid itself while the person was reading the confirmation.
   *
   * The optimistic update stays: waiting for a round trip before showing a
   * decision the person has already made reads as the interface hesitating.
   * What changes is that the caller now learns the outcome and can say so.
   */
  const setSharing = useCallback(
    async (who: string, sharing: boolean): Promise<boolean> => {
      setStops((s) => (sharing ? s.filter((id) => id !== who) : [...new Set([...s, who])]))
      if (!personId || !patientId) return false
      const result = await actOnRecord('set_sharing', patientId, personId, {
        person_id: who,
        sharing,
      })
      await refreshConsent()
      return result.ok
    },
    [personId, patientId, refreshConsent],
  )

  const value = useMemo<AsksValue>(
    () => ({
      asks,
      recent: [...asks].reverse(),
      find: (id) => asks.find((a) => a.id === id),
      ask,
      requestAccess,
      requests,
      answerRequest,
      stops,
      setSharing,
    }),
    [asks, ask, requestAccess, requests, answerRequest, stops, setSharing],
  )

  return <AsksContext.Provider value={value}>{children}</AsksContext.Provider>
}

export function useAsks() {
  const ctx = useContext(AsksContext)
  if (!ctx) throw new Error('useAsks must be used inside AsksProvider')
  return ctx
}

/* ------------------------------------------------------------- the call */

/**
 * Starting a run.
 *
 * Sends the person's sentence and who they are — never a composed trigger. The
 * preamble is built on the server from the actor it resolves, because a
 * preamble composed in the page is a preamble the page can change, and the
 * preamble is the whole statement of who is asking and what they may ask for.
 *
 * Returns as soon as Yoxa has accepted the trigger, which is long before there
 * is an answer. What comes back is a run id.
 */
async function startRun(args: {
  message: string
  actorId: string | null
  patientId: string | null
  dryRun?: boolean
  workflow?: string
  attached?: string
}): Promise<Partial<Ask>> {
  try {
    const { isSupabaseConfigured, supabase } = await import('../lib/supabase')
    if (!isSupabaseConfigured) {
      return {
        shape: 'error',
        status: 'error',
        detail: 'No backend is configured in this build, so nothing was read and nothing was answered.',
      }
    }

    const { data, error } = await supabase.functions.invoke('orca-chat', {
      body: {
        message: args.message,
        actor_id: args.actorId,
        patient_id: args.patientId,
        dry_run: args.dryRun ?? false,
        workflow: args.workflow,
        attached: args.attached,
      },
    })

    if (error || !data?.run_id) {
      const detail =
        typeof data?.detail === 'string'
          ? data.detail
          : 'Your question could not be sent. Nothing was read from the record, and no answer has been invented in its place.'
      return { shape: 'error', status: 'error', detail }
    }

    return {
      shape: 'waiting',
      runId: String(data.run_id),
      path: typeof data.path === 'string' ? data.path : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
      rehearsed: data.dry_run === true,
    }
  } catch {
    return {
      shape: 'error',
      status: 'error',
      detail: 'Your question did not send. This is usually a connection problem. Send it again when you are ready.',
    }
  }
}

/**
 * Whether a run row has become an answer yet, and what that answer is.
 *
 * Returns null while there is still nothing to show, which is what keeps a
 * queued run looking queued rather than flickering into an empty reply. A run
 * that ended without an answer still settles — "Blocked" with no text is a real
 * outcome and the person is owed it, rather than a spinner that never stops.
 */
function settleFrom(row: RunRow): Partial<Ask> | null {
  const finished = ['Completed', 'Blocked', 'Escalated', 'Cancelled'].includes(row.status)
  if (!row.answer_html && !finished) return null

  const envelope = parseEnvelope(row.result ?? row.answer_html ?? null)

  /**
   * The row's own state outranks the envelope's when the two disagree.
   *
   * Content attached to an approval gate has no envelope — it is a
   * description, so the parser reads a bare string and reasonably calls it
   * done. The run is not done: it is holding, waiting for a person, and
   * nothing has been sent. Showing "done" there would be the interface
   * asserting a consent decision nobody has made.
   */
  const status: RunStatus =
    row.status === 'Awaiting approval'
      ? 'needs_approval'
      : row.status === 'Awaiting information'
        ? 'needs_clarification'
        : envelope.status

  const answer = envelope.answerHtml ?? row.answer_html ?? undefined

  /**
   * Which of the seven shapes this settled into.
   *
   * A finished run with no answer used to render as an answer with nothing in
   * it. It is not that: it is the record failing to settle the question, which
   * is a real and frequently correct outcome for a record that has gaps in it,
   * and the person is owed those words rather than an empty card.
   */
  const shape: Shape =
    status === 'needs_approval'
      ? 'waiting'
      : status === 'needs_clarification'
        ? 'clarify'
        : status === 'error' || status === 'blocked'
          ? 'error'
          : answer
            ? 'answer'
            : 'unknown'

  return {
    shape,
    status,
    path: row.path ?? undefined,
    reason: row.route_reason ?? undefined,
    answer,
    sources: envelope.sources,
    withheld: envelope.withheld,
    clarifyQuestion: envelope.question ?? undefined,
    clarifyOptions: envelope.options,
    detail:
      envelope.detail ??
      (finished && !row.answer_html
        ? `The run ended at “${row.current_step}” without producing an answer.`
        : undefined),
  }
}
