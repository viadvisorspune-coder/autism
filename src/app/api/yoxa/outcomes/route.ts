import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { records, workflowRuns } from "@/db/schema";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { outcomeRequest } from "@/lib/yoxa/contracts";

/**
 * Backs the outcome-capture use of `knowledge_evidence_service` (step 13).
 *
 * Kept separate from the general record write because an outcome is always
 * category 'outcome' and is always tied to the run whose strategy it reports on
 * — which lets later comparisons find it without guessing.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, outcomeRequest);
  if ("response" in read) return read.response;
  const body = read.data;

  const db = getDb();
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, body.workflow_run_id))
    .limit(1);

  if (!run) return errorResponse(404, "No workflow run with that id.");
  if (run.patientId !== body.patient_id) {
    return errorResponse(422, "That workflow run belongs to another patient.");
  }
  if (body.provenance === "ai_inferred") {
    return errorResponse(
      422,
      "An outcome must be reported by a person, not inferred.",
    );
  }

  const [inserted] = await db
    .insert(records)
    .values({
      patientId: body.patient_id,
      category: "outcome",
      kind: "strategy_outcome",
      body: body.body,
      structured: body.structured ?? null,
      provenance: body.provenance,
      sourceUserId: body.actor_user_id,
      evidenceStatus: "unvalidated",
      uncertaintyNote:
        body.uncertainty_note ??
        "Reported outcome. Association with the strategy is not established.",
      visibility: "private",
      occurredAt: new Date(body.occurred_at),
      workflowRunId: body.workflow_run_id,
    })
    .returning();

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id,
    actor: "yoxa",
    actorUserId: body.actor_user_id,
    action: "outcome.recorded",
    resource: inserted.id,
  });

  return NextResponse.json({
    record_id: inserted.id,
    workflow_run_id: body.workflow_run_id,
    recorded_at: inserted.recordedAt.toISOString(),
  });
}
