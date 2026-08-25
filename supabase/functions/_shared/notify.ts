/**
 * Writing to somebody's inbox.
 *
 * This exists because the same three strings — what kind of notification this
 * is, what the reader is meant to do about it, and where the link goes — were
 * being written out longhand at each place that raised one. Three copies, and
 * two of them wrong:
 *
 *   app-write stamped every row "Approval required" and told the reader to
 *   approve, edit or decline, including the rows announcing a decision that
 *   had already been made. And it sent every reader to /patient/requests,
 *   including the psychologists and GPs it was addressed to, who have no such
 *   screen — the reviews assigned to them are on their own dashboard.
 *
 *   hitl-receiver held its own copy of the same three strings, correct today
 *   only because it happens to raise nothing but approvals.
 *
 * The pattern in both cases is the same: a fact that varies per notification
 * written as a constant, so it silently stops being true. Both are parameters
 * here — `kind` says whether this is a question or a receipt, and the
 * destination is worked out per recipient rather than assumed.
 */
import { admin } from './yoxa.ts'

/**
 * Where each role goes to find work that is waiting for them.
 *
 * Everyone but the patient has their waiting reviews on their own dashboard,
 * which is the role's index route — the patient's live one screen in, under
 * requests. Anything not listed falls back to the role's own root, which is a
 * real page for every role in the product; the map is here for the exceptions,
 * not to restate the rule.
 */
const WAITING_WORK: Record<string, string> = {
  patient: '/patient/requests',
  admin: '/admin/workflows',
}

export const waitingWorkFor = (role: string): string => WAITING_WORK[role] ?? `/${role}`

/**
 * Asking somebody to decide, or telling them what was decided.
 *
 * An inbox that cannot tell a question from a receipt is one people learn to
 * ignore, and the entries in it that genuinely need a person go with it.
 */
export type NotificationKind = 'asking' | 'telling'

/**
 * One row per role, because the link differs per role.
 *
 * A notification carries a single href and a list of roles, so a row addressed
 * to four people can only point four people at one screen. Splitting it is
 * what makes the destination honest, and costs nothing that anybody sees: the
 * interface shows each person only the rows their own role is named in, so no
 * inbox gains a duplicate.
 */
export async function notifyRoles(entry: {
  patientId: string | null
  roles: string[]
  kind: NotificationKind
  what: string
  why: string
  workflowRunId?: string | null
  reviewId?: string | null
}): Promise<void> {
  const roles = [...new Set(entry.roles)].filter(Boolean)
  if (!roles.length) return

  const asking = entry.kind === 'asking'
  const rows = roles.map((role) => ({
    patient_id: entry.patientId,
    category: asking ? 'Approval required' : 'Professional response',
    what: entry.what,
    why: entry.why,
    todo: asking
      ? 'Open it, read what is proposed, and approve, edit or decline.'
      : 'Nothing to do. Open it if you want to see what was decided and why.',
    for_roles: [role],
    href: waitingWorkFor(role),
    workflow_run_id: entry.workflowRunId ?? null,
    review_id: entry.reviewId ?? null,
  }))

  const { error } = await admin.from('notifications').insert(rows)
  // Not fatal: the decision itself is already recorded and audited, and losing
  // the announcement must not fail the action it announces. It is logged
  // rather than swallowed, because an inbox that quietly stops filling is the
  // kind of fault nobody reports.
  if (error) console.error('notification write failed', error.message)
}

/**
 * A question, once it has been answered, stops being a question.
 *
 * The row raised when a review opens says "Approval required" and tells the
 * reader to go and decide. Nothing retired it when somebody did, so an inbox
 * held both halves at once — an ask and, a minute later, the receipt answering
 * it — and the ask was still bold, still unread, still counted in the badge.
 *
 * Deleted rather than marked read. The decision receipt written alongside this
 * says everything the ask said and more, and the permanent account of who
 * asked and who answered is the audit log, which is append-only and untouched
 * by any of this. Leaving a spent question in the inbox to preserve history
 * keeps it in the one place that is not a history.
 */
export async function retireAsks(reviewId: string): Promise<void> {
  if (!reviewId) return
  const { error } = await admin
    .from('notifications')
    .delete()
    .eq('review_id', reviewId)
    .eq('category', 'Approval required')
  if (error) console.error('could not retire the open ask', error.message)
}
