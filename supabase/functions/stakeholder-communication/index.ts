/**
 * stakeholder_communication_service — clarification requests and follow-ups.
 *
 * This does not message anyone outside the platform. It raises the question
 * inside ORCA, addressed to a role, phrased as what happened / why it matters /
 * what you need to do. Whether an answer ever leaves the patient's boundary is
 * a separate, explicitly approved disclosure.
 */
import { admin, guard, json, recordAudit, str } from '../_shared/yoxa.ts'

const HREF_BY_ROLE: Record<string, string> = {
  patient: '/patient/requests',
  psychologist: '/psychologist/tasks',
  psychiatrist: '/psychiatrist/tasks',
  therapist: '/therapist/tasks',
  ot: '/ot/trials',
  gp: '/gp/tasks',
  clinic: '/clinic/pending',
  employer: '/employer/requests',
  university: '/university/requests',
  trusted: '/trusted',
  admin: '/admin/workflows',
}

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = str(body.purpose) ?? 'clarification'
    const patientId = str(body.patient_id)
    const recipientRole = str(body.recipient_role) ?? 'patient'
    const question = str(body.question)
    const due = str(body.due)
    const workflowRunId = str(body.workflow_run_id)
    const requestId = str(body.request_id)

    if (!patientId) return json({ error: 'patient_id is required' }, 400)
    if (purpose === 'clarification' && !question) {
      return json({ error: 'question is required for a clarification' }, 400)
    }

    const isClarification = purpose === 'clarification'

    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        patient_id: patientId,
        category: isClarification ? 'Action required' : 'Follow-up',
        what: isClarification
          ? 'ORCA needs one piece of information before it can continue.'
          : 'A follow-up is due.',
        why: isClarification
          ? 'Something in the record is missing or ambiguous, and guessing it would put a wrong fact in your history.'
          : 'An outcome was expected by now and has not been recorded.',
        todo: question ?? 'Add how it went, or say that nothing happened.',
        for_roles: [recipientRole],
        href: HREF_BY_ROLE[recipientRole] ?? '/patient',
        workflow_run_id: workflowRunId,
      })
      .select('id, created_at')
      .single()

    if (error) return json({ error: error.message }, 400)

    // A clarification aimed at an external stakeholder is also recorded on the
    // request itself, so the thread stays with the thing it is about.
    if (isClarification && requestId) {
      const { data: request } = await admin
        .from('requests')
        .select('clarifications')
        .eq('id', requestId)
        .maybeSingle()

      if (request) {
        const existing = Array.isArray(request.clarifications) ? request.clarifications : []
        await admin
          .from('requests')
          .update({
            clarifications: [
              ...existing,
              { date: new Date().toISOString().slice(0, 10), from: 'ORCA', question },
            ],
            status: 'Awaiting information',
          })
          .eq('id', requestId)
      }
    }

    await recordAudit({
      actorLabel: 'ORCA Orchestrator agent',
      patientId,
      action: isClarification ? 'Raised a clarification request' : 'Scheduled a follow-up',
      record: `Notification ${notification.id}`,
      accessType: 'Write',
      why: question ?? purpose,
      result: 'Allowed',
      workflowRunId,
    })

    return json({
      notification_id: notification.id,
      purpose,
      recipient_role: recipientRole,
      question: question ?? null,
      due: due ?? null,
      status: 'Awaiting information',
      created_at: notification.created_at,
      note: 'Raised inside ORCA. Nothing has been sent outside the patient’s boundary.',
    })
  }),
)
