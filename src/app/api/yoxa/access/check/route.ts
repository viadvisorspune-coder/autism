import { NextResponse } from "next/server";

import { checkAccess } from "@/lib/access/service";
import { errorResponse, readYoxaRequest } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { accessCheckRequest } from "@/lib/yoxa/contracts";

/**
 * Backs the workflow's `identity_access_service`.
 *
 * The same question is asked at five points in the workflow — access, gathering
 * information, disclosure, final recipient, and memory visibility — so one
 * operation answers all five, distinguished by `purpose` and `operation`.
 */
export async function POST(request: Request) {
  const read = await readYoxaRequest(request, accessCheckRequest);
  if ("response" in read) return read.response;
  const body = read.data;

  if (body.operation === "disclose" && !body.recipient_user_id) {
    return errorResponse(
      422,
      "recipient_user_id is required when operation is 'disclose'.",
    );
  }

  const decision = await checkAccess({
    actorUserId: body.actor_user_id,
    patientId: body.patient_id,
    operation: body.operation,
    purpose: body.purpose,
    requestedCategories: body.requested_categories,
    recipientUserId: body.recipient_user_id,
  });

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id ?? null,
    actor: "yoxa",
    actorUserId: body.actor_user_id,
    action: `access.${body.operation}.${decision.decision}`,
    resource: body.requested_categories.join(","),
    detail: {
      purpose: body.purpose,
      permitted: decision.permittedCategories,
      denied: decision.deniedCategories,
      reason: decision.reason,
    },
  });

  return NextResponse.json({
    decision: decision.decision,
    permitted_categories: decision.permittedCategories,
    denied_categories: decision.deniedCategories,
    consent_status: decision.consentStatus,
    restrictions: decision.restrictions,
    reason: decision.reason,
  });
}
