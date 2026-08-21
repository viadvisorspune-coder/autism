/**
 * governance_ledger_service — consent over time, access still being asked for,
 * clarification exchanges, and retention position.
 *
 * Deliberately a separate endpoint rather than an extension of
 * identity_access_service. That endpoint answers "may this happen now"; this
 * one answers "what was true then, and what is still outstanding". Keeping
 * them apart also means the connectors already in service are untouched.
 */
import { admin, guard, json, list, recordAudit, str } from '../_shared/yoxa.ts'

type Purpose =
  | 'consent_history'
  | 'scope_at'
  | 'request_access'
  | 'pending_access_requests'
  | 'ask_clarification'
  | 'answer_clarification'
  | 'retention_report'

Deno.serve(
  guard(async (_req, { body }) => {
    const purpose = (str(body.purpose) ?? 'consent_history') as Purpose
    const patientId = str(body.patient_id)
    const actorId = str(body.actor_id)
    const personId = str(body.person_id)
    const workflowRunId = str(body.workflow_run_id)

    if (purpose === 'retention_report') {
      const { data, error } = await admin.from('retention_due').select('*')
      if (error) return json({ error: error.message }, 400)
      const { data: policies } = await admin.from('retention_policies').select('*')
      return json({
        purpose,
        patient_id: null,
        retention: {
          policies: (policies ?? []).map((p) => ({
            dataset: String(p.dataset),
            keep_months: Number(p.keep_months),
            basis: String(p.basis),
            on_expiry: String(p.on_expiry),
            review_owner: String(p.review_owner),
          })),
          past_policy: (data ?? []).map((r) => ({
            dataset: String(r.dataset),
            rows_past_policy: Number(r.rows_past_policy ?? 0),
            oldest: r.oldest ? String(r.oldest) : null,
          })),
        },
        note:
          'Nothing is deleted automatically. Destroying a person’s record is a decision that needs a person.',
      })
    }

    if (!patientId) return json({ error: 'patient_id is required' }, 400)

    const { data: known } = await admin.from('patients').select('id').eq('id', patientId).maybeSingle()
    if (!known) {
      return json(
        {
          error: 'patient_not_found',
          patient_id: patientId,
          fix: 'Use the id of a patient that exists in the application. Seeded ids: pt-ananya, pt-rohan, pt-farida, pt-dev, pt-neha.',
        },
        404,
      )
    }

    switch (purpose) {
      case 'consent_history': {
        let query = admin
          .from('consent_events')
          .select('id, person_id, changed_at, change_type, previous_scope, new_scope, previous_status, new_status, purpose, reason')
          .eq('patient_id', patientId)
          .order('changed_at', { ascending: false })
          .limit(100)
        if (personId) query = query.eq('person_id', personId)

        const { data, error } = await query
        if (error) return json({ error: error.message }, 400)

        const names = await nameMap(data?.map((e) => String(e.person_id)) ?? [])

        await recordAudit({
          actorId,
          actorLabel: actorId ? (names[actorId] ?? actorId) : 'ORCA Orchestrator agent',
          patientId,
          action: 'Read consent history',
          record: `Patient ${patientId}`,
          accessType: 'Read',
          why: 'Establishing what was permitted and when',
          result: 'Allowed',
          workflowRunId,
        })

        return json({
          purpose,
          patient_id: patientId,
          consent_history: (data ?? []).map((e) => ({
            id: String(e.id),
            person_id: String(e.person_id),
            person_name: names[String(e.person_id)] ?? String(e.person_id),
            changed_at: String(e.changed_at),
            change_type: String(e.change_type),
            previous_scope: (e.previous_scope as string[] | null) ?? null,
            new_scope: (e.new_scope as string[] | null) ?? null,
            previous_status: e.previous_status ? String(e.previous_status) : null,
            new_status: e.new_status ? String(e.new_status) : null,
            purpose: e.purpose ? String(e.purpose) : null,
            reason: e.reason ? String(e.reason) : null,
          })),
        })
      }

      case 'scope_at': {
        const asOf = str(body.as_of)
        if (!personId || !asOf) {
          return json({ error: 'person_id and as_of are required for scope_at' }, 400)
        }

        const { data, error } = await admin.rpc('orca_scope_at', {
          target: patientId,
          person: personId,
          at_time: asOf,
        })
        if (error) return json({ error: error.message }, 400)

        const scope = (data as string[] | null) ?? []
        const names = await nameMap([personId])

        return json({
          purpose,
          patient_id: patientId,
          scope_at: {
            person_id: personId,
            person_name: names[personId] ?? personId,
            as_of: asOf,
            scope,
            had_access: scope.length > 0,
            // The distinction matters in a dispute: never granted is not the
            // same as granted and later withdrawn.
            note:
              scope.length > 0
                ? 'This is what was visible to that person at that moment.'
                : 'Nothing was visible to that person at that moment — consent was absent, revoked, or expired.',
          },
        })
      }

      case 'request_access': {
        if (!actorId) return json({ error: 'actor_id is required to request access' }, 400)

        const { data: actor } = await admin
          .from('app_users')
          .select('id, name, role')
          .eq('id', actorId)
          .maybeSingle()
        if (!actor) return json({ error: 'actor_not_found', actor_id: actorId }, 404)
        if (actor.role === 'patient') {
          return json({ error: 'a patient does not request access to a record', actor_id: actorId }, 400)
        }

        const requestPurpose = str(body.purpose_text) ?? str(body.justification)
        if (!requestPurpose) {
          return json({ error: 'purpose_text is required: the patient is entitled to know why' }, 400)
        }

        const { data: existing } = await admin
          .from('access_requests')
          .select('id, created_at')
          .eq('patient_id', patientId)
          .eq('requested_by', actorId)
          .eq('status', 'Pending')
          .maybeSingle()

        // A second ask while the first is unanswered is pressure, not a request.
        if (existing) {
          return json({
            purpose,
            patient_id: patientId,
            access_request: {
              id: String(existing.id),
              status: 'Pending',
              created: false,
              note: `${actor.name} already has a request awaiting an answer from this patient. Raising another would be pressure, not a request.`,
            },
          })
        }

        const { data, error } = await admin
          .from('access_requests')
          .insert({
            patient_id: patientId,
            requested_by: actorId,
            requested_role: actor.role,
            purpose: requestPurpose,
            requested_scope: list(body.requested_scope),
            justification: str(body.justification),
            workflow_run_id: workflowRunId,
          })
          .select('id, status, created_at')
          .single()
        if (error) return json({ error: error.message }, 400)

        await recordAudit({
          actorId,
          actorLabel: actor.name,
          actorRole: actor.role,
          patientId,
          action: `Requested access: ${requestPurpose}`,
          record: `Patient ${patientId}`,
          accessType: 'Read',
          why: requestPurpose,
          result: 'Denied',
          workflowRunId,
        })

        return json({
          purpose,
          patient_id: patientId,
          access_request: {
            id: String(data.id),
            status: String(data.status),
            created: true,
            note: 'Recorded. No access has been granted; the patient decides, and nothing proceeds until they do.',
          },
        })
      }

      case 'pending_access_requests': {
        const { data, error } = await admin
          .from('access_requests')
          .select('id, requested_by, requested_role, purpose, requested_scope, justification, status, created_at')
          .eq('patient_id', patientId)
          .eq('status', 'Pending')
          .order('created_at', { ascending: true })
        if (error) return json({ error: error.message }, 400)

        const names = await nameMap(data?.map((r) => String(r.requested_by)) ?? [])

        return json({
          purpose,
          patient_id: patientId,
          access_requests: (data ?? []).map((r) => ({
            id: String(r.id),
            requested_by: String(r.requested_by),
            requested_by_name: names[String(r.requested_by)] ?? String(r.requested_by),
            requested_role: String(r.requested_role),
            purpose: String(r.purpose),
            requested_scope: (r.requested_scope as string[] | null) ?? [],
            justification: r.justification ? String(r.justification) : null,
            status: String(r.status),
            created_at: String(r.created_at),
          })),
        })
      }

      case 'ask_clarification':
      case 'answer_clarification': {
        const requestId = str(body.request_id)
        if (!requestId) return json({ error: 'request_id is required' }, 400)

        const { data: request } = await admin
          .from('requests')
          .select('id, patient_id, title, destination, destination_role, withheld')
          .eq('id', requestId)
          .maybeSingle()
        if (!request) return json({ error: 'request_not_found', request_id: requestId }, 404)
        if (request.patient_id !== patientId) {
          return json({ error: 'request_belongs_to_another_patient', request_id: requestId }, 400)
        }

        if (purpose === 'ask_clarification') {
          const question = str(body.question)
          if (!question) return json({ error: 'question is required' }, 400)

          const { data, error } = await admin
            .from('request_clarifications')
            .insert({
              request_id: requestId,
              asked_by: actorId,
              asked_by_label: str(body.asked_by_label) ?? actorId ?? String(request.destination),
              question,
              workflow_run_id: workflowRunId,
            })
            .select('id, asked_on')
            .single()
          if (error) return json({ error: error.message }, 400)

          return json({
            purpose,
            patient_id: patientId,
            clarification: {
              id: String(data.id),
              request_id: requestId,
              question,
              answered: false,
              awaiting: 'The patient. An answer leaves their record, so it is theirs to give.',
            },
          })
        }

        const clarificationId = str(body.clarification_id)
        const answer = str(body.answer)
        if (!clarificationId || !answer) {
          return json({ error: 'clarification_id and answer are required' }, 400)
        }

        // An answer to an outside organisation is a disclosure. It carries the
        // patient's approval or it does not go.
        const approvedBy = str(body.approved_by)
        if (!approvedBy) {
          return json(
            {
              error: 'approval_required',
              fix: 'Answering a clarification sends information outside the record. Set approved_by to the patient who approved it.',
            },
            403,
          )
        }

        const { data, error } = await admin
          .from('request_clarifications')
          .update({
            answer,
            answered_on: new Date().toISOString().slice(0, 10),
            answered_by: actorId,
            approved_by: approvedBy,
            withheld: list(body.withheld),
            workflow_run_id: workflowRunId,
          })
          .eq('id', clarificationId)
          .eq('request_id', requestId)
          .select('id, question, answer, answered_on')
          .single()
        if (error) return json({ error: error.message }, 400)

        await recordAudit({
          actorId,
          actorLabel: actorId ?? 'ORCA Orchestrator agent',
          patientId,
          action: `Answered clarification on ${request.title}`,
          record: `Request ${requestId}`,
          accessType: 'Share',
          why: 'Clarification requested by the recipient organisation',
          result: 'Allowed',
          workflowRunId,
        })

        return json({
          purpose,
          patient_id: patientId,
          clarification: {
            id: String(data.id),
            request_id: requestId,
            question: String(data.question),
            answer: String(data.answer),
            answered: true,
            answered_on: String(data.answered_on),
            withheld: list(body.withheld),
          },
        })
      }

      default:
        return json({ error: 'unknown_purpose', purpose }, 400)
    }
  }),
)

/** Names, resolved once, so a response never shows a bare identifier. */
async function nameMap(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return {}
  const { data } = await admin.from('app_users').select('id, name').in('id', unique)
  return Object.fromEntries((data ?? []).map((u) => [String(u.id), String(u.name)]))
}
