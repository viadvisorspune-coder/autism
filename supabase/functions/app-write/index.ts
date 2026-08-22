/**
 * app_write — the decisions people make in ORCA's own interface.
 *
 * Everything here is one person deciding something about one record, so every
 * action records who decided it and why, and every one of them is visible to
 * the other people connected to that record within seconds. That last part is
 * the point: an approval that only exists in the tab that raised it is not a
 * shared decision, it is a note to self.
 *
 * DEMO BOUNDARY, same as app-read and workflow-trigger: identity is asserted
 * rather than proven while ORCA has no sign-in. Scope is still enforced here —
 * a role that may not act on a record is refused and the refusal is recorded.
 */
import { admin, cors, json, list, recordAudit, str } from '../_shared/yoxa.ts'
import { actorFromRequest, forbidden, mayActOnPatient, unauthorised } from '../_shared/app.ts'

type Action = 'raise_review' | 'decide_review' | 'decide_access_request' | 'withdraw_review'

/** Only these roles may be asked to decide something clinical. */
const DECIDING_ROLES = new Set([
  'patient',
  'psychologist',
  'psychiatrist',
  'therapist',
  'ot',
  'gp',
  'clinic',
  'trusted',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const actor = await actorFromRequest(req, body)
  if (!actor) return unauthorised()

  const action = str(body.action) as Action | null
  const patientId = str(body.patient_id)
  if (!action) return json({ error: 'action is required' }, 400)
  if (!patientId) return json({ error: 'patient_id is required' }, 400)

  // Checked for every action, not assumed from the role name.
  if (!(await mayActOnPatient(actor.id, patientId))) {
    await recordAudit({
      actorId: actor.id,
      actorLabel: actor.name,
      actorRole: actor.role,
      patientId,
      action: `Attempted ${action} outside their scope`,
      record: `Patient ${patientId}`,
      accessType: 'Write',
      why: 'No live connection to this record',
      result: 'Denied',
    })
    return forbidden('You do not have access to this record.')
  }

  switch (action) {
    /* ---------------------------------------------------------- raise */

    case 'raise_review': {
      const title = str(body.title)
      const reason = str(body.reason)
      if (!title || !reason) return json({ error: 'title and reason are required' }, 400)

      const assignedTo = list(body.assigned_to).filter((r) => DECIDING_ROLES.has(r))
      if (!assignedTo.length) {
        return json(
          {
            error: 'assigned_to is required',
            fix: 'Name at least one role who should decide this. A decision with nobody assigned is a decision nobody makes.',
          },
          400,
        )
      }

      const { data, error } = await admin
        .from('review_items')
        .insert({
          patient_id: patientId,
          title,
          reason,
          understanding: str(body.understanding),
          evidence: list(body.evidence),
          uncertainty: str(body.uncertainty),
          proposed_action: str(body.proposed_action),
          decision_required: str(body.decision_required) ?? 'Approve, edit, or decline',
          assigned_to: assignedTo,
          status: 'Awaiting approval',
          workflow_run_id: str(body.workflow_run_id),
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      await notify(patientId, assignedTo, `${actor.name} has asked for a decision`, title, data.id)

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Raised for decision: ${title}`,
        record: `Review ${data.id}`,
        accessType: 'Write',
        why: reason,
        result: 'Allowed',
        workflowRunId: str(body.workflow_run_id),
      })

      return json({ review: data, note: `Sent to ${assignedTo.join(', ')}.` })
    }

    /* --------------------------------------------------------- decide */

    case 'decide_review': {
      const reviewId = str(body.review_id)
      const decision = str(body.decision)
      if (!reviewId || !decision) return json({ error: 'review_id and decision are required' }, 400)

      const { data: item } = await admin
        .from('review_items')
        .select('*')
        .eq('id', reviewId)
        .maybeSingle()
      if (!item) return json({ error: 'review_not_found' }, 404)
      if (item.patient_id !== patientId) {
        return json({ error: 'review_belongs_to_another_patient' }, 400)
      }

      // Only the people it was addressed to. A decision made by whoever
      // happened to be looking is not the decision that was asked for.
      const assigned = (item.assigned_to as string[]) ?? []
      if (!assigned.includes(actor.role)) {
        await recordAudit({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Attempted to decide a review addressed to ${assigned.join(', ')}`,
          record: `Review ${reviewId}`,
          accessType: 'Approve',
          why: 'Not the assigned decider',
          result: 'Denied',
        })
        return forbidden(
          `This was addressed to ${assigned.join(' or ')}, not to you. It is still waiting for them.`,
        )
      }

      // Already answered: say so rather than overwriting somebody's decision.
      if (item.status !== 'Awaiting approval' && item.status !== 'Awaiting professional review') {
        return json({
          review: item,
          already_decided: true,
          note: `${item.decided_by ? 'Already decided' : 'No longer open'}. Nothing was changed.`,
        })
      }

      const status = decision === 'Declined' ? 'Cancelled' : 'Completed'

      const { data, error } = await admin
        .from('review_items')
        .update({
          status,
          decision,
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
          proposed_action: str(body.edited_action) ?? item.proposed_action,
        })
        .eq('id', reviewId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      // Back to whoever raised it, and to the patient, who is entitled to know
      // what was decided about them even when they were not the decider.
      await notify(
        patientId,
        ['patient', ...assigned.filter((r) => r !== actor.role)],
        `${actor.name} decided: ${decision}`,
        item.title as string,
        reviewId,
      )

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: `Decided "${item.title}": ${decision}`,
        record: `Review ${reviewId}`,
        accessType: 'Approve',
        why: str(body.note) ?? decision,
        result: 'Allowed',
        workflowRunId: (item.workflow_run_id as string) ?? null,
      })

      return json({ review: data, already_decided: false })
    }

    case 'withdraw_review': {
      const reviewId = str(body.review_id)
      if (!reviewId) return json({ error: 'review_id is required' }, 400)

      const { data, error } = await admin
        .from('review_items')
        .update({ status: 'Cancelled', decision: 'Withdrawn', decided_by: actor.id, decided_at: new Date().toISOString() })
        .eq('id', reviewId)
        .eq('patient_id', patientId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)
      return json({ review: data })
    }

    /* ------------------------------------------------- access requests */

    case 'decide_access_request': {
      const requestId = str(body.request_id)
      const approve = body.approve === true
      if (!requestId) return json({ error: 'request_id is required' }, 400)

      // Only the patient decides who may see their record. Not a clinician,
      // not an administrator, not ORCA.
      const { data: patient } = await admin
        .from('patients')
        .select('user_id')
        .eq('id', patientId)
        .maybeSingle()
      if (patient?.user_id !== actor.id) {
        return forbidden('Only the person whose record this is can decide who may see it.')
      }

      const { data: request } = await admin
        .from('access_requests')
        .select('*')
        .eq('id', requestId)
        .eq('patient_id', patientId)
        .maybeSingle()
      if (!request) return json({ error: 'access_request_not_found' }, 404)
      if (request.status !== 'Pending') {
        return json({ access_request: request, already_decided: true })
      }

      const grantedScope = list(body.granted_scope)

      const { data, error } = await admin
        .from('access_requests')
        .update({
          status: approve ? 'Approved' : 'Declined',
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
          decision_note: str(body.note),
          granted_scope: approve ? (grantedScope.length ? grantedScope : (request.requested_scope as string[])) : null,
        })
        .eq('id', requestId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 400)

      // Approving a request does not itself grant anything. The connection is
      // what grants access, and writing it is a separate, deliberate act —
      // which is also what makes the consent event appear in the history.
      if (approve) {
        const { error: connectionError } = await admin.from('connections').insert({
          id: `cn-${requestId.slice(0, 8)}`,
          patient_id: patientId,
          person_id: request.requested_by,
          relationship: String(request.requested_role),
          purpose: String(request.purpose),
          access_scope: (data.granted_scope as string[]) ?? [],
          consent_given: new Date().toISOString().slice(0, 10),
          consent_status: 'Active',
          review_due: new Date(Date.now() + 182 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        })
        if (connectionError && connectionError.code !== '23505') {
          return json({ error: connectionError.message }, 400)
        }
      }

      await recordAudit({
        actorId: actor.id,
        actorLabel: actor.name,
        actorRole: actor.role,
        patientId,
        action: approve ? 'Gave access' : 'Declined a request for access',
        record: `Access request ${requestId}`,
        accessType: approve ? 'Share' : 'Revoke',
        why: str(body.note) ?? String(request.purpose),
        result: 'Allowed',
      })

      return json({ access_request: data, already_decided: false })
    }

    default:
      return json({ error: 'unknown_action', action }, 400)
  }
})

/** A decision nobody is told about is a decision nobody acts on. */
async function notify(
  patientId: string,
  roles: string[],
  what: string,
  detail: string,
  reviewId: string,
) {
  const unique = [...new Set(roles)]
  if (!unique.length) return
  await admin.from('notifications').insert({
    patient_id: patientId,
    category: 'Approval required',
    what,
    why: detail,
    todo: 'Open it, read what is proposed, and approve, edit or decline.',
    for_roles: unique,
    href: '/patient/requests',
  })
  // The id is kept in the audit trail rather than the notification, which is
  // deliberately a thing a person reads rather than a thing code follows.
  void reviewId
}
