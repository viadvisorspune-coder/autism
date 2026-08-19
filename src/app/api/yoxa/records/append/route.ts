import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { approvals, records } from "@/db/schema";
import { checkAccess } from "@/lib/access/service";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { recordsAppendRequest } from "@/lib/yoxa/contracts";

/**
 * Backs the write half of `knowledge_evidence_service` — step 14's longitudinal
 * memory update.
 *
 * Two rules are enforced here rather than trusted to the agent:
 *
 *  1. A model inference cannot be stored as observed fact. Anything marked
 *     `ai_inferred` must cite an approved memory-update approval, which is the
 *     "human confirms" cell of the architecture's responsibility table.
 *  2. Updates never mutate. A revision inserts a new row and marks the old one
 *     superseded, so prior versions survive.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, recordsAppendRequest);
  if ("response" in read) return read.response;
  const body = read.data;

  const db = getDb();

  if (body.provenance === "ai_inferred") {
    if (!body.confirmed_by_approval_id) {
      return errorResponse(
        422,
        "An AI-inferred record requires confirmed_by_approval_id.",
        "Model inference may not be stored as observed fact without human confirmation.",
      );
    }
    const [approval] = await db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.id, body.confirmed_by_approval_id),
          eq(approvals.patientId, body.patient_id),
        ),
      )
      .limit(1);

    if (!approval) {
      return errorResponse(422, "That approval does not exist for this patient.");
    }
    if (approval.kind !== "memory_update") {
      return errorResponse(
        422,
        "The cited approval is not a memory-update approval.",
      );
    }
    if (
      approval.status !== "approved" &&
      approval.status !== "approved_with_edits"
    ) {
      return errorResponse(
        409,
        `The cited approval is ${approval.status}, not approved.`,
      );
    }
  }

  const decision = await checkAccess({
    actorUserId: body.actor_user_id,
    patientId: body.patient_id,
    operation: "write",
    purpose: "longitudinal_memory_update",
    requestedCategories: [body.category],
  });

  if (decision.decision === "deny") {
    await recordAudit({
      patientId: body.patient_id,
      workflowRunId: body.workflow_run_id,
      actor: "yoxa",
      actorUserId: body.actor_user_id,
      action: "record.write.deny",
      detail: { reason: decision.reason },
    });
    return errorResponse(403, "Write not permitted.", decision.reason);
  }

  let version = 1;
  if (body.supersedes_record_id) {
    const [prior] = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.id, body.supersedes_record_id),
          eq(records.patientId, body.patient_id),
        ),
      )
      .limit(1);
    if (!prior) {
      return errorResponse(
        422,
        "The record being superseded does not exist for this patient.",
      );
    }
    version = prior.version + 1;
  }

  const [inserted] = await db
    .insert(records)
    .values({
      patientId: body.patient_id,
      category: body.category,
      kind: body.kind,
      body: body.body,
      structured: body.structured ?? null,
      provenance: body.provenance,
      sourceUserId: body.actor_user_id,
      // Nothing arriving through an agent is professionally validated by that
      // fact alone.
      evidenceStatus:
        body.provenance === "clinician_documented"
          ? "professionally_documented"
          : "unvalidated",
      uncertaintyNote: body.uncertainty_note ?? null,
      visibility: "private",
      occurredAt: new Date(body.occurred_at),
      version,
      supersedesId: body.supersedes_record_id ?? null,
      workflowRunId: body.workflow_run_id,
    })
    .returning();

  if (body.supersedes_record_id) {
    await db
      .update(records)
      .set({ supersededAt: new Date(), evidenceStatus: "superseded" })
      .where(eq(records.id, body.supersedes_record_id));
  }

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id,
    actor: "yoxa",
    actorUserId: body.actor_user_id,
    action: "record.write.allow",
    resource: inserted.id,
    aiInferred: body.provenance === "ai_inferred",
    detail: { category: body.category, version },
  });

  return NextResponse.json({
    record_id: inserted.id,
    version: inserted.version,
    evidence_status: inserted.evidenceStatus,
    visibility: inserted.visibility,
    recorded_at: inserted.recordedAt.toISOString(),
  });
}
