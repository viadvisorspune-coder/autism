/**
 * knowledge_evidence_service — the longitudinal record.
 *
 * One endpoint with a purpose discriminator, because Yoxa calls this capability
 * nine different ways across the workflow and a connector is one operation.
 * Reads return evidence with its provenance attached; the only write it accepts
 * creates a memory *candidate*, never a fact. Nothing an agent infers becomes
 * part of the record here — a person confirms it elsewhere.
 */
import { admin, guard, json, list, recordAudit, str } from '../_shared/yoxa.ts'

type Purpose =
  | 'retrieve_context'
  | 'evidence_provenance'
  | 'gap_analysis'
  | 'goal_context'
  | 'supporting_evidence'
  | 'previous_strategies'
  | 'evidence_filter'
  | 'outcome_capture'
  | 'memory_update'

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = (str(body.purpose) ?? 'retrieve_context') as Purpose
    const patientId = str(body.patient_id)
    const actorId = str(body.actor_id)
    const since = str(body.since)
    const categories = list(body.categories)
    const workflowRunId = str(body.workflow_run_id)
    const limit = Math.min(Number(body.limit ?? 25) || 25, 100)

    if (!patientId) return json({ error: 'patient_id is required' }, 400)

    // A memory candidate is the one thing this endpoint writes.
    if (purpose === 'memory_update') {
      const candidate = (body.candidate ?? {}) as Record<string, unknown>
      const proposal = str(candidate.proposal)
      if (!proposal) return json({ error: 'candidate.proposal is required' }, 400)

      const { data, error } = await admin
        .from('memory_candidates')
        .insert({
          patient_id: patientId,
          proposal,
          confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0.5))),
          evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
          related_history: str(candidate.related_history),
          raised_for: list(candidate.raised_for).length ? list(candidate.raised_for) : ['patient'],
          workflow_run_id: workflowRunId,
        })
        .select('id')
        .single()

      if (error) return json({ error: error.message }, 400)

      await recordAudit({
        actorId,
        actorLabel: 'ORCA Understanding & Memory agent',
        patientId,
        action: 'Proposed a longitudinal update',
        record: `Memory candidate ${data.id}`,
        accessType: 'Write',
        why: 'Pattern observed across existing evidence',
        result: 'Allowed',
        workflowRunId,
      })

      return json({
        patient_id: patientId,
        purpose,
        records: [],
        strategies: [],
        sufficiency: {
          status: 'sufficient',
          missing: [],
          note: 'Stored as a candidate. It is not part of the record until a person confirms it.',
        },
        memory_candidate_id: data.id,
      })
    }

    // Everything else is a read, narrowed by purpose.
    let events = admin
      .from('timeline_events')
      .select('id, title, summary, category, recorded_on, occurred_on, evidence, source_id, source_label, visible_to')
      .eq('patient_id', patientId)
      .order('recorded_on', { ascending: false })
      .limit(limit)

    if (since) events = events.gte('recorded_on', since)
    if (categories.length) events = events.in('category', categories)

    const [{ data: eventRows }, { data: strategyRows }, { data: profileRows }] = await Promise.all([
      events,
      admin
        .from('strategies')
        .select('id, title, goal, status, phase, review_date, outcome, starts_on')
        .eq('patient_id', patientId)
        .order('starts_on', { ascending: false }),
      admin
        .from('profile_items')
        .select('id, section, text, evidence, recorded_on, outdated')
        .eq('patient_id', patientId)
        .eq('outdated', false),
    ])

    const sourceIds = [...new Set((eventRows ?? []).map((e) => e.source_id).filter(Boolean))] as string[]
    const { data: sources } = sourceIds.length
      ? await admin.from('app_users').select('id, name, role').in('id', sourceIds)
      : { data: [] as { id: string; name: string; role: string }[] }

    const nameOf = (id: string | null, fallback: string | null) =>
      sources?.find((s) => s.id === id)?.name ?? fallback ?? 'Unattributed'

    const records = (eventRows ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      category: e.category,
      recorded_on: e.recorded_on,
      occurred_on: e.occurred_on,
      evidence_status: e.evidence,
      source: nameOf(e.source_id, e.source_label),
      source_role: sources?.find((s) => s.id === e.source_id)?.role ?? 'system',
    }))

    const strategies = (strategyRows ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      goal: s.goal,
      status: s.status,
      phase: s.phase,
      review_date: s.review_date,
      effectiveness: (s.outcome as { effectiveness?: string } | null)?.effectiveness ?? null,
      outcome_summary: (s.outcome as { summary?: string } | null)?.summary ?? null,
    }))

    // Say plainly what is missing rather than letting an agent assume the
    // silence means nothing happened.
    const missing: string[] = []
    if (!records.length) missing.push('No recorded events match this scope.')
    if (purpose === 'outcome_capture' && !strategies.some((s) => s.effectiveness)) {
      missing.push('No strategy has a recorded outcome yet.')
    }
    if (purpose === 'goal_context' && !(profileRows ?? []).some((p) => p.section === 'Current goals')) {
      missing.push('No current goals are recorded.')
    }

    await recordAudit({
      actorId,
      actorLabel: 'ORCA Understanding & Memory agent',
      patientId,
      action: `Retrieved longitudinal context (${purpose})`,
      record: `${records.length} events, ${strategies.length} strategies`,
      accessType: 'Read',
      why: purpose,
      result: 'Allowed',
      workflowRunId,
    })

    return json({
      patient_id: patientId,
      purpose,
      records,
      strategies,
      profile: (profileRows ?? []).map((p) => ({
        id: p.id,
        section: p.section,
        text: p.text,
        evidence_status: p.evidence,
        recorded_on: p.recorded_on,
      })),
      sufficiency: {
        status: missing.length ? 'insufficient' : 'sufficient',
        missing,
        note: 'Patient-reported unless the evidence status says otherwise. Absence of a record is not evidence of absence.',
      },
      memory_candidate_id: null,
    })
  }),
)
