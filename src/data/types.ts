/**
 * ORCA domain types.
 *
 * The frontend is role-specific, but every role reads from ONE longitudinal
 * patient model. These types describe that shared model plus the workflow and
 * governance objects the UI has to display (consent, evidence, audit).
 */

export type Role =
  | 'patient'
  | 'psychologist'
  | 'psychiatrist'
  | 'therapist'
  | 'ot'
  | 'gp'
  | 'clinic'
  | 'employer'
  | 'university'
  | 'trusted'
  | 'admin'

export type Experience = 'patient' | 'clinical' | 'organisation' | 'trusted' | 'admin'

/** Global status language — the same words everywhere, for every role. */
export type WorkflowStatus =
  | 'Draft'
  | 'Active'
  | 'Awaiting information'
  | 'Awaiting approval'
  | 'Awaiting professional review'
  | 'Awaiting stakeholder'
  | 'In progress'
  | 'Completed'
  | 'Requires adaptation'
  | 'Escalated'
  | 'Blocked'
  | 'Cancelled'

/** How well established a piece of information is. Never hidden from the user. */
export type EvidenceStatus =
  | 'Reported'
  | 'Professionally documented'
  | 'Validated'
  | 'AI interpretation'

export type EventCategory =
  | 'Personal'
  | 'Functional'
  | 'Clinical'
  | 'Support'
  | 'Work'
  | 'University'
  | 'Appointments'
  | 'Documents'
  | 'Stakeholder observations'

export interface Person {
  id: string
  name: string
  role: Role
  title?: string
  organisation?: string
  pronouns?: string
}

export interface Patient {
  id: string
  name: string
  pronouns: string
  age: number
  context: string
  nextAppointmentId?: string
}

export interface TimelineEvent {
  id: string
  patientId: string
  date: string
  occurredOn?: string
  title: string
  category: EventCategory
  sourceId: string
  status: WorkflowStatus | 'Recorded'
  evidence: EvidenceStatus
  summary: string
  context?: string
  relatedIds?: string[]
  visibleTo: Role[]
}

export interface ProfileItem {
  id: string
  section: 'About me' | 'What helps me' | "What doesn't help me" | 'Current goals' | 'Important context'
  text: string
  sourceId: string
  date: string
  evidence: EvidenceStatus
  visibleTo: Role[]
  outdated?: boolean
}

export interface StrategyCheckIn {
  date: string
  note: string
  helpfulness: 'Helped' | 'Partly helped' | 'Did not help'
  reportedBy: string
}

export interface Strategy {
  id: string
  patientId: string
  title: string
  goal: string
  rationale: string
  evidenceIds: string[]
  status: WorkflowStatus
  phase: 'Baseline' | 'Started' | 'Check-ins' | 'Outcome' | 'Adaptation'
  start: string
  durationWeeks: number
  conditions: string
  successCriteria: string
  reviewDate: string
  ownerId: string
  checkIns: StrategyCheckIn[]
  outcome?: {
    summary: string
    effectiveness: 'Helped' | 'Partly helped' | 'Did not help'
    patientFeedback: string
    professionalFeedback?: string
    comparison?: string
    proposedAdaptation?: string
  }
  environment?: string
}

export interface Appointment {
  id: string
  patientId: string
  professionalId: string
  datetime: string
  purpose: string
  location: string
  status: WorkflowStatus
  preparationStatus: 'Not started' | 'Draft ready' | 'Approved by patient' | 'Shared'
  previousBriefId?: string
  questions: string[]
}

export interface DocumentRecord {
  id: string
  patientId: string
  title: string
  fileType: 'PDF' | 'DOCX' | 'Image' | 'Structured'
  category: 'Clinical' | 'Therapy' | 'OT' | 'Employment' | 'University' | 'Statutory' | 'Personal'
  sourceId: string
  date: string
  status: 'Uploaded' | 'Analysing' | 'Extracting' | 'Awaiting review' | 'Saved'
  extracted: { label: string; value: string; accepted: boolean }[]
  relatedEventIds: string[]
  access: Role[]
  sharingHistory: { date: string; recipient: string; purpose: string }[]
}

export interface Connection {
  id: string
  patientId: string
  personId: string
  relationship: string
  purpose: string
  accessScope: string[]
  consentGiven: string
  consentStatus: 'Active' | 'Expired' | 'Revoked'
  reviewDue: string
  lastInteraction: string
}

export interface Disclosure {
  id: string
  patientId: string
  date: string
  recipient: string
  purpose: string
  contentScope: string[]
  approvedBy: string
  itemsShared: string[]
}

export interface WorkflowStep {
  label: string
  state: 'done' | 'current' | 'todo'
  detail?: string
  completedOn?: string
}

export interface RequestRecord {
  id: string
  patientId: string
  type: 'Accommodation' | 'Referral' | 'Report' | 'Clarification'
  title: string
  destination: string
  destinationRole: Role
  raised: string
  status: WorkflowStatus
  currentOwner: string
  steps: WorkflowStep[]
  functionalRequirement: string
  requestedAdjustment: string
  authorisedInformation: string[]
  withheld: string[]
  implementation: string
  reviewDate?: string
  clarifications: { date: string; from: string; question: string; answer?: string }[]
}

export interface MemoryCandidate {
  id: string
  patientId: string
  proposal: string
  confidence: number
  evidence: { source: string; detail: string; date: string }[]
  relatedHistory: string
  raisedFor: Role[]
  status: 'Pending' | 'Confirmed' | 'Edited' | 'Rejected'
}

export interface ReviewItem {
  id: string
  patientId: string
  title: string
  reason: string
  understanding: string
  evidence: string[]
  uncertainty: string
  proposedAction: string
  decisionRequired: string
  assignedTo: Role[]
  status: WorkflowStatus
  raised: string
}

export interface NotificationItem {
  id: string
  category:
    | 'Action required'
    | 'Approval required'
    | 'Professional response'
    | 'Accommodation response'
    | 'Follow-up'
    | 'Outcome required'
    | 'Document available'
    | 'Workflow completed'
    | 'Workflow blocked'
  what: string
  why: string
  todo: string
  date: string
  forRoles: Role[]
  href: string
  unread: boolean
}

export interface WorkflowRun {
  id: string
  type: string
  patientId: string
  stakeholder: string
  currentStep: string
  status: WorkflowStatus
  waitingFor: string
  started: string
  updated: string
  steps: WorkflowStep[]
}

export interface AuditEntry {
  id: string
  when: string
  who: string
  role: Role
  action: string
  record: string
  workflow?: string
  accessType: 'Read' | 'Write' | 'Share' | 'Approve' | 'Revoke' | 'Login'
  why: string
  result: 'Allowed' | 'Denied'
}

export interface EvidenceBundle {
  input: string
  relevantHistory: string[]
  supporting: string[]
  conflicting: string[]
  interpretation: string
  uncertainty: string
  sources: string[]
}

export interface GuideMessage {
  id: string
  from: 'patient' | 'orca'
  text: string
  time: string
  evidence?: EvidenceBundle
  options?: { label: string; detail: string }[]
  actions?: { label: string; href: string }[]
}

export interface SessionNote {
  id: string
  patientId: string
  professionalId: string
  date: string
  status: 'Draft' | 'Signed'
  observations: string
  patientReport: string
  goals: string[]
  actions: string[]
}

export interface TaskItem {
  id: string
  patientId?: string
  title: string
  due: string
  forRoles: Role[]
  status: WorkflowStatus
  detail: string
}
