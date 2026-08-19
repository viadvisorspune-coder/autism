import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { workflowRuns } from "@/db/schema";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { safetyReviewRequest } from "@/lib/yoxa/contracts";

/**
 * Backs `safety_authority_review_service`.
 *
 * The agent assesses; this route enforces the consequence of that assessment.
 * A decision needing human authority moves the run to `awaiting_approval` here,
 * so nothing downstream can proceed by simply not asking.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, safetyReviewRequest);
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

  const needsHuman =
    body.decision === "requires_human_approval" ||
    body.decision === "requires_professional_authority";
  const blocked = body.decision === "blocked";

  const nextState = blocked
    ? "blocked"
    : needsHuman
      ? "awaiting_approval"
      : run.state;

  await db
    .update(workflowRuns)
    .set({ state: nextState, updatedAt: new Date() })
    .where(eq(workflowRuns.id, run.id));

  await recordAudit({
    patientId: run.patientId,
    workflowRunId: run.id,
    actor: "yoxa",
    action: `safety.review.${body.decision}`,
    aiInferred: true,
    detail: {
      risk_level: body.risk_level,
      rationale: body.rationale,
      restrictions: body.restrictions,
    },
  });

  return NextResponse.json({
    workflow_run_id: run.id,
    decision: body.decision,
    risk_level: body.risk_level,
    workflow_state: nextState,
    human_approval_required: needsHuman,
    restrictions: body.restrictions,
  });
}
