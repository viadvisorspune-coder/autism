import { z } from "zod";

/**
 * Request shapes for the Yoxa connector endpoints.
 *
 * These are written to stay inside Yoxa's OpenAPI profile: bounded objects, no
 * shape-changing unions, and every field one this backend actually reads. The
 * generated `.openapi.yml` files are derived from these, not the other way
 * round.
 */

export const dataCategoryEnum = z.enum([
  "personal",
  "functional",
  "clinical",
  "support",
  "preference",
  "contextual",
  "outcome",
  "administrative",
]);

export const provenanceEnum = z.enum([
  "patient_reported",
  "clinician_documented",
  "external_document",
  "system_generated",
  "ai_inferred",
]);

const uuidField = z.string().uuid();

export const accessCheckRequest = z.object({
  patient_id: uuidField,
  actor_user_id: uuidField,
  operation: z.enum(["read", "write", "disclose"]),
  purpose: z.string().min(1).max(200),
  requested_categories: z.array(dataCategoryEnum).min(1),
  recipient_user_id: uuidField.optional(),
  workflow_run_id: uuidField.optional(),
});

export const recordsSearchRequest = z.object({
  patient_id: uuidField,
  actor_user_id: uuidField,
  purpose: z.string().min(1).max(200),
  categories: z.array(dataCategoryEnum).min(1),
  /** ISO-8601. Filters on when the thing happened, not when it was recorded. */
  occurred_since: z.string().datetime().optional(),
  occurred_until: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  workflow_run_id: uuidField.optional(),
});

export const recordsAppendRequest = z.object({
  patient_id: uuidField,
  actor_user_id: uuidField,
  workflow_run_id: uuidField,
  category: dataCategoryEnum,
  kind: z.string().min(1).max(80),
  /** The person's own wording. Stored verbatim; never rewritten. */
  body: z.string().min(1).max(20000),
  structured: z.record(z.unknown()).optional(),
  provenance: provenanceEnum,
  uncertainty_note: z.string().max(2000).optional(),
  occurred_at: z.string().datetime(),
  /** Required when provenance is 'ai_inferred': the approval that confirmed it. */
  confirmed_by_approval_id: uuidField.optional(),
  /** Set to supersede an existing record rather than mutating it. */
  supersedes_record_id: uuidField.optional(),
});

export const outcomeRequest = z.object({
  patient_id: uuidField,
  actor_user_id: uuidField,
  workflow_run_id: uuidField,
  /** What was tried, in the patient's or clinician's words. */
  body: z.string().min(1).max(20000),
  structured: z.record(z.unknown()).optional(),
  provenance: provenanceEnum,
  occurred_at: z.string().datetime(),
  uncertainty_note: z.string().max(2000).optional(),
});

export const workflowStateRequest = z.object({
  workflow_run_id: uuidField,
  yoxa_run_id: z.string().min(1).max(200).optional(),
  state: z.enum([
    "triggered",
    "running",
    "awaiting_clarification",
    "awaiting_approval",
    "executing",
    "closed",
    "blocked",
    "failed",
  ]),
  current_step: z.string().max(200).optional(),
  next_action: z.string().max(2000).optional(),
  closure_reason: z.string().max(200).optional(),
});

export const safetyReviewRequest = z.object({
  workflow_run_id: uuidField,
  patient_id: uuidField,
  /** The agent's assessment. The backend records and enforces; it does not judge. */
  decision: z.enum([
    "no_consequential_action",
    "proceed_with_restrictions",
    "requires_human_approval",
    "requires_professional_authority",
    "blocked",
  ]),
  risk_level: z.enum(["low", "moderate", "high"]),
  rationale: z.string().min(1).max(4000),
  restrictions: z.array(z.string().max(500)).max(20).default([]),
});

export const auditRequest = z.object({
  workflow_run_id: uuidField,
  patient_id: uuidField,
  events: z
    .array(
      z.object({
        action: z.string().min(1).max(120),
        resource: z.string().max(200).optional(),
        /** True when the event describes a model inference, not a fact. */
        ai_inferred: z.boolean().default(false),
        detail: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const notificationRequest = z.object({
  patient_id: uuidField,
  workflow_run_id: uuidField,
  recipient_user_id: uuidField,
  kind: z.string().min(1).max(80),
  body: z.string().min(1).max(4000),
  due_at: z.string().datetime().optional(),
});

/**
 * Artifact delivery. Yoxa sends this as ordinary JSON during an API Connection
 * Check and as multipart/form-data when generated files are attached, so the
 * route parses both and this schema describes only the JSON side.
 */
export const artifactRequest = z.object({
  patient_id: uuidField,
  workflow_run_id: uuidField,
  title: z.string().min(1).max(300),
  recipient_user_id: uuidField.optional(),
  approval_id: uuidField.optional(),
});

export type AccessCheckRequest = z.infer<typeof accessCheckRequest>;
export type RecordsSearchRequest = z.infer<typeof recordsSearchRequest>;
export type RecordsAppendRequest = z.infer<typeof recordsAppendRequest>;
export type WorkflowStateRequest = z.infer<typeof workflowStateRequest>;
