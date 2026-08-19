"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { approvals } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { currentUser } from "@/lib/session";
import { sendHitlDecision } from "@/lib/yoxa/respond";

export interface DecisionResult {
  ok: boolean;
  message: string;
}

/**
 * Submit a human's decision on an approval.
 *
 * The browser never talks to Yoxa. This server action checks that the signed-in
 * user is the assignee, records the decision locally, then forwards it using
 * the server-held response secret.
 */
export async function decideApproval(
  _prev: DecisionResult | null,
  formData: FormData,
): Promise<DecisionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Please sign in again." };

  const approvalId = String(formData.get("approval_id") ?? "");
  const optionId = String(formData.get("option_id") ?? "").trim();
  const override = String(formData.get("override_message") ?? "").trim();

  if (optionId === "" && override === "") {
    return { ok: false, message: "Choose an option or write a response." };
  }

  const db = getDb();
  // Scoping the read by assignee is the authorisation check: another user's
  // approval simply is not found.
  const [approval] = await db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.id, approvalId), eq(approvals.assignedToUserId, user.id)),
    )
    .limit(1);

  if (!approval) {
    return { ok: false, message: "That decision is not yours to make." };
  }
  if (approval.status !== "pending") {
    return { ok: false, message: "This has already been answered." };
  }

  let result;
  try {
    result = await sendHitlDecision({
      deploymentId: approval.yoxaDeploymentId,
      requestId: approval.yoxaRequestId,
      ...(optionId !== ""
        ? { selectedOptionId: optionId }
        : { overrideMessage: override }),
    });
  } catch {
    return {
      ok: false,
      message: "Could not reach the workflow service. Nothing was changed.",
    };
  }

  if (!result.ok) {
    return { ok: false, message: "The workflow service rejected the decision." };
  }

  await db
    .update(approvals)
    .set({
      status: override !== "" ? "approved_with_edits" : "approved",
      decidedByUserId: user.id,
      decidedAt: new Date(),
      selectedOptionId: optionId !== "" ? optionId : null,
      overrideMessage: override !== "" ? override : null,
      deliveredToYoxaAt: new Date(),
    })
    .where(eq(approvals.id, approval.id));

  await recordAudit({
    patientId: approval.patientId,
    workflowRunId: approval.workflowRunId,
    actor: "user",
    actorUserId: user.id,
    action: "approval.decided",
    resource: approval.yoxaRequestId,
    detail: { option_id: optionId || null, had_override: override !== "" },
  });

  revalidatePath("/approvals");

  return {
    ok: true,
    message: result.alreadyAnswered
      ? "This had already been answered. Your view is up to date."
      : "Decision sent.",
  };
}
