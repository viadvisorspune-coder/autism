import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * ORCA system of record.
 *
 * Layering rule from the architecture: this file is the *backend* — state,
 * permissions and execution. Nothing here defers a permission decision to a
 * model. Yoxa's agents propose; these tables decide and remember.
 */

// --- Enums ------------------------------------------------------------------

/** v1 ships patient and clinician only. Employer/university/trusted person are
 *  deliberately absent so no half-enforced permission path exists for them. */
export const userRole = pgEnum("user_role", ["patient", "clinician"]);

/** A clinician's professional designation. Governs nothing on its own; it is
 *  displayed and audited. Authority always comes from care_relationships. */
export const clinicianKind = pgEnum("clinician_kind", [
  "psychologist",
  "psychiatrist",
  "therapist",
  "occupational_therapist",
  "general_practitioner",
  "other",
]);

/** Categories from step 2 of the workflow (Access, Purpose and Data Scope).
 *  Every record carries one, and consent is granted per category. */
export const dataCategory = pgEnum("data_category", [
  "personal",
  "functional",
  "clinical",
  "support",
  "preference",
  "contextual",
  "outcome",
  "administrative",
]);

/** Where a piece of information came from. Step 4 requires that AI inference is
 *  never stored as observed fact, so it is a distinct value here. */
export const provenanceKind = pgEnum("provenance_kind", [
  "patient_reported",
  "clinician_documented",
  "external_document",
  "system_generated",
  "ai_inferred",
]);

export const evidenceStatus = pgEnum("evidence_status", [
  "unvalidated",
  "partially_structured",
  "professionally_documented",
  "contradicted",
  "superseded",
]);

/** Who may read a record. `private` means the patient alone — the default. */
export const visibility = pgEnum("visibility", [
  "private",
  "care_team",
  "explicitly_shared",
]);

export const workflowState = pgEnum("workflow_state", [
  "triggered",
  "running",
  "awaiting_clarification",
  "awaiting_approval",
  "executing",
  "closed",
  "blocked",
  "failed",
]);

export const approvalKind = pgEnum("approval_kind", [
  "clarification",
  "consequence_gate",
  "consent_disclosure",
  "memory_update",
]);

export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "approved_with_edits",
  "rejected",
  "expired",
]);

export const consentStatus = pgEnum("consent_status", [
  "active",
  "revoked",
  "expired",
]);

export const relationshipStatus = pgEnum("relationship_status", [
  "pending",
  "active",
  "revoked",
]);

// --- Identity ---------------------------------------------------------------

/**
 * Application users. `id` is the Supabase `auth.users.id` rather than a
 * separate key, so every RLS policy can compare against `auth.uid()` with no
 * join. Rows are created by a trigger on signup, not by application code.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: userRole("role").notNull(),
    /** Set only when role = 'clinician'. */
    clinicianKind: clinicianKind("clinician_kind"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** The subject of the record. Separated from `users` because a patient is a
 *  record-holding entity, and later versions may need one without a login. */
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("patients_user_idx").on(t.userId)],
);

/**
 * A clinician's authority over one patient's record. Absence of an active row
 * here means no access, whatever the clinician's designation says.
 * `scope` narrows which categories the relationship can ever reach; consent
 * narrows it further per purpose.
 */
export const careRelationships = pgTable(
  "care_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    clinicianUserId: uuid("clinician_user_id")
      .notNull()
      .references(() => users.id),
    status: relationshipStatus("status").notNull().default("pending"),
    scope: dataCategory("scope").array().notNull(),
    /** The patient establishes and ends the relationship, never the clinician. */
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("care_rel_unique_idx").on(t.patientId, t.clinicianUserId),
    index("care_rel_patient_idx").on(t.patientId),
  ],
);

// --- Consent ----------------------------------------------------------------

/**
 * A patient's standing permission for one purpose and one recipient. Revocable
 * at any time; revocation is recorded rather than deleted so the disclosure
 * history in step 15 stays complete.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    /** Free-text purpose, matched case-insensitively against access requests. */
    purpose: text("purpose").notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    categories: dataCategory("categories").array().notNull(),
    status: consentStatus("status").notNull().default("active"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Approval record that produced this consent, when it came from a gate. */
    sourceApprovalId: uuid("source_approval_id"),
  },
  (t) => [
    index("consents_patient_idx").on(t.patientId),
    index("consents_recipient_idx").on(t.recipientUserId),
  ],
);

// --- Longitudinal record ----------------------------------------------------

/**
 * One durable piece of the patient's longitudinal record: an observation, a
 * preference, a clinician note, a strategy outcome.
 *
 * Records are append-only. An update writes a new row pointing at the one it
 * supersedes, so step 14's "preserve prior versions" holds by construction.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    category: dataCategory("category").notNull(),
    /** Short machine label, e.g. 'observation', 'preference', 'session_note'. */
    kind: text("kind").notNull(),
    /** The patient's own wording, preserved verbatim. */
    body: text("body").notNull(),
    /** Structured values alongside the text: ratings, durations, counts. */
    structured: jsonb("structured").$type<Record<string, unknown>>(),

    provenance: provenanceKind("provenance").notNull(),
    /** User id of whoever supplied it, when a person did. */
    sourceUserId: uuid("source_user_id").references(() => users.id),
    evidenceStatus: evidenceStatus("evidence_status")
      .notNull()
      .default("unvalidated"),
    /** Plain-language statement of what is NOT established, e.g. causation. */
    uncertaintyNote: text("uncertainty_note"),

    visibility: visibility("visibility").notNull().default("private"),

    /** When the thing described happened, which is not when it was recorded. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),

    /** The workflow run that produced this record, when one did. */
    workflowRunId: uuid("workflow_run_id"),
  },
  (t) => [
    index("records_patient_occurred_idx").on(t.patientId, t.occurredAt),
    index("records_patient_category_idx").on(t.patientId, t.category),
    index("records_supersedes_idx").on(t.supersedesId),
  ],
);

