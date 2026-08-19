import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workflowRuns } from "@/db/schema";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { workflowStateRequest } from "@/lib/yoxa/contracts";

/**
 * Backs `workflow_state_service`, used at six points in the workflow to record
 * routing, sufficiency, goal registration, governance, execution and closure.
 * All six are the same write: move this run to a state and say what is next.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, workflowStateRequest);
  if ("response" in read) return read.response;
  const body = read.data;

  const db = getDb();
  const now = new Date();
  const closing = body.state === "closed";

  const [updated] = await db
    .update(workflowRuns)
    .set({
      state: body.state,
      currentStep: body.current_step ?? null,
      nextAction: body.next_action ?? null,
      closureReason: body.closure_reason ?? null,
      ...(body.yoxa_run_id ? { yoxaRunId: body.yoxa_run_id } : {}),
      updatedAt: now,
      ...(closing ? { closedAt: now } : {}),
    })
    .where(eq(workflowRuns.id, body.workflow_run_id))
    .returning();

  if (!updated) {
    return errorResponse(404, "No workflow run with that id.");
  }

  await recordAudit({
    patientId: updated.patientId,
    workflowRunId: updated.id,
    actor: "yoxa",
    action: `workflow.state.${body.state}`,
    resource: body.current_step ?? null,
    detail: {
      next_action: body.next_action,
      closure_reason: body.closure_reason,
    },
  });

  return NextResponse.json({
    workflow_run_id: updated.id,
    state: updated.state,
    current_step: updated.currentStep,
    next_action: updated.nextAction,
    updated_at: updated.updatedAt.toISOString(),
  });
}
