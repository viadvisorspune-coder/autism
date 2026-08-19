import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notifications, users, workflowRuns } from "@/db/schema";
import { checkAccess } from "@/lib/access/service";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { notificationRequest } from "@/lib/yoxa/contracts";

/**
 * Backs the simulated-tool use of `stakeholder_communication_service` (step 13)
 * — scheduling a follow-up and asking a named person for outcome information.
 *
 * The clarification use of that same call name in step 5 is a human-approval
 * tool, not a connector, and is handled by the HITL receiver instead.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, notificationRequest);
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

  const [recipient] = await db
    .select()
    .from(users)
    .where(eq(users.id, body.recipient_user_id))
    .limit(1);
  if (!recipient) return errorResponse(422, "That recipient does not exist.");

  // Contacting someone about a patient is itself a disclosure — the recipient
  // learns the patient has an open workflow. Check before queueing anything.
  const decision = await checkAccess({
    actorUserId: body.recipient_user_id,
    patientId: body.patient_id,
    operation: "read",
    purpose: "outcome_follow_up",
    requestedCategories: ["administrative"],
  });

  if (decision.decision === "deny") {
    await recordAudit({
      patientId: body.patient_id,
      workflowRunId: body.workflow_run_id,
      actor: "yoxa",
      action: "notification.blocked",
      detail: { reason: decision.reason },
    });
    return errorResponse(
      403,
      "That recipient may not be contacted about this patient.",
      decision.reason,
    );
  }

  const [inserted] = await db
    .insert(notifications)
    .values({
      patientId: body.patient_id,
      workflowRunId: body.workflow_run_id,
      recipientUserId: body.recipient_user_id,
      kind: body.kind,
      body: body.body,
      dueAt: body.due_at ? new Date(body.due_at) : null,
    })
    .returning();

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id,
    actor: "yoxa",
    action: "notification.queued",
    resource: inserted.id,
    detail: { kind: body.kind, recipient: body.recipient_user_id },
  });

  return NextResponse.json({
    notification_id: inserted.id,
    status: "queued",
    due_at: inserted.dueAt?.toISOString() ?? null,
  });
}
