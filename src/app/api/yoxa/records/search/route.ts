import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { records } from "@/db/schema";
import { checkAccess } from "@/lib/access/service";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { recordsSearchRequest } from "@/lib/yoxa/contracts";

/**
 * Backs the read half of `knowledge_evidence_service` — the workflow's
 * longitudinal retrieval, evidence and provenance analysis, gap analysis, goal
 * contextualisation and evidence filtering steps.
 *
 * Access is decided before any row is read, and the query is narrowed to the
 * categories the decision permitted. An agent cannot widen its own scope by
 * asking for more: unpermitted categories are dropped, not refused wholesale,
 * which is what "minimum necessary" means in practice.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, recordsSearchRequest);
  if ("response" in read) return read.response;
  const body = read.data;

  const decision = await checkAccess({
    actorUserId: body.actor_user_id,
    patientId: body.patient_id,
    operation: "read",
    purpose: body.purpose,
    requestedCategories: body.categories,
  });

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id ?? null,
    actor: "yoxa",
    actorUserId: body.actor_user_id,
    action: `record.read.${decision.decision}`,
    detail: { purpose: body.purpose, permitted: decision.permittedCategories },
  });

  if (decision.decision === "deny") {
    return NextResponse.json(
      {
        decision: "deny" as const,
        reason: decision.reason,
        permitted_categories: [],
        records: [],
        total: 0,
      },
      { status: 200 },
    );
  }

  const filters: SQL[] = [
    eq(records.patientId, body.patient_id),
    inArray(records.category, decision.permittedCategories),
    // Superseded rows stay in the table for history, but retrieval returns the
    // current version only.
    isNull(records.supersededAt),
  ];
  if (body.occurred_since) {
    filters.push(gte(records.occurredAt, new Date(body.occurred_since)));
  }
  if (body.occurred_until) {
    filters.push(lte(records.occurredAt, new Date(body.occurred_until)));
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(records)
    .where(and(...filters))
    .orderBy(desc(records.occurredAt))
    .limit(body.limit ?? 50);

  return NextResponse.json({
    decision: decision.decision,
    reason: decision.reason,
    permitted_categories: decision.permittedCategories,
    total: rows.length,
    records: rows.map((r) => ({
      record_id: r.id,
      category: r.category,
      kind: r.kind,
      body: r.body,
      structured: r.structured ?? null,
      provenance: r.provenance,
      evidence_status: r.evidenceStatus,
      uncertainty_note: r.uncertaintyNote,
      visibility: r.visibility,
      occurred_at: r.occurredAt.toISOString(),
      recorded_at: r.recordedAt.toISOString(),
      version: r.version,
    })),
  });
}
