/**
 * audit_provenance_service — append one audit event.
 *
 * Append-only by design: there is no update or delete path, here or anywhere
 * else in the application. The patient can read their own log, so this is a
 * record kept for them, not only about them.
 */
import { admin, guard, json, str } from '../_shared/yoxa.ts'

const ACCESS_TYPES = ['Read', 'Write', 'Share', 'Approve', 'Revoke', 'Login'] as const
type AccessType = (typeof ACCESS_TYPES)[number]

Deno.serve(
  guard(async (_req, { body }) => {
    const patientId = str(body.patient_id)
    const action = str(body.action)
    const record = str(body.record)
    const rawAccess = str(body.access_type) ?? 'Read'
    const accessType = (ACCESS_TYPES.includes(rawAccess as AccessType) ? rawAccess : 'Read') as AccessType
    const result = str(body.result) === 'Denied' ? 'Denied' : 'Allowed'
    const actorId = str(body.actor_id)
    const workflowRunId = str(body.workflow_run_id)

    if (!action || !record) {
      return json({ error: 'action and record are required' }, 400)
    }

    let actorLabel = str(body.actor_label) ?? 'ORCA agent'
    let actorRole = str(body.actor_role)

    if (actorId) {
      const { data } = await admin.from('app_users').select('name, role').eq('id', actorId).maybeSingle()
      if (data) {
        actorLabel = data.name
        actorRole = data.role
      }
    }

    const { data, error } = await admin
      .from('audit_log')
      .insert({
        actor_id: actorId,
        actor_label: actorLabel,
        actor_role: actorRole,
        patient_id: patientId,
        action,
        record,
        access_type: accessType,
        why: str(body.why),
        result,
        workflow_run_id: workflowRunId,
      })
      .select('id, occurred_at')
      .single()

    if (error) return json({ error: error.message }, 400)

    return json({
      audit_id: data.id,
      recorded_at: data.occurred_at,
      workflow_run_id: workflowRunId,
      actor_label: actorLabel,
      result,
    })
  }),
)
