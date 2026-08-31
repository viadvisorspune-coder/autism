/**
 * Consent, as something that actually changes what people can see.
 *
 * Two decisions the subject makes about other people, and both have to have
 * teeth or the governance model is a diagram rather than a product:
 *
 *   SHE CAN STOP SHARING. When she does, the person she stopped is refused —
 *   not shown a smaller answer, not shown a stale one. The refusal they get is
 *   the ordinary one, which is correct: from their side there is nothing to
 *   distinguish "she withdrew this" from "this was never yours", and telling
 *   them which would itself be a disclosure.
 *
 *   SHE CAN GRANT WHAT WAS GATED. A therapist asks about medication, hits the
 *   gate, asks her; if she says yes, the same question now runs. If she says
 *   no, it does not.
 *
 * WHERE THESE LIVE. In Postgres — `access_requests` and `sharing_stops`, both
 * written through `app-write` and read through `app-read`, so a request Sana
 * raises on her laptop reaches Ananya on her phone. That is the only version
 * of this that means anything: a consent decision that does not leave the
 * browser it was made in is a decision nobody else is bound by.
 *
 * The local mirror below is a fallback and says so. When the app is built
 * without a backend — which is how it runs on a laptop with no `.env`, and how
 * it must keep running rather than showing a blank screen — the same decisions
 * are kept in local storage, which is shared across tabs in one browser and is
 * enough to demonstrate the model end to end. It is never used to override the
 * server: server rows win wherever both exist.
 */
import type { Domain } from './system'

const REQUESTS_KEY = 'orca.access-requests'
const STOPPED_KEY = 'orca.sharing-stopped'

export interface AccessRequest {
  id: string
  at: string
  fromId: string
  fromName: string
  fromRole: string
  question: string
  domain: Domain
  status: 'pending' | 'granted' | 'declined'
  decidedAt?: string
}

/** One row of `access_requests`, as `app-read` returns it. */
export interface AccessRequestRow {
  id: string
  person_id: string
  person_name: string | null
  person_role: string | null
  domain: string
  question: string | null
  status: string
  created_at: string
  decided_at: string | null
}

export interface SharingStopRow {
  id: string
  person_id: string
  stopped_at: string
  resumed_at: string | null
}

/** The server's shape, in the interface's shape. */
export function fromRow(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    at: row.created_at,
    fromId: row.person_id,
    fromName: row.person_name ?? 'Someone',
    fromRole: row.person_role ?? '',
    question: row.question ?? '',
    domain: row.domain as Domain,
    status: (row.status as AccessRequest['status']) ?? 'pending',
    decidedAt: row.decided_at ?? undefined,
  }
}

/* --------------------------------------------------------- local mirror */

export function readRequests(): AccessRequest[] {
  try {
    const raw = window.localStorage.getItem(REQUESTS_KEY)
    return raw ? (JSON.parse(raw) as AccessRequest[]) : []
  } catch {
    return []
  }
}

export function writeRequests(list: AccessRequest[]): void {
  try {
    window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(list))
  } catch {
    /* Private browsing. The request stays in this tab only. */
  }
}

export function readStopped(): string[] {
  try {
    const raw = window.localStorage.getItem(STOPPED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function writeStopped(list: string[]): void {
  try {
    window.localStorage.setItem(STOPPED_KEY, JSON.stringify(list))
  } catch {
    /* The change holds for this tab only. */
  }
}

export { REQUESTS_KEY, STOPPED_KEY }

/* ---------------------------------------------------------- the answers
 *
 * Both of these are read on the hot path — every question asked runs them —
 * so they read the mirror rather than awaiting a fetch. The mirror is kept in
 * step with the server by the provider, which merges every poll into it. The
 * consequence is bounded and worth stating: a decision made in another browser
 * within the last few seconds may not have arrived yet, so a question asked in
 * that window is judged on the previous state. It resolves on the next poll.
 */

/** Everything this person has been granted since a gate stopped them. */
export function grantedTo(personId: string): Set<Domain> {
  const granted = new Set<Domain>()
  for (const r of readRequests()) {
    if (r.fromId === personId && r.status === 'granted') granted.add(r.domain)
  }
  return granted
}

export function isStopped(personId: string): boolean {
  return readStopped().includes(personId)
}
