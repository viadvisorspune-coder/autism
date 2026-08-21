/**
 * Fills the record with the live database before the interface renders.
 *
 * Every screen imports its data from `db.ts` as module-level arrays. Rather
 * than rewriting twenty-four screens to fetch their own data — twenty-four
 * loading states, twenty-four ways to fail — this replaces the contents of
 * those arrays in place, once, before the first render. A screen never learns
 * where its data came from, which is the point: the shape is identical either
 * way, and the mapping lives here rather than being repeated per screen.
 *
 * If the backend does not answer, nothing is replaced and the prototype's own
 * record stays. The interface then says so, on every screen, rather than
 * showing an empty page and letting someone assume their record is empty.
 */
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import * as db from './db'
import type {
  Appointment,
  AuditEntry,
  Connection,
  Disclosure,
  DocumentRecord,
  MemoryCandidate,
  NotificationItem,
  Patient,
  Person,
  ProfileItem,
  RequestRecord,
  ReviewItem,
  Role,
  SessionNote,
  Strategy,
  StrategyCheckIn,
  TaskItem,
  TimelineEvent,
  WorkflowRun,
  WorkflowStep,
} from './types'

type Row = Record<string, any>

export interface Bundle {
  app_users: Row[]
  patients: Row[]
  connections: Row[]
  timeline_events: Row[]
  profile_items: Row[]
  strategies: Row[]
  strategy_checkins: Row[]
  appointments: Row[]
  documents: Row[]
  disclosures: Row[]
  requests: Row[]
  request_clarifications: Row[]
  memory_candidates: Row[]
  review_items: Row[]
  notifications: Row[]
  workflow_runs: Row[]
  audit_log: Row[]
  session_notes: Row[]
  tasks: Row[]
  consent_events: Row[]
  access_requests: Row[]
  hitl_requests: Row[]
}

export type RecordSourceState = 'live' | 'mock'

/** Read once at boot; screens show it through the banner. */
export let recordSource: RecordSourceState = 'mock'
export let recordNote: string | null = 'No backend configured for this build.'

/** Extras the prototype never had a place for, kept beside the record. */
export let consentEvents: Row[] = []
export let accessRequests: Row[] = []
export let pendingApprovals: Row[] = []
export let clarificationThreads: Row[] = []

/**
 * Replaces an array's contents without replacing the array. Screens and the
 * helper functions in db.ts hold references to these arrays; assigning a new
 * one would leave every one of them pointing at the old data.
 */
function fill<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next)
}

const roles = (v: unknown, fallback: Role[]): Role[] =>
  Array.isArray(v) && v.length ? (v as Role[]) : fallback

const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')

export async function hydrate(timeoutMs = 4000): Promise<RecordSourceState> {
  if (!isSupabaseConfigured) return 'mock'

  try {
    // A slow backend must not hold the interface hostage. Past the timeout the
    // prototype record renders, and the banner says why.
    const bundle = await Promise.race([
      supabase.functions
        .invoke('app-read', { body: { resource: 'bundle', role: 'patient', patient_id: null } })
        .then(({ data, error }) => {
          if (error) throw error
          if (!data?.permitted) throw new Error(String(data?.reason ?? 'not permitted'))
          return data.data as Bundle
        }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs),
      ),
    ])

    if (!bundle?.patients?.length) throw new Error('empty record')

    apply(bundle)
    recordSource = 'live'
    recordNote = null
    return 'live'
  } catch (error) {
    recordSource = 'mock'
    recordNote =
      error instanceof Error && error.message === 'timeout'
        ? 'The record did not answer in time.'
        : 'The live record could not be reached.'
    return 'mock'
  }
}

/* ------------------------------------------------------------------ mapping */

