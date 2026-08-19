import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workflowRuns } from "@/db/schema";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { auditRequest } from "@/lib/yoxa/contracts";

/** Backs `audit_provenance_service`. Accepts a batch so step 15 can close a run
 *  with its whole event set in one call. */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, auditRequest);
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

  for (const event of body.events) {
    await recordAudit({
      patientId: body.patient_id,
      workflowRunId: body.workflow_run_id,
      actor: "yoxa",
      action: event.action,
      resource: event.resource ?? null,
      aiInferred: event.ai_inferred,
      detail: event.detail,
    });
  }

  return NextResponse.json({
    workflow_run_id: body.workflow_run_id,
    recorded_count: body.events.length,
  });
}
