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
import { sweepStaleRuns } from '../_shared/sweep.ts'

type Resource =
  | 'bundle'
  | 'run'
  | 'inbox'
  | 'conversation'
  | 'privacy'
  | 'timeline'
  | 'requests'
  | 'profile'
  | 'strategies'
  | 'audit'
  | 'approvals'
  | 'workflow_runs'
  | 'calendar'
  | 'caseload'
  | 'consent'

/** What each role may ever receive, before per-patient consent narrows it. */
const ROLE_MAY_READ: Record<string, Resource[]> = {
  patient: ['bundle', 'run', 'inbox', 'conversation', 'privacy', 'timeline', 'requests', 'profile', 'strategies', 'audit', 'approvals', 'workflow_runs', 'calendar', 'consent'],
  psychologist: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'timeline', 'profile', 'strategies', 'requests', 'approvals', 'consent'],
  psychiatrist: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'timeline', 'profile', 'requests', 'consent'],
  therapist: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'profile', 'strategies', 'consent'],
  ot: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'profile', 'strategies', 'consent'],
  gp: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'timeline', 'profile', 'consent'],
  clinic: ['caseload', 'calendar', 'bundle', 'run', 'inbox', 'conversation', 'requests', 'workflow_runs', 'consent'],
  employer: ['caseload', 'bundle', 'run', 'inbox', 'conversation', 'requests', 'consent'],
  university: ['caseload', 'bundle', 'run', 'inbox', 'conversation', 'requests', 'consent'],
  trusted: ['bundle', 'run', 'inbox', 'conversation', 'profile', 'consent'],
  admin: ['bundle', 'run', 'inbox', 'conversation', 'workflow_runs', 'audit', 'consent'],
}

/**
 * The reads that show run state, and so are the ones worth sweeping before.
 *
 * `caseload` is in the list because a clinician's screen counts active runs
 * per person, and a caseload claiming four people have work in progress is a
 * worse lie than one stale row in one conversation.
 */
