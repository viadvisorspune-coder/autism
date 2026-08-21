/**
 * app_read — the interface's read path.
 *
 * The browser asks for a resource and says who it is acting as. This decides
 * what that role may see and returns only that. The frontend never filters;
 * it renders whatever comes back, because a UI that receives data it should
 * not have is already a breach whether or not it draws it.
 *
 * DEMO BOUNDARY, stated plainly: ORCA has no sign-in yet, so the actor is
 * asserted by the caller rather than proven by a session. Scope is enforced
 * here, but identity is not. In production this function keeps its logic and
 * gains `currentActor(req)` in place of the asserted actor — the shape of
 * every query below is unchanged by that swap. Until then this is a
 * demonstration of the permission model, not a defence of it.
 */
import { admin, cors, json, str } from '../_shared/yoxa.ts'

type Resource =
  | 'bundle'
  | 'run'
  | 'privacy'
  | 'timeline'
  | 'requests'
  | 'profile'
  | 'strategies'
  | 'audit'
  | 'approvals'
  | 'workflow_runs'

/** What each role may ever receive, before per-patient consent narrows it. */
const ROLE_MAY_READ: Record<string, Resource[]> = {
  patient: ['bundle', 'run', 'privacy', 'timeline', 'requests', 'profile', 'strategies', 'audit', 'approvals', 'workflow_runs'],
  psychologist: ['bundle', 'run', 'timeline', 'profile', 'strategies', 'requests', 'approvals'],
  psychiatrist: ['bundle', 'run', 'timeline', 'profile', 'requests'],
  therapist: ['bundle', 'run', 'profile', 'strategies'],
  ot: ['bundle', 'run', 'profile', 'strategies'],
  gp: ['bundle', 'run', 'timeline', 'profile'],
  clinic: ['bundle', 'run', 'requests', 'workflow_runs'],
  employer: ['bundle', 'run', 'requests'],
  university: ['bundle', 'run', 'requests'],
  trusted: ['bundle', 'run', 'profile'],
  admin: ['bundle', 'run', 'workflow_runs', 'audit'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const resource = str(body.resource) as Resource | null
  const role = str(body.role) ?? 'patient'
  const actorId = str(body.actor_id)
  const patientId = str(body.patient_id)
  const runId = str(body.run_id)

  if (!resource) return json({ error: 'resource is required' }, 400)

  const allowed = ROLE_MAY_READ[role] ?? []
  if (!allowed.includes(resource)) {
    // Not an empty list — a refusal. A role that may not see a resource is
    // told so, rather than being shown a convincing blank page.
    return json(
      {
        resource,
        role,
        permitted: false,
        reason: `The ${role} role has no access to ${resource} in this record.`,
        data: null,
      },
      403,
    )
  }

  // Anyone who is not the patient needs a live connection, checked here rather
  // than assumed from the role.
  if (patientId && role !== 'patient' && role !== 'admin') {
    if (!actorId) return json({ error: 'actor_id is required for this role' }, 400)
    const { data: connection } = await admin
      .from('connections')
      .select('consent_status, review_due, access_scope')
      .eq('patient_id', patientId)
      .eq('person_id', actorId)
      .maybeSingle()

    const expired = connection?.review_due ? new Date(connection.review_due) < new Date() : false
    if (!connection || connection.consent_status !== 'Active' || expired) {
      return json(
        {
          resource,
          role,
          permitted: false,
          reason: !connection
            ? 'No connection exists between this record and you.'
            : expired
              ? 'The connection is past its review date and has lapsed.'
              : `Consent status is ${connection.consent_status}.`,
          data: null,
        },
        403,
      )
    }
  }

  try {
    const data = await read(resource, patientId, runId)
    return json({ resource, role, permitted: true, reason: null, data })
  } catch (error) {
    console.error(error)
    return json({ error: 'read_failed', detail: String(error) }, 500)
  }
})

