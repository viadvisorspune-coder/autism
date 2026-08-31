/**
 * Settling runs that were started and never came back.
 *
 * ORCA cannot ask Yoxa whether a run has finished — there is no read API — so
 * a run's answer arrives only because the workflow pushed it. A workflow with
 * no return step configured produces a perfectly good answer that has nowhere
 * to go, and its row stays `In progress` forever.
 *
 * The interface already tells the truth about this after ten minutes. The row
 * underneath it did not, and that gap is the problem: every screen that counts
 * work in progress counted these, the caseload showed a clinician four active
 * runs that had been dead since morning, and a person's history filled with
 * questions that are permanently mid-sentence.
 *
 * So this settles them, on read, with no scheduler — Supabase has no cron here
 * and adding one for a demo would be a second thing to keep alive.
 *
 * WHAT IT IS NOT. Not a timeout and not a cancellation. Nothing is stopped;
 * the run may well still be going at Yoxa. This only stops ORCA claiming to be
 * waiting for something it has no way to receive. A late answer still lands
 * normally — `deliver()` writes onto the row whatever its status, and only
 * refuses to overwrite an answer that is already there.
 */
import { admin } from './yoxa.ts'

/**
 * Twenty minutes, and deliberately later than the interface's ten.
 *
 * The screen says "no answer has come back" at ten minutes, softly and
 * reversibly — it is reading elapsed time, not a stored verdict, so an answer
 * arriving at minute eleven simply replaces it. Writing the verdict down at
 * the same moment would let the database contradict a screen that was about to
 * be right. Ten minutes to stop promising; twenty to stop waiting.
 */
const STALE_AFTER_MS = 20 * 60 * 1000

/**
 * Statuses that mean "still legitimately open".
 *
 * `Awaiting approval` and `Awaiting information` are runs parked on a person,
 * not on a workflow, and a person is allowed to take a week. Sweeping those
 * would delete somebody's pending decision out from under them.
 */
const OPEN = 'In progress'

/** Rows swept in one pass, so a stuck record cannot make a read expensive. */
const BATCH = 50

/**
 * Marks long-silent runs as blocked, and says why in words.
 *
 * Returns how many were settled. Callers ignore it; it exists so a failure to
 * sweep is visible in logs rather than silent.
 *
 * Never throws. This runs on the read path, and a read that fails because the
 * housekeeping failed would take out every screen in the product to fix a
 * cosmetic problem on one of them.
 */
export async function sweepStaleRuns(patientId?: string | null): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()

  try {
    let query = admin
      .from('workflow_runs')
      .select('id')
      .eq('status', OPEN)
      .is('answer_html', null)
      .lt('started_at', cutoff)
      .limit(BATCH)

    if (patientId) query = query.eq('patient_id', patientId)

    const { data, error } = await query
    if (error || !data?.length) return 0

    const { error: writeError } = await admin
      .from('workflow_runs')
      .update({
        status: 'Blocked',
        /**
         * Read by the interface, so it is a sentence rather than a code.
         *
         * `settleFrom` in the browser renders this verbatim as "The run ended
         * at <this> without producing an answer", so it has to survive being
         * dropped into the middle of somebody's sentence.
         */
        current_step: 'no answer was ever sent back from the workflow',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', data.map((r) => r.id as string))

    if (writeError) {
      console.error('sweepStaleRuns:', writeError.message)
      return 0
    }
    return data.length
  } catch (error) {
    console.error('sweepStaleRuns:', String(error))
    return 0
  }
}
