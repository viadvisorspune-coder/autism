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
      // Consent already exists at the connection. Ask again only when this
      // exceeds it.
      //
      // The old rule stopped for a person whenever a recipient existed at all,
      // which meant Ananya was asked to approve her own psychologist reading a
      // summary — the exact thing she had already consented to, by name, for a
      // stated purpose, with a review date. Asking again is not a second
      // safeguard. It teaches people that the approval means nothing, and a
      // person who approves seven things without reading them is less
      // protected than one who is asked once about something that matters.
      //
      // So the gate now asks the question that was always the real one: does
      // this exceed what has already been agreed? A connected professional
      // acting inside their scope proceeds, and it is written to the audit log
      // as a decision ORCA took alone, with the consent it relied on named. An
      // external recipient, a lapsed connection, or content outside the agreed
      // scope still stops, because those are genuinely new disclosures.
      const covered = await withinExistingConsent(patientId, recipientRole, haystack)

      if (covered.allowed) {
        decision = 'PROCEED'
        riskLevel = 'low'
        requiresHuman = false
        reason = `Already covered by consent: ${covered.because}`
        findings.push(`Recipient ${recipientRole} is connected and in scope.`)

        await recordAudit({
          actorLabel: 'ORCA',
          actorRole: 'admin',
          patientId,
          action: 'Proceeded without asking',
          record: proposedAction.slice(0, 200) || 'Disclosure within agreed scope',
          accessType: 'Share',
          why: covered.because,
          result: 'Allowed',
          workflowRunId,
        })
      } else {
        decision = 'ASK'
        riskLevel = 'medium'
        requiresHuman = true
        reason = covered.because
        findings.push(`Outbound recipient: ${recipientRole}`)
      }
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


/**
 * Whether this disclosure is inside something the patient has already agreed.
 *
 * The test is the connection they created: is this person connected, is that
 * consent live, has it passed its review date, and does the content fall
 * inside the scope they named? All four, or it stops.
 *
 * Deliberately strict about scope. "Timeline, profile, strategies" does not
 * cover a diagnosis, and a connection agreed for workplace adaptation does not
 * become general permission because the same person asked for something else.
 * The point of narrowing autonomy this way is that what it does allow, it
 * allows for a reason the patient could recognise as their own decision.
 */
const SCOPE_TERMS: Record<string, string[]> = {
  timeline: ['timeline', 'history', 'happened', 'event'],
  profile: ['profile', 'about me', 'what helps', 'preference'],
  strategies: ['strategy', 'strategies', 'outcome', 'check-in', 'trial'],
  documents: ['document', 'letter', 'report'],
  functional: ['functional', 'workplace', 'environment', 'adjustment', 'adaptation'],
}

async function withinExistingConsent(
  patientId: string,
  recipientRole: string,
  content: string,
): Promise<{ allowed: boolean; because: string }> {
  const { data: connections } = await admin
    .from('connections')
    .select('person_id, relationship, purpose, access_scope, consent_status, review_due')
    .eq('patient_id', patientId)

  const { data: people } = await admin.from('app_users').select('id, role')
  const idsForRole = new Set(
    (people ?? []).filter((p) => p.role === recipientRole).map((p) => String(p.id)),
  )

  const link = (connections ?? []).find((c) => idsForRole.has(String(c.person_id)))

  if (!link) {
    return {
      allowed: false,
      because:
        'Nobody in that role is connected to this record, so this would be a new disclosure and needs the patient to agree to it.',
    }
  }
  if (link.consent_status !== 'Active') {
    return {
      allowed: false,
      because: `That connection is ${String(link.consent_status).toLowerCase()}, so consent for it does not currently exist.`,
    }
  }
  if (link.review_due && new Date(String(link.review_due)) < new Date()) {
    return {
      allowed: false,
      because: 'That connection is past its review date, so it has lapsed and needs renewing before anything more is shared.',
    }
  }

  const scope = ((link.access_scope as string[] | null) ?? []).map((x) => x.toLowerCase())
  const inScope = scope.some((entry) => {
    const key = Object.keys(SCOPE_TERMS).find((k) => entry.includes(k))
    if (!key) return entry.split(/\s+/).some((word) => word.length > 4 && content.includes(word))
    return SCOPE_TERMS[key].some((term) => content.includes(term))
  })

  if (!inScope) {
    return {
      allowed: false,
      because: `This falls outside what was agreed for that connection (${scope.join(', ')}), so it needs the patient to widen it first.`,
    }
  }

  return {
    allowed: true,
    because: `${link.relationship} — consented on this record for ${link.purpose}, scope covers this, review due ${link.review_due}.`,
  }
}
