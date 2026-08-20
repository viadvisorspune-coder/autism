/**
 * identity_access_service — actor identity, role, consent, data scope and
 * disclosure permission.
 *
 * This is the endpoint that answers "is this employer allowed to see the
 * psychiatrist's note?", and it answers it from the connections table rather
 * than by asking a model. A denial is recorded as carefully as an approval.
 */
import { admin, guard, json, list, recordAudit, str } from '../_shared/yoxa.ts'

/** Categories each role may ever receive, before per-patient consent narrows it. */
const ROLE_CEILING: Record<string, string[]> = {
  patient: ['personal', 'functional', 'clinical', 'support', 'work', 'university', 'documents', 'audit'],
  psychologist: ['personal', 'functional', 'clinical', 'support', 'work', 'university', 'documents'],
  psychiatrist: ['personal', 'functional', 'clinical', 'support', 'documents'],
  therapist: ['functional', 'support', 'documents'],
  ot: ['functional', 'support', 'environment', 'documents'],
  gp: ['clinical', 'functional', 'documents'],
  clinic: ['appointments', 'documents', 'workflow'],
  employer: ['work'],
  university: ['university'],
  trusted: ['shared'],
  admin: ['workflow', 'audit'],
}

/** Never leaves the patient boundary for these roles, whatever consent says. */
const NEVER_DISCLOSE: Record<string, string[]> = {
  employer: ['clinical', 'diagnosis', 'session notes', 'journal', 'documents'],
  university: ['clinical', 'diagnosis', 'session notes', 'journal'],
  trusted: ['clinical', 'session notes', 'journal'],
  admin: ['personal', 'clinical', 'functional', 'support', 'journal'],
}

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = str(body.purpose) ?? 'access_check'
    const patientId = str(body.patient_id)
    const actorId = str(body.actor_id)
    const recipientId = str(body.recipient_id)
    const requested = list(body.data_categories)
    const workflowRunId = str(body.workflow_run_id)

    if (!patientId || !actorId) {
      return json({ error: 'patient_id and actor_id are required' }, 400)
    }

    const { data: actor } = await admin
      .from('app_users')
      .select('id, name, role')
      .eq('id', actorId)
      .maybeSingle()

    if (!actor) {
      await recordAudit({
        actorLabel: actorId,
        patientId,
        action: `Identity check for ${purpose}`,
        record: `Patient ${patientId}`,
        accessType: 'Read',
        why: 'Unknown actor',
        result: 'Denied',
        workflowRunId,
      })
      return json(deny(patientId, 'Actor is not a known user of this platform.'), 200)
    }

    // The patient always has authority over their own record.
    const { data: patient } = await admin
      .from('patients')
      .select('id, user_id')
      .eq('id', patientId)
      .maybeSingle()

    const isSelf = patient?.user_id === actor.id

    // Everyone else needs a live connection the patient created.
    const subjectId = recipientId ?? actor.id
    const { data: connection } = await admin
      .from('connections')
      .select('access_scope, purpose, consent_status, review_due, relationship')
      .eq('patient_id', patientId)
      .eq('person_id', subjectId)
      .maybeSingle()

    const { data: subject } = await admin
      .from('app_users')
      .select('id, name, role')
      .eq('id', subjectId)
      .maybeSingle()

    const subjectRole = subject?.role ?? 'patient'
    const expired = connection?.review_due ? new Date(connection.review_due) < new Date() : false
    const consentLive = connection?.consent_status === 'Active' && !expired

    let decision: 'allow' | 'allow_with_private_scope' | 'deny' | 'requires_consent'
    let reason: string

    if (isSelf && !recipientId) {
      decision = 'allow_with_private_scope'
      reason = 'The submitting user is acting within their own record for a stated personal purpose.'
    } else if (!connection) {
      decision = 'requires_consent'
      reason = 'No connection exists between this patient and the recipient. The patient must create one.'
    } else if (!consentLive) {
      decision = 'deny'
      reason = expired
        ? 'The connection is past its review date and has lapsed.'
        : `Consent status is ${connection.consent_status}.`
    } else {
      decision = 'allow'
      reason = `Access is consistent with the recorded purpose: ${connection.purpose}.`
    }

    const ceiling = ROLE_CEILING[subjectRole] ?? []
    const permitted = (requested.length ? requested : ceiling).filter((c) => ceiling.includes(c))
    const excluded = requested.filter((c) => !ceiling.includes(c))
    const restrictions = [
      ...(NEVER_DISCLOSE[subjectRole] ?? []).map(
        (c) => `${c} is outside the ${subjectRole} boundary and is never included`,
      ),
      ...(connection && consentLive ? [`Limited to: ${connection.access_scope.join(', ')}`] : []),
      ...(decision === 'allow_with_private_scope' ? ['Private to the patient; no recipient authorised'] : []),
    ]

    const auditId = await recordAudit({
      actorId: actor.id,
      actorLabel: actor.name,
      actorRole: actor.role,
      patientId,
      action: `Access decision (${purpose}) for ${subject?.name ?? subjectId}`,
      record: `Patient ${patientId}`,
      accessType: purpose === 'disclosure_check' || purpose === 'recipient_check' ? 'Share' : 'Read',
      why: reason,
      result: decision === 'deny' ? 'Denied' : 'Allowed',
      workflowRunId,
    })

    return json({
      decision,
      patient_id: patientId,
      actor: { id: actor.id, name: actor.name, role: actor.role },
      recipient: subject ? { id: subject.id, name: subject.name, role: subject.role } : null,
      permitted_categories: permitted,
      excluded_categories: excluded,
      restrictions,
      consent_status: connection?.consent_status ?? 'None',
      reason,
      audit_id: auditId,
    })
  }),
)

function deny(patientId: string, reason: string) {
  return {
    decision: 'deny',
    patient_id: patientId,
    actor: null,
    recipient: null,
    permitted_categories: [],
    excluded_categories: [],
    restrictions: ['Unrecognised actor'],
    consent_status: 'None',
    reason,
    audit_id: null,
  }
}
