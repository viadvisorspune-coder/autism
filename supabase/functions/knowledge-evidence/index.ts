/**
 * knowledge_evidence_service — the longitudinal record.
 *
 * One endpoint with a purpose discriminator, because Yoxa calls this capability
 * nine different ways across the workflow and a connector is one operation.
 * Reads return evidence with its provenance attached; the only write it accepts
 * creates a memory *candidate*, never a fact. Nothing an agent infers becomes
 * part of the record here — a person confirms it elsewhere.
 */
import { inferFromRecentRun } from '../_shared/whoami.ts'
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
    const rawPatientId = str(body.patient_id)
    const rawActorId = str(body.actor_id)
    const since = str(body.since)
    const categories = list(body.categories)
    const workflowRunId = str(body.workflow_run_id)
    const limit = Math.min(Number(body.limit ?? 25) || 25, 100)

    // Same fallback as the reply endpoint: an agent that never saw the ids
    // sends empty strings, and refusing the read means the reply that follows
    // is ungrounded — which is the failure this whole endpoint exists to
    // prevent. See _shared/whoami.ts for the bound and the refusal case.
    let patientId = rawPatientId
    let actorId = rawActorId
    if (!patientId || !actorId) {
      const guess = await inferFromRecentRun()
      if (guess) {
        patientId = patientId || guess.patientId
        actorId = actorId || guess.actorId
      }
    }
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

    /**
     * Documents, folded into the same list rather than a field of their own.
     *
     * This endpoint never read the documents table, so every agent in both
     * workflows was blind to the most visible half of the record — the OT's
     * workplace observation, HR's adjustment request, the sister's note about
     * what a hard day looks like. A retrieval that returns a person's history
     * and none of the documents written about them is not the record.
     *
     * They arrive as ordinary records with category "Documents". That is
     * deliberate: the connector contract fixes the response shape, so a new
     * top-level field would have meant re-uploading eight files. A document
     * fits the record shape exactly, and an agent reading a chronology does
     * not need to know which table a line came from.
     */
    const { data: actorRow } = actorId
      ? await admin.from('app_users').select('role').eq('id', actorId).maybeSingle()
      : { data: null }
    // Unresolvable actor gets the narrowest useful scope rather than the
    // widest. Asserted identity is thin enough already.
    const viewerRole = (actorRow?.role as string) ?? 'patient'

    const [{ data: eventRows }, { data: strategyRows }, { data: profileRows }, { data: docRows }] =
      await Promise.all([
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
      admin
        .from('documents')
        .select('id, title, category, source_id, source_label, recorded_on, status, extracted, access')
        .eq('patient_id', patientId)
        .contains('access', [viewerRole])
        .order('recorded_on', { ascending: false }),
    ])

    const sourceIds = [
      ...new Set(
        [...(eventRows ?? []), ...(docRows ?? [])].map((e) => e.source_id).filter(Boolean),
      ),
    ] as string[]
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

    // What ORCA found in each file, or an honest note that it has not read it.
    // A document listed as though its contents were known, when nothing has
    // parsed it, is the invented-finding failure in a different costume.
    const documents = (docRows ?? []).map((d) => {
      const found = (d.extracted as { label?: string; value?: string }[] | null) ?? []
      return {
        id: String(d.id),
        title: String(d.title),
        summary: found.length
          ? found.map((x) => `${x.label}: ${x.value}`).join(' · ')
          : `${d.status}. Nothing has been read from this file yet.`,
        category: 'Documents',
        recorded_on: d.recorded_on,
        occurred_on: null,
        evidence_status: 'Professionally documented',
        source: nameOf(d.source_id as string | null, d.source_label as string | null),
        source_role: sources?.find((x) => x.id === d.source_id)?.role ?? 'system',
      }
    })

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
      // Newest first across both, so an agent reading down gets a chronology
      // rather than events then documents.
      records: [...records, ...documents].sort((a, b) =>
        String(b.recorded_on).localeCompare(String(a.recorded_on)),
      ),
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