function apply(b: Bundle) {
  fill<Person>(
    db.people,
    b.app_users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as Role,
      title: u.title ?? undefined,
      organisation: u.organisation ?? undefined,
      pronouns: u.pronouns ?? undefined,
    })),
  )

  fill<Patient>(
    db.patients,
    b.patients.map((p) => ({
      id: p.id,
      name: p.name,
      pronouns: p.pronouns ?? '',
      age: Number(p.age ?? 0),
      context: p.context ?? '',
      nextAppointmentId: p.next_appointment_id ?? undefined,
    })),
  )

  fill<TimelineEvent>(
    db.timeline,
    b.timeline_events.map((e) => ({
      id: e.id,
      patientId: e.patient_id,
      date: day(e.recorded_on),
      occurredOn: e.occurred_on ? day(e.occurred_on) : undefined,
      title: e.title,
      category: e.category,
      sourceId: e.source_id ?? '',
      status: e.status ?? 'Recorded',
      evidence: e.evidence_status,
      summary: e.summary ?? '',
      context: e.context ?? undefined,
      relatedIds: e.related_ids ?? undefined,
      visibleTo: roles(e.visible_to, ['patient']),
    })),
  )

  fill<ProfileItem>(
    db.profileItems,
    b.profile_items.map((p) => ({
      id: p.id,
      section: p.section,
      text: p.text,
      sourceId: p.source_id ?? p.source_label ?? 'ORCA',
      date: day(p.recorded_on),
      evidence: p.evidence_status,
      visibleTo: roles(p.visible_to, ['patient']),
      outdated: p.outdated ?? undefined,
    })),
  )

  // Check-ins live in their own table; the screens expect them nested.
  const checkInsByStrategy = new Map<string, StrategyCheckIn[]>()
  b.strategy_checkins.forEach((c) => {
    const list = checkInsByStrategy.get(c.strategy_id) ?? []
    list.push({
      date: day(c.recorded_on),
      note: c.note,
      helpfulness: c.helpfulness,
      reportedBy: c.reported_by ?? '',
    })
    checkInsByStrategy.set(c.strategy_id, list)
  })

  fill<Strategy>(
    db.strategies,
    b.strategies.map((s) => ({
      id: s.id,
      patientId: s.patient_id,
      title: s.title,
      goal: s.goal,
      rationale: s.rationale ?? '',
      evidenceIds: s.evidence_ids ?? [],
      status: s.status,
      phase: s.phase,
      start: day(s.starts_on),
      durationWeeks: Number(s.duration_weeks ?? 0),
      conditions: s.conditions ?? '',
      successCriteria: s.success_criteria ?? '',
      reviewDate: day(s.review_date),
      ownerId: s.owner_id ?? '',
      checkIns: checkInsByStrategy.get(s.id) ?? [],
      outcome: s.outcome ?? undefined,
      environment: s.environment ?? undefined,
    })),
  )

  fill<Appointment>(
    db.appointments,
    b.appointments.map((a) => ({
      id: a.id,
      patientId: a.patient_id,
      professionalId: a.professional_id ?? '',
      datetime: a.scheduled_for,
      purpose: a.purpose ?? '',
      location: a.location ?? '',
      status: a.status,
      preparationStatus: a.preparation_status,
      previousBriefId: a.previous_brief_id ?? undefined,
      questions: a.questions ?? [],
    })),
  )

  fill<DocumentRecord>(
    db.documents,
    b.documents.map((d) => ({
      id: d.id,
      patientId: d.patient_id,
      title: d.title,
      fileType: d.file_type,
      category: d.category,
      sourceId: d.source_id ?? '',
      date: day(d.recorded_on),
      status: d.status,
      extracted: d.extracted ?? [],
      relatedEventIds: d.related_event_ids ?? [],
      access: roles(d.access, ['patient']),
      sharingHistory: d.sharing_history ?? [],
    })),
  )

  fill<Connection>(
    db.connections,
    b.connections.map((c) => ({
      id: c.id,
      patientId: c.patient_id,
      personId: c.person_id,
      relationship: c.relationship,
      purpose: c.purpose,
      accessScope: c.access_scope ?? [],
      consentGiven: day(c.consent_given),
      consentStatus: c.consent_status,
      reviewDue: day(c.review_due),
      lastInteraction: day(c.last_interaction),
    })),
  )

  fill<Disclosure>(
    db.disclosures,
    b.disclosures.map((d) => ({
      id: d.id,
      patientId: d.patient_id,
      date: day(d.disclosed_on),
      recipient: d.recipient,
      purpose: d.purpose ?? '',
      contentScope: d.content_scope ?? [],
      approvedBy: d.approved_by ?? '',
      itemsShared: d.items_shared ?? [],
    })),
  )

  // Clarifications moved to their own table, which is what let an answer be
  // recorded at all. The screens still expect them nested on the request.
  const clarificationsByRequest = new Map<string, RequestRecord['clarifications']>()
  b.request_clarifications.forEach((c) => {
    const list = clarificationsByRequest.get(c.request_id) ?? []
    list.push({
      date: day(c.asked_on),
      from: c.asked_by_label ?? '',
      question: c.question,
      answer: c.answer ?? undefined,
    })
    clarificationsByRequest.set(c.request_id, list)
  })
  clarificationThreads = b.request_clarifications

  fill<RequestRecord>(
    db.requests,
    b.requests.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      type: r.type,
      title: r.title,
      destination: r.destination ?? '',
      destinationRole: r.destination_role as Role,
      raised: day(r.raised_on),
      status: r.status,
      currentOwner: r.current_owner ?? '',
      steps: (r.steps ?? []) as WorkflowStep[],
      functionalRequirement: r.functional_requirement ?? '',
      requestedAdjustment: r.requested_adjustment ?? '',
      authorisedInformation: r.authorised_information ?? [],
      withheld: r.withheld ?? [],
      implementation: r.implementation ?? '',
      reviewDate: r.review_date ? day(r.review_date) : undefined,
      clarifications: clarificationsByRequest.get(r.id) ?? (r.clarifications ?? []),
    })),
  )

  fill<MemoryCandidate>(
    db.memoryCandidates,
    b.memory_candidates.map((m) => ({
      id: m.id,
      patientId: m.patient_id,
      proposal: m.proposal,
      confidence: Number(m.confidence ?? 0),
      evidence: m.evidence ?? [],
      relatedHistory: m.related_history ?? '',
      raisedFor: roles(m.raised_for, ['patient']),
      status: m.status,
    })),
  )

  fill<ReviewItem>(
    db.reviewItems,
    b.review_items.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      title: r.title,
      reason: r.reason,
      understanding: r.understanding ?? '',
      evidence: r.evidence ?? [],
      uncertainty: r.uncertainty ?? '',
      proposedAction: r.proposed_action ?? '',
      decisionRequired: r.decision_required ?? '',
      assignedTo: roles(r.assigned_to, ['patient']),
      status: r.status,
      raised: day(r.raised_on),
    })),
  )

  fill<NotificationItem>(
    db.notifications,
    b.notifications.map((n) => ({
      id: n.id,
      category: n.category,
      what: n.what,
      why: n.why ?? '',
      todo: n.todo ?? '',
      date: day(n.created_at),
      forRoles: roles(n.for_roles, ['patient']),
      href: n.href ?? '/patient',
      unread: n.unread ?? true,
    })),
  )

  fill<WorkflowRun>(
    db.workflowRuns,
    b.workflow_runs.map((w) => ({
      id: w.id,
      type: w.type,
      patientId: w.patient_id ?? '',
      stakeholder: w.stakeholder ?? '',
      currentStep: w.current_step,
      status: w.status,
      waitingFor: w.waiting_for ?? '',
      started: day(w.started_at),
      updated: day(w.updated_at),
      steps: (w.steps ?? []) as WorkflowStep[],
    })),
  )

  fill<AuditEntry>(
    db.auditLog,
    b.audit_log.map((a) => ({
      id: a.id,
      when: a.occurred_at,
      who: a.actor_label,
      role: (a.actor_role ?? 'patient') as Role,
      action: a.action,
      record: a.record,
      workflow: a.workflow_run_id ?? undefined,
      accessType: a.access_type,
      why: a.why ?? '',
      result: a.result,
    })),
  )

  fill<SessionNote>(
    db.sessionNotes,
    b.session_notes.map((n) => ({
      id: n.id,
      patientId: n.patient_id,
      professionalId: n.professional_id ?? '',
      date: day(n.held_on),
      status: n.status,
      observations: n.observations ?? '',
      patientReport: n.patient_report ?? '',
      goals: n.goals ?? [],
      actions: n.actions ?? [],
    })),
  )

  fill<TaskItem>(
    db.tasks,
    b.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail ?? '',
      patientId: t.patient_id ?? '',
      due: day(t.due_on),
      forRoles: roles(t.for_roles, ['psychologist']),
      status: t.status,
    })),
  )

  consentEvents = b.consent_events ?? []
  accessRequests = b.access_requests ?? []
  pendingApprovals = (b.hitl_requests ?? []).filter((h) => h.status === 'Awaiting approval')
}