// --- Workflow ---------------------------------------------------------------

/**
 * One run of the Yoxa workflow, mirrored on this side. `yoxaRunId` is the
 * workflow_run_id Yoxa returns when triggered; every later Yoxa call carries it
 * so its writes land against the right run.
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    yoxaRunId: text("yoxa_run_id"),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    /** Who performed the application action that started this run. */
    initiatedByUserId: uuid("initiated_by_user_id")
      .notNull()
      .references(() => users.id),
    /** Idempotency key sent to Yoxa. Unique per logical user action. */
    idempotencyKey: text("idempotency_key").notNull(),

    state: workflowState("state").notNull().default("triggered"),
    currentStep: text("current_step"),
    /** What the workflow says should happen next, in plain language. */
    nextAction: text("next_action"),
    closureReason: text("closure_reason"),

    /** The text the patient submitted, kept for the audit trail. */
    triggerText: text("trigger_text"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workflow_runs_idempotency_idx").on(t.idempotencyKey),
    uniqueIndex("workflow_runs_yoxa_idx").on(t.yoxaRunId),
    index("workflow_runs_patient_idx").on(t.patientId),
  ],
);

/**
 * A decision only a human may make. Created when Yoxa's HITL webhook fires,
 * resolved when the human acts in this app, then sent back to Yoxa.
 */
/** One choice Yoxa offers the human. Supplied by Yoxa, never authored here. */
export interface ApprovalOption {
  option_id: string;
  title: string;
  description?: string;
}

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    kind: approvalKind("kind").notNull(),
    status: approvalStatus("status").notNull().default("pending"),

    /** Yoxa's HITL request UUID. Used only in the response URL. */
    yoxaRequestId: text("yoxa_request_id").notNull(),
    /** Yoxa deployment this approval belongs to; also part of the response URL. */
    yoxaDeploymentId: text("yoxa_deployment_id").notNull(),
    /** The choices Yoxa supplied. Rendered as-is; this app invents no options. */
    options: jsonb("options").$type<ApprovalOption[]>(),
    /** Set when the human wrote their own answer instead of picking an option. */
    selectedOptionId: text("selected_option_id"),
    overrideMessage: text("override_message"),

    /** What the human is being asked to approve — shown verbatim in the UI. */
    prompt: text("prompt").notNull(),
    proposedContent: jsonb("proposed_content").$type<Record<string, unknown>>(),
    /** Named recipient of a disclosure, when the gate is about sharing. */
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    /** Categories the disclosure would expose. Shown before the human decides. */
    disclosureCategories: dataCategory("disclosure_categories").array(),

    /** Which user is entitled to decide this. Enforced, not advisory. */
    assignedToUserId: uuid("assigned_to_user_id")
      .notNull()
      .references(() => users.id),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The human's edits, when they approved a changed version. */
    editedContent: jsonb("edited_content").$type<Record<string, unknown>>(),
    decisionNote: text("decision_note"),

    /** Set once the decision has been accepted by Yoxa. */
    deliveredToYoxaAt: timestamp("delivered_to_yoxa_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("approvals_yoxa_request_idx").on(t.yoxaRequestId),
    index("approvals_assignee_status_idx").on(t.assignedToUserId, t.status),
    index("approvals_run_idx").on(t.workflowRunId),
  ],
);

/** A file generated by a Yoxa output tool and delivered to this app. */
export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull(),
    /** Who the document was written for. Null means the patient themselves. */
    recipientUserId: uuid("recipient_user_id").references(() => users.id),
    /** The approval that authorised delivering this to its recipient. */
    approvalId: uuid("approval_id").references(() => approvals.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("artifacts_run_idx").on(t.workflowRunId)],
);

/** A follow-up or message the backend owes a stakeholder. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientUserId)],
);

/**
 * The audit trail from step 15. Append-only: no update or delete path exists in
 * application code. Records access, disclosure, approval and AI inference alike.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").references(() => patients.id),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id),
    /** Who acted: a user id, or 'yoxa' for an agent-initiated call. */
    actor: text("actor").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    /** Verb, e.g. 'record.read', 'consent.granted', 'disclosure.sent'. */
    action: text("action").notNull(),
    resource: text("resource"),
    /** Whether this event describes an AI inference rather than a fact. */
    aiInferred: boolean("ai_inferred").notNull().default(false),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_patient_time_idx").on(t.patientId, t.occurredAt),
    index("audit_run_idx").on(t.workflowRunId),
  ],
);

/**
 * Every inbound Yoxa webhook, keyed by its event id.
 *
 * Yoxa's delivery is at-least-once, so the unique index — not application
 * logic — is what stops a redelivered event creating a second approval task.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_event_id_idx").on(t.eventId)],
);

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type CareRelationship = typeof careRelationships.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type Record_ = typeof records.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;

export type DataCategory = (typeof dataCategory.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
export type Visibility = (typeof visibility.enumValues)[number];