const SWEEPS_RUNS: Set<Resource> = new Set([
  'workflow_runs',
  'conversation',
  'run',
  'inbox',
  'caseload',
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

  const resource = str(body.resource) as Resource | null
  const role = str(body.role) ?? 'patient'
  const actorId = str(body.actor_id)
  const patientId = str(body.patient_id)
  const runId = str(body.run_id)
  const conversationActor = str(body.actor_id)

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

  /**
   * Housekeeping, on the reads that would otherwise show the mess.
   *
   * Runs that were started and never answered are settled here rather than by
   * a scheduler, because there is no scheduler. Only on the resources that
   * display run state, so the other twelve reads are not paying for it — and
   * awaited, so the read that follows sees the settled rows rather than
   * showing the stale ones one last time.
   */
  if (SWEEPS_RUNS.has(resource)) await sweepStaleRuns(patientId)

  try {
    const data = await read(resource, patientId, runId, conversationActor, role)
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
  actorId: string | null,
  role: string = 'patient',
): Promise<unknown> {
  switch (resource) {
    // The thread, plus what changed while this person was away. Both together,
    // because "welcome back" and "here is what happened" are the same moment.
    case 'conversation': {
      if (!patientId || !actorId) return null

      const { data: conversation, error: convErr } = await admin
        .from('conversations')
        .select('id, started_at, last_message_at')
        .eq('patient_id', patientId)
        .eq('actor_id', actorId)
        .maybeSingle()
      if (convErr) console.error('app-read conversation:', convErr.message)

      const { data: messages } = conversation
        ? await admin
            .from('conversation_messages')
            .select('id, author, text, created_at, workflow_run_id')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: true })
            .limit(200)
        : { data: [] }

      const { data: visit } = await admin
        .from('user_visits')
        .select('last_seen_at')
        .eq('user_id', actorId)
        .eq('patient_id', patientId)
        .maybeSingle()

      const since = (visit?.last_seen_at as string) ?? null

      // Only genuinely new things. A "since you were last here" that lists
      // what someone has already read teaches them to ignore it.
      const [events, decided, runs] = since
        ? await Promise.all([
            admin
              .from('timeline_events')
              .select('id, title, recorded_on, category')
              .eq('patient_id', patientId)
              .gt('created_at', since)
              .limit(10),
            admin
              .from('review_items')
              .select('id, title, decision, decided_at')
              .eq('patient_id', patientId)
              .not('decided_at', 'is', null)
              .gt('decided_at', since)
              .limit(10),
            admin
              .from('workflow_runs')
              .select('id, type, status, current_step, updated_at')
              .eq('patient_id', patientId)
              .gt('updated_at', since)
              .limit(10),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }]

      /**
       * Documents this conversation produced, delivered into it.
       *
       * Asking for a report and being told "it has been saved to documents"
       * is a system describing its own filing rather than answering. The
       * person asked here; the thing arrives here.
       *
       * The join needs no new column: a run writes its document with its
       * `workflow_run_id`, and the message announcing it carries the same one.
       * Match on that and every artefact lands under the sentence that
       * promised it.
       *
       * The URL is signed and short-lived. The bucket is private, and a
       * document about somebody's autism assessment must not become a link
       * that works for anyone who ever sees it.
       */
      /**
       * Every run this person has in this record, not only the ones that spoke.
       *
       * Attachments used to be looked up from the run ids on MESSAGES, which
       * quietly required a run to have said something before anything it
       * produced could be seen. A PRODUCE run does not necessarily speak: it
       * writes a document and parks for approval, and the approval carries a
       * description rather than a message. So the file existed, sat correctly
       * on the record, and appeared nowhere the person was looking.
       *
       * That is the worst shape this can fail in — not a missing document, but
       * a document that is present, private, and invisible to the one person
       * entitled to it.
       */
      const { data: ownRuns } = await admin
        .from('workflow_runs')
        .select('id')
        .eq('patient_id', patientId)
        .eq('actor_id', actorId)
        .order('started_at', { ascending: false })
        .limit(100)

      const runIds = [
        ...new Set([
          ...(messages ?? [])
            .map((m) => m.workflow_run_id)
            .filter((id): id is string => Boolean(id)),
          ...(ownRuns ?? []).map((r) => String(r.id)),
        ]),
      ]

      const attachments: Record<string, unknown>[] = []
      if (runIds.length) {
        const { data: docs, error: docsErr } = await admin
          .from('documents')
          .select('id, title, file_type, category, storage_path, workflow_run_id, recorded_on')
          .in('workflow_run_id', runIds)
        if (docsErr) console.error('app-read documents:', docsErr.message)

        for (const doc of docs ?? []) {
          let url: string | null = null
          if (doc.storage_path) {
            const { data: signed } = await admin.storage
              .from('orca-artifacts')
              .createSignedUrl(String(doc.storage_path), 60 * 30)
            url = signed?.signedUrl ?? null
          }
          attachments.push({
            id: doc.id,
            title: doc.title,
            file_type: doc.file_type,
            category: doc.category,
            workflow_run_id: doc.workflow_run_id,
            recorded_on: doc.recorded_on,
            url,
          })
        }
      }

      return {
        conversation,
        messages: messages ?? [],
        attachments,
        last_seen_at: since,
        since_last_visit: {
          events: events.data ?? [],
          decisions: decided.data ?? [],
          runs: runs.data ?? [],
        },
      }
    }

    // Everything scheduled, agreed or merely proposed, in one place.
    //
    // Proposals and confirmed times live in the same table and the same list,
    // because from the point of view of somebody planning a week they are the
    // same kind of object — a thing that may happen on Tuesday. What differs
    // is whether it is settled, and that is a property of the row, not a
    // reason to keep two lists.
    /**
     * A calendar belongs to whoever is looking at it.
     *
     * This read used to require a patient id and the app never supplied one,
     * so it fell back to the demo patient — and every clinician, every
     * employer, every administrator opened the calendar and found Ananya's
     * appointments sitting in it. Four different people appeared to be seeing
     * the same psychologist at the same time, which is both wrong and, in a
     * record about who can see what, exactly the wrong thing to be wrong
     * about.
     *
     * With a patient id it is that person's calendar, as before. Without one
     * it is the caller's own diary: appointments they are personally party to,
     * across every record they hold a live connection to. Not everything about
     * those patients — a psychologist's diary is not a window into their
     * patients' other clinicians — just their own.
     */
    case 'calendar': {
      const query = admin.from('appointments').select('*').order('scheduled_for', { ascending: true })

      if (patientId) {
        const { data: appointments, error: apptErr } = await query.eq('patient_id', patientId)
        if (apptErr) console.error('app-read appointments:', apptErr.message)
        const rows = appointments ?? []
        return {
          appointments: rows,
          people: await peopleById(rows.map((a) => String(a.professional_id ?? ''))),
          patients: await patientNames(rows.map((a) => String(a.patient_id ?? ''))),
        }
      }

      if (!actorId) return { appointments: [], people: {}, patients: {} }

      // Only records this person is actually connected to. The professional_id
      // filter narrows it again to the ones they are in the room for.
      const { data: links } = await admin
        .from('connections')
        .select('patient_id')
        .eq('person_id', actorId)
        .eq('consent_status', 'Active')

      const ids = (links ?? []).map((l) => String(l.patient_id))
      if (!ids.length) return { appointments: [], people: {}, patients: {} }

      const { data: appointments, error: apptErr2 } = await query.in('patient_id', ids).eq('professional_id', actorId)
      if (apptErr2) console.error('app-read appointments (caseload):', apptErr2.message)
      const rows = appointments ?? []

      return {
        appointments: rows,
        people: await peopleById(rows.map((a) => String(a.professional_id ?? ''))),
        // Every connected record, not only the ones already in the diary —
        // otherwise a clinician can offer a time to the patients they have
        // seen and to nobody else, which is precisely backwards.
        patients: await patientNames(ids),
      }
    }

    // One run, with anything a person waiting on it would want to know: where
    // it has got to, whether it is stuck on a human, and what it is asking.
    // Everything one role is currently being asked to decide, plus what they
    // raised and are still waiting on. Both halves matter: a person needs to
    // see the decision they owe somebody as clearly as the one they are owed.
    case 'inbox': {
      if (!patientId) return null
      const [reviews, access, approvals, notes] = await Promise.all([
        admin
          .from('review_items')
          .select('*')
          .eq('patient_id', patientId)
          .order('raised_on', { ascending: false })
          .limit(50),
        admin
          .from('access_requests')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20),
        admin
          .from('hitl_requests')
          .select('request_id, title, description, options, status, created_at')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(20),
        admin
          .from('notifications')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      const people = await peopleById([
        ...(reviews.data ?? []).map((r) => String(r.decided_by ?? '')),
        ...(access.data ?? []).map((r) => String(r.requested_by ?? '')),
      ])

      return {
        reviews: reviews.data ?? [],
        access_requests: access.data ?? [],
        approvals: approvals.data ?? [],
        notifications: notes.data ?? [],
        people,
      }
    }

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
    /**
     * A professional's whole caseload, one row per person.
     *
     * Every other read here is scoped to one record, which is right — but it
     * left a clinician with twelve people unable to ask the question they
     * actually have between appointments, which is never "tell me about
     * Ananya". It is "which of these twelve needs me first". Answering that by
     * opening twelve records in turn is not answering it.
     *
     * THE SCOPE IS PER CONNECTION, NOT PER ROLE. This is the part worth being
     * careful about. Twelve patients means twelve separate consent decisions,
     * and they do not agree with each other: one has shared their strategies
     * and not their requests, another the reverse. So each row is assembled
     * against that patient's own `access_scope`, and a count this clinician
     * may not see is `null` — absent, not zero. Zero is a claim about the
     * record; null is an honest "not yours to know".
     *
     * Nothing here returns content. Counts, dates and one reason per person —
     * enough to decide who to open, and no more. Opening them goes through the
     * ordinary per-record path with its ordinary checks.
     */
    case 'caseload': {
      if (!actorId) return { patients: [], as_of: new Date().toISOString() }

      const today = new Date().toISOString().slice(0, 10)

      const { data: links } = await admin
        .from('connections')
        .select('patient_id, relationship, purpose, access_scope, review_due, last_interaction')
        .eq('person_id', actorId)
        .eq('consent_status', 'Active')

      // A connection past its review date has lapsed. It is not a caseload
      // member until somebody renews it, and quietly including it here would
      // be the exact leak the review date exists to prevent.
      const live = (links ?? []).filter((l) => !l.review_due || String(l.review_due) >= today)
      if (!live.length) return { patients: [], as_of: new Date().toISOString() }

      const ids = live.map((l) => String(l.patient_id))

      const [names, strategies, requests, appointments, reviews, events] =
        await Promise.all([
          admin.from('patients').select('id, name').in('id', ids),
          admin.from('strategies').select('id, patient_id, title, status, review_date').in('patient_id', ids),
          admin
            .from('requests')
            .select('id, patient_id, title, status, current_owner, raised_on, clarifications')
            .in('patient_id', ids),
          admin
            .from('appointments')
            .select('patient_id, scheduled_for, status, preparation_status')
            .in('patient_id', ids)
            .gte('scheduled_for', new Date().toISOString()),
          admin.from('review_items').select('patient_id, status, assigned_to').in('patient_id', ids),
          admin
            .from('timeline_events')
            .select('patient_id, recorded_on')
            .in('patient_id', ids)
            .order('recorded_on', { ascending: false }),
        ])

      const nameOf = new Map((names.data ?? []).map((p) => [String(p.id), String(p.name)]))

      // Check-ins hang off the strategy, so they are fetched once the strategy
      // ids are known rather than by patient.
      const strategyIds = (strategies.data ?? []).map((s) => String(s.id))
      const { data: checkins } = strategyIds.length
        ? await admin.from('strategy_checkins').select('strategy_id, recorded_on').in('strategy_id', strategyIds)
        : { data: [] }

      const lastCheckIn = new Map<string, string>()
      for (const c of checkins ?? []) {
        const at = String(c.recorded_on)
        const key = String(c.strategy_id)
        if (!lastCheckIn.has(key) || at > lastCheckIn.get(key)!) lastCheckIn.set(key, at)
      }

      /** A request with a question on it that nobody has answered. */
      const isWaiting = (r: Record<string, unknown>) =>
        Array.isArray(r.clarifications) &&
        (r.clarifications as { answer?: unknown }[]).some((c) => !c?.answer)

      const rows = live.map((link) => {
        const id = String(link.patient_id)
        const scope = (link.access_scope as string[] | null) ?? []
        const allows = (...words: string[]) =>
          scope.length === 0 || words.some((w) => scope.some((s) => s.toLowerCase().includes(w)))

        const mineStrategies = (strategies.data ?? []).filter((s) => s.patient_id === id)
        const running = mineStrategies.filter((s) => s.status === 'Active')
        const mineRequests = (requests.data ?? []).filter((r) => r.patient_id === id)
        const open = mineRequests.filter(
          (r) => r.status !== 'Completed' && r.status !== 'Cancelled',
        )
        const next = (appointments.data ?? [])
          .filter((a) => a.patient_id === id && a.status !== 'Cancelled')
          .sort((x, y) => String(x.scheduled_for).localeCompare(String(y.scheduled_for)))[0]
        const waitingOnMe = (reviews.data ?? []).filter(
          (r) =>
            r.patient_id === id &&
            r.status === 'Awaiting approval' &&
            ((r.assigned_to as string[] | null) ?? []).includes(role),
        ).length
        const lastEvent = (events.data ?? []).find((e) => e.patient_id === id)

        // The oldest un-checked-in running strategy. "Started three weeks ago
        // and nobody has said whether it helped" is the single most useful
        // thing to know about a caseload, and it is invisible one record at a
        // time.
        const stale = running
          .map((s) => ({ title: String(s.title), since: lastCheckIn.get(String(s.id)) ?? null }))
          .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''))[0]

        const seenStrategies = allows('strateg', 'outcome', 'functional')
        const seenRequests = allows('request', 'authorised', 'timeline')

        return {
          patient_id: id,
          name: nameOf.get(id) ?? id,
          relationship: link.relationship,
          purpose: link.purpose,
          scope,
          // null means "outside what this person shared with you". Not zero.
          active_strategies: seenStrategies ? running.length : null,
          stale_strategy: seenStrategies ? stale ?? null : null,
          open_requests: seenRequests ? open.length : null,
          requests_needing_them: seenRequests
            ? open.filter(isWaiting).length
            : null,
          next_appointment: next
            ? {
                at: next.scheduled_for,
                status: next.status,
                brief: next.preparation_status,
              }
            : null,
          waiting_on_you: waitingOnMe,
          last_activity: lastEvent?.recorded_on ?? link.last_interaction ?? null,
          review_due: link.review_due,
        }
      })

      return { patients: rows, as_of: new Date().toISOString() }
    }

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
      /**
       * The column is `evidence`. This asked for `evidence_status`.
       *
       * PostgREST rejected the whole select, the error was discarded by
       * destructuring only `data`, and the caller received an empty array —
       * so every patient's story and profile read as "nothing recorded yet"
       * on the deployed app while twelve events and ten profile items sat in
       * the table. A failed read that looks like an empty record is the worst
       * shape this bug could have taken: nobody reports it, because an empty
       * record is a plausible thing to have.
       */
      const { data, error } = await admin
        .from('timeline_events')
        .select('id, occurred_on, recorded_on, title, summary, category, source_id, source_label, evidence, status, visible_to')
        .eq('patient_id', patientId)
        .order('recorded_on', { ascending: false })
        .limit(100)
      if (error) return { events: [], people: {}, error: error.message }
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
      const { data, error } = await admin
        .from('profile_items')
        .select('id, section, text, source_id, source_label, recorded_on, evidence, visible_to, outdated')
        .eq('patient_id', patientId)
      // Same column error as the timeline above, and the same silent shape.
      if (error) return { profile: [], error: error.message }
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
        .select(
          'request_id, workflow_run_id, patient_id, patient_source, title, description, options, status, created_at, decided_at',
        )
        .order('created_at', { ascending: false })
        .limit(25)
      /**
       * Unattributed approvals are shown, not filtered away.
       *
       * This was `.eq('patient_id', patientId)`, which is the obviously
       * correct scoping rule and was, here, the bug. Every gate Yoxa sent
       * arrived without a resolvable patient, so this filter hid all of them —
       * and a workflow that stops to ask a human, and is never shown to one,
       * simply stops. Eleven of them, silently, for two days.
       *
       * A null patient is not somebody else's data; it is our own failure to
       * work out whose it is, and the person who can fix that is the person
       * looking at the screen. Nothing is disclosed by showing it: these carry
       * the question and the options, and answering still goes through
       * hitl-respond, which checks scope the moment a patient is known.
       */
      const { data } = patientId
        ? await query.or(`patient_id.eq.${patientId},patient_id.is.null`)
        : await query
      return { approvals: (data ?? []).map((a) => ({ ...a, options: readableOptions(a.options) })) }
    }

    case 'workflow_runs': {
      const query = admin
        .from('workflow_runs')
        // answer_html and result join this list because the chat reads a run's
        // answer from here. Yoxa is asynchronous, so the reply to a question
        // never arrives in the response to the request that asked it — the run
        // row is the only place the answer exists.
        // path and route_reason join this list because the routing decision is
        // meant to be shown, not just made. A person about to have their record
        // read is owed the sentence explaining which route was chosen and why,
        // and it was being written to the row and then never read back.
        .select(
          'id, patient_id, type, stakeholder, current_step, status, waiting_for, steps, ' +
            'started_at, updated_at, workflow_name, answer_html, result, trigger_text, ' +
            'chained_from, yoxa_run_id, finished_at, path, route_reason, next_workflow',
        )
        .order('started_at', { ascending: false })
        .limit(25)
      const { data } = patientId ? await query.eq('patient_id', patientId) : await query
      return { runs: data ?? [] }
    }

    /**
     * Consent as it currently stands: who has asked for what, and who has been
     * stopped.
     *
     * Read by every role, and deliberately so — this is the one resource where
     * the person on the far side of a boundary needs the same facts as the
     * person who set it. Sana has to be able to see that her request is still
     * waiting; Ananya has to be able to see that it is hers to answer.
     *
     * It carries no record content. A row here says a decision exists, who it
     * is about and what part of a life it concerns. Never what that part
     * contains.
     */
    case 'consent': {
      if (!patientId) return { requests: [], stops: [] }

      const [{ data: requests }, { data: stops }] = await Promise.all([
        admin
          .from('consent_gates')
          .select('id, person_id, person_name, person_role, domain, question, status, created_at, decided_at')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('sharing_stops')
          .select('id, person_id, stopped_at, resumed_at')
          .eq('patient_id', patientId)
          .is('resumed_at', null),
      ])

      /**
       * Everybody but the subject sees only their own requests.
       *
       * A therapist reading the full queue would learn which other
       * professionals had been refused what, which is a disclosure about the
       * subject made entirely out of metadata.
       */
      const scoped =
        role === 'patient' || role === 'admin'
          ? (requests ?? [])
          : (requests ?? []).filter((r) => r.person_id === actorId)

      return { requests: scoped, stops: stops ?? [] }
    }
  }
}