async function read(
  resource: Resource,
  patientId: string | null,
  runId: string | null,
): Promise<unknown> {
  switch (resource) {
    // One run, with anything a person waiting on it would want to know: where
    // it has got to, whether it is stuck on a human, and what it is asking.
    case 'run': {
      if (!runId) return null
      const { data: run } = await admin
        .from('workflow_runs')
        .select('id, patient_id, type, status, current_step, waiting_for, steps, started_at, updated_at, closed_at, closure_reason')
        .eq('id', runId)
        .maybeSingle()
      if (!run) return null

      const [approvals, reviews, entries] = await Promise.all([
        admin
          .from('hitl_requests')
          .select('request_id, title, description, options, status, created_at')
          .eq('local_run_id', runId),
        admin
          .from('review_items')
          .select('id, title, reason, understanding, uncertainty, proposed_action, decision_required, status')
          .eq('workflow_run_id', runId),
        admin
          .from('audit_log')
          .select('id, occurred_at, actor_label, action, record, result, why')
          .eq('workflow_run_id', runId)
          .order('occurred_at', { ascending: true })
          .limit(50),
      ])

      return {
        run,
        approvals: approvals.data ?? [],
        reviews: reviews.data ?? [],
        activity: entries.data ?? [],
      }
    }

    // Everything the interface renders, in one call at boot. The alternative —
    // one request per screen — turns a role switch into twenty round trips and
    // makes every screen responsible for its own loading state.
    case 'bundle': {
      const [
        users,
        patients,
        connections,
        events,
        profile,
        strategies,
        checkins,
        appointments,
        documents,
        disclosures,
        requests,
        clarifications,
        candidates,
        reviews,
        notifications,
        runs,
        audit,
        notes,
        tasks,
        consentEvents,
        accessRequests,
        approvals,
      ] = await Promise.all([
        admin.from('app_users').select('*'),
        admin.from('patients').select('*'),
        admin.from('connections').select('*'),
        admin.from('timeline_events').select('*').order('recorded_on', { ascending: false }),
        admin.from('profile_items').select('*'),
        admin.from('strategies').select('*'),
        admin.from('strategy_checkins').select('*').order('recorded_on', { ascending: true }),
        admin.from('appointments').select('*').order('scheduled_for', { ascending: true }),
        admin.from('documents').select('*').order('recorded_on', { ascending: false }),
        admin.from('disclosures').select('*').order('disclosed_on', { ascending: false }),
        admin.from('requests').select('*').order('raised_on', { ascending: false }),
        admin.from('request_clarifications').select('*').order('asked_on', { ascending: true }),
        admin.from('memory_candidates').select('*'),
        admin.from('review_items').select('*'),
        admin.from('notifications').select('*').order('created_at', { ascending: false }),
        admin.from('workflow_runs').select('*').order('started_at', { ascending: false }),
        admin.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(200),
        admin.from('session_notes').select('*').order('held_on', { ascending: false }),
        admin.from('tasks').select('*'),
        admin.from('consent_events').select('*').order('changed_at', { ascending: false }),
        admin.from('access_requests').select('*').eq('status', 'Pending'),
        admin.from('hitl_requests').select('*').order('created_at', { ascending: false }).limit(25),
      ])

      return {
        app_users: users.data ?? [],
        patients: patients.data ?? [],
        connections: connections.data ?? [],
        timeline_events: events.data ?? [],
        profile_items: profile.data ?? [],
        strategies: strategies.data ?? [],
        strategy_checkins: checkins.data ?? [],
        appointments: appointments.data ?? [],
        documents: documents.data ?? [],
        disclosures: disclosures.data ?? [],
        requests: requests.data ?? [],
        request_clarifications: clarifications.data ?? [],
        memory_candidates: candidates.data ?? [],
        review_items: reviews.data ?? [],
        notifications: notifications.data ?? [],
        workflow_runs: runs.data ?? [],
        audit_log: audit.data ?? [],
        session_notes: notes.data ?? [],
        tasks: tasks.data ?? [],
        consent_events: consentEvents.data ?? [],
        access_requests: accessRequests.data ?? [],
        hitl_requests: approvals.data ?? [],
      }
    }

    case 'privacy': {
      if (!patientId) return null
      const [connections, disclosures, history, pending] = await Promise.all([
        admin
          .from('connections')
          .select('id, person_id, relationship, purpose, access_scope, consent_given, consent_status, review_due, last_interaction')
          .eq('patient_id', patientId)
          .order('consent_given', { ascending: true }),
        admin
          .from('disclosures')
          .select('id, disclosed_on, recipient, purpose, content_scope, items_shared')
          .eq('patient_id', patientId)
          .order('disclosed_on', { ascending: false }),
        admin
          .from('consent_events')
          .select('id, person_id, changed_at, change_type, previous_scope, new_scope, previous_status, new_status, reason')
          .eq('patient_id', patientId)
          .order('changed_at', { ascending: false })
          .limit(50),
        admin
          .from('access_requests')
          .select('id, requested_by, requested_role, purpose, requested_scope, justification, created_at')
          .eq('patient_id', patientId)
          .eq('status', 'Pending'),
      ])

      const ids = new Set<string>()
      connections.data?.forEach((c) => ids.add(String(c.person_id)))
      history.data?.forEach((e) => ids.add(String(e.person_id)))
      pending.data?.forEach((r) => ids.add(String(r.requested_by)))
      const people = await peopleById([...ids])

      return {
        connections: connections.data ?? [],
        disclosures: disclosures.data ?? [],
        consent_history: history.data ?? [],
        pending_access_requests: pending.data ?? [],
        people,
      }
    }

    case 'timeline': {
      if (!patientId) return null
      const { data } = await admin
        .from('timeline_events')
        .select('id, occurred_on, recorded_on, title, summary, category, source_id, evidence_status')
        .eq('patient_id', patientId)
        .order('recorded_on', { ascending: false })
        .limit(100)
      const people = await peopleById([...new Set((data ?? []).map((e) => String(e.source_id)).filter(Boolean))])
      return { events: data ?? [], people }
    }

    case 'requests': {
      if (!patientId) return null
      const [requests, clarifications] = await Promise.all([
        admin.from('requests').select('*').eq('patient_id', patientId).order('raised_on', { ascending: false }),
        admin
          .from('request_clarifications')
          .select('id, request_id, asked_on, asked_by_label, question, answered_on, answer, withheld')
          .order('asked_on', { ascending: true }),
      ])
      const ids = new Set((requests.data ?? []).map((r) => String(r.id)))
      return {
        requests: requests.data ?? [],
        clarifications: (clarifications.data ?? []).filter((c) => ids.has(String(c.request_id))),
      }
    }

    case 'profile': {
      if (!patientId) return null
      const { data } = await admin
        .from('profile_items')
        .select('id, section, text, source_id, source_label, recorded_on, evidence_status')
        .eq('patient_id', patientId)
      return { profile: data ?? [] }
    }

    case 'strategies': {
      if (!patientId) return null
      const [strategies, checkins] = await Promise.all([
        admin.from('strategies').select('*').eq('patient_id', patientId),
        admin.from('strategy_checkins').select('*').order('recorded_on', { ascending: true }),
      ])
      const ids = new Set((strategies.data ?? []).map((s) => String(s.id)))
      return {
        strategies: strategies.data ?? [],
        checkins: (checkins.data ?? []).filter((c) => ids.has(String(c.strategy_id))),
      }
    }

    case 'audit': {
      const query = admin
        .from('audit_log')
        .select('id, occurred_at, actor_label, actor_role, action, record, access_type, why, result, workflow_run_id')
        .order('occurred_at', { ascending: false })
        .limit(100)
      const { data } = patientId ? await query.eq('patient_id', patientId) : await query
      return { audit: data ?? [] }
    }

    case 'approvals': {
      const query = admin
        .from('hitl_requests')
        .select('request_id, workflow_run_id, patient_id, title, description, options, status, created_at, decided_at')
        .order('created_at', { ascending: false })
        .limit(25)
      const { data } = patientId ? await query.eq('patient_id', patientId) : await query
      return { approvals: data ?? [] }
    }

    case 'workflow_runs': {
      const query = admin
        .from('workflow_runs')
        .select('id, patient_id, type, stakeholder, current_step, status, waiting_for, steps, started_at, updated_at')
        .order('started_at', { ascending: false })
        .limit(25)
      const { data } = patientId ? await query.eq('patient_id', patientId) : await query
      return { runs: data ?? [] }
    }
  }
}

/** Names resolved server-side so no response ever carries a bare identifier. */
async function peopleById(ids: string[]): Promise<Record<string, { name: string; role: string; organisation: string | null }>> {
  const unique = ids.filter(Boolean)
  if (!unique.length) return {}
  const { data } = await admin.from('app_users').select('id, name, role, organisation').in('id', unique)
  return Object.fromEntries(
    (data ?? []).map((u) => [
      String(u.id),
      { name: String(u.name), role: String(u.role), organisation: u.organisation ? String(u.organisation) : null },
    ]),
  )
}
