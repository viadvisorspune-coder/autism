/**
 * safety_authority_review_service — the consequence gate.
 *
 * Returns one of five verbs. It is deliberately conservative and deliberately
 * dumb: it looks for language and actions that require professional authority
 * and refuses to let them pass on a model's say-so. When it escalates it
 * creates a review_item, so a named human sees it in their own interface.
 */
import { admin, guard, json, recordAudit, str } from '../_shared/yoxa.ts'

/** Anything here is outside what the platform may assert or decide. */
const CLINICAL_CLAIMS = [
  'diagnos', 'you have autism', 'severity', 'comorbid', 'prognosis', 'disorder',
  'medication', 'dose', 'dosage', 'prescri', 'titrat', 'ssri', 'antidepressant',
  'treatment plan', 'therapy is indicated', 'clinically significant',
]

const CRISIS_TERMS = ['suicide', 'self-harm', 'harm myself', 'end my life', 'overdose', 'emergency']

const INSTITUTIONAL_ACTIONS = [
  'terminate', 'dismiss', 'fit for work', 'unfit', 'statutory', 'legal determination',
  'entitlement', 'benefit decision', 'disciplinary',
]

const hit = (text: string, terms: string[]) => terms.filter((t) => text.includes(t))

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = str(body.purpose) ?? 'consequence_gate'
    const patientId = str(body.patient_id)
    const workflowRunId = str(body.workflow_run_id)
    const proposedAction = str(body.proposed_action) ?? ''
    const content = str(body.content) ?? ''
    const recipientRole = str(body.recipient_role)

    if (!patientId) return json({ error: 'patient_id is required' }, 400)

    const haystack = `${proposedAction} ${content}`.toLowerCase()
    const findings: string[] = []

    const crisis = hit(haystack, CRISIS_TERMS)
    const clinical = hit(haystack, CLINICAL_CLAIMS)
    const institutional = hit(haystack, INSTITUTIONAL_ACTIONS)

    let decision: 'PROCEED' | 'ASK' | 'WAIT' | 'STOP' | 'ESCALATE' = 'PROCEED'
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    let requiresHuman = false
    let reason = 'No consequential action is proposed. Descriptive, user-attributed content only.'

    if (crisis.length) {
      decision = 'ESCALATE'
      riskLevel = 'high'
      requiresHuman = true
      reason = 'Content indicates possible risk of harm. This requires a person, immediately, not a workflow step.'
      findings.push(`Risk language present: ${crisis.join(', ')}`)
    } else if (clinical.length) {
      decision = 'STOP'
      riskLevel = 'high'
      requiresHuman = true
      reason = 'The proposed content makes or implies a clinical claim. ORCA does not diagnose, grade severity or advise on medication.'
      findings.push(`Clinical claim language: ${clinical.join(', ')}`)
    } else if (institutional.length) {
      decision = 'ESCALATE'
      riskLevel = 'medium'
      requiresHuman = true
      reason = 'The proposed action implies a statutory or employment determination, which is outside the platform’s authority.'
      findings.push(`Institutional decision language: ${institutional.join(', ')}`)
    } else if (recipientRole && recipientRole !== 'patient') {
      decision = 'ASK'
      riskLevel = 'medium'
      requiresHuman = true
      reason = 'Information would leave the patient’s boundary. That needs the patient’s explicit, per-recipient approval first.'
      findings.push(`Outbound recipient: ${recipientRole}`)
    }

    let reviewItemId: string | null = null
    if (requiresHuman) {
      const assigned = decision === 'ASK' ? ['patient'] : decision === 'STOP' ? ['patient', 'psychologist'] : ['psychiatrist', 'psychologist']
      const { data } = await admin
        .from('review_items')
        .insert({
          patient_id: patientId,
          title: purpose === 'reasoning_boundary' ? 'Reasoning needs human review' : 'Action needs human review',
          reason,
          understanding: content.slice(0, 500) || proposedAction.slice(0, 500),
          evidence: findings,
          uncertainty: 'Flagged by the deterministic policy layer, not by a judgement about the person.',
          proposed_action: proposedAction.slice(0, 500),
          decision_required: decision === 'ASK' ? 'Approve, edit or refuse this disclosure.' : 'Review before anything continues.',
          assigned_to: assigned,
          status: decision === 'ESCALATE' ? 'Escalated' : 'Awaiting approval',
          workflow_run_id: workflowRunId,
        })
        .select('id')
        .single()
      reviewItemId = data?.id ?? null
    }

    await recordAudit({
      actorLabel: 'ORCA Safety, Consent & Access agent',
      patientId,
      action: `Safety and authority review (${purpose}) → ${decision}`,
      record: reviewItemId ? `Review item ${reviewItemId}` : 'No consequential action',
      accessType: 'Approve',
      why: reason,
      result: decision === 'STOP' ? 'Denied' : 'Allowed',
      workflowRunId,
    })

    return json({
      decision,
      risk_level: riskLevel,
      requires_human_review: requiresHuman,
      review_item_id: reviewItemId,
      findings,
      reason,
      permitted_next_step: decision === 'PROCEED'
        ? 'Continue to the next workflow step.'
        : 'Hold. The workflow may not continue until the named human has decided.',
    })
  }),
)