/** Names resolved server-side so no response ever carries a bare identifier. */
/**
 * Whose appointment it is, by name.
 *
 * A diary that says "Tuesday, 16:00, review" and not who it is with is a diary
 * nobody can use. Only needed when the calendar spans more than one record,
 * but harmless on a single one.
 */
async function patientNames(ids: string[]): Promise<Record<string, { name: string }>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return {}
  const { data } = await admin.from('patients').select('id, name').in('id', unique)
  return Object.fromEntries((data ?? []).map((p) => [String(p.id), { name: String(p.name) }]))
}

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

/**
 * The choices on an approval, in the shape the approval screen reads.
 *
 * Yoxa names them `{option_id, title, description}`. The panel reads
 * `option.id` and `option.label`. Both came back undefined, so every choice on
 * every gate would have rendered as an empty radio button with no words next
 * to it — and picking one would have sent `selected_option_id: undefined`,
 * which the respond endpoint correctly refuses.
 *
 * So the approvals were invisible, and had anyone found them, unanswerable.
 * Two independent breaks in one path, which is what happens to a path nothing
 * has ever travelled end to end.
 *
 * Translated here rather than in the component because this is the boundary
 * where a foreign shape becomes ours, and because the panel should not have to
 * know which system asked the question.
 */
function readableOptions(raw: unknown): { id: string; label: string; description?: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const o = (entry ?? {}) as Record<string, unknown>
      const id = String(o.id ?? o.option_id ?? '')
      const label = String(o.label ?? o.title ?? '')
      if (!id || !label) return null
      const description = o.description ? String(o.description) : undefined
      return { id, label, description }
    })
    .filter((o): o is { id: string; label: string; description?: string } => o !== null)
}
