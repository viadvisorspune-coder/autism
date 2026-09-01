import { admin } from './yoxa.ts'

/**
 * Who a connector call is about, when the agent could not say.
 *
 * Yoxa's public trigger carries one field, so the run metadata never reaches
 * the agents. An agent asked for `patient_id` therefore has nothing to give
 * and sends an empty string — which satisfies the connector schema and fails
 * at the API, correctly but uselessly. One run said so in its own words:
 *
 *   {"actor_id":"","patient_id":"","text":"the record was not retrieved
 *    because required patient metadata was unavailable"}
 *
 * The ids now lead the trigger text, and the agents are told to copy them.
 * This is the belt to that pair of braces: when they arrive blank anyway, the
 * run they belong to is almost always the newest one still open, because the
 * application created it moments before Yoxa called back.
 *
 * The honesty cost is real and worth stating plainly. Under concurrent users
 * this guesses, and a wrong guess writes into the wrong person's record — so
 * it is bounded to fifteen minutes, requires the run to still be in progress,
 * refuses when more than one candidate exists, and records that it inferred
 * rather than being told. It is a demonstration affordance, not a permission
 * model, and the moment the trigger can carry structured metadata it should
 * be deleted rather than kept as a convenience.
 */
export interface Inferred {
  patientId: string
  actorId: string
  runId: string
}

const WINDOW_MINUTES = 15

export async function inferFromRecentRun(): Promise<Inferred | null> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()
  const { data } = await admin
    .from('workflow_runs')
    .select('id, patient_id, trigger_text, started_at')
    .eq('status', 'In progress')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(2)

  const rows = data ?? []
  // Two open runs in the same quarter hour means this cannot be answered
  // safely. Refusing is the only correct move; a coin toss here is a
  // disclosure.
  if (rows.length !== 1) return null

  const run = rows[0] as Record<string, unknown>
  const patientId = String(run.patient_id ?? '')
  if (!patientId) return null

  // The actor is not a column on the run, but the trigger text now opens with
  // the same three lines the agents are told to read. Parsing them back is
  // exact rather than inferred, and it keeps one source of truth: change the
  // block in workflow-trigger and this follows.
  /**
   * Case-insensitive, because the block is written in lower case.
   *
   * This matched `^ACTOR_ID:` in capitals while `identifierBlock` has always
   * written `actor_id:`. So the recovery ran, found the run, and then returned
   * an empty actor every single time — a fallback that looked present and was
   * inert, which is worse than not having one.
   */
  const text = String(run.trigger_text ?? '')
  const actorId = text.match(/^\s*actor_id:\s*(\S+)/im)?.[1] ?? ''
  // The run's own column is authoritative for the patient; the trigger line is
  // only consulted when the column is somehow empty.
  const fromText = text.match(/^\s*patient_id:\s*(\S+)/im)?.[1] ?? ''

  return { patientId: patientId || fromText, actorId, runId: String(run.id ?? '') }
}
