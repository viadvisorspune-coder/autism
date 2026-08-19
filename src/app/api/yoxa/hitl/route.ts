import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  approvals,
  patients,
  webhookEvents,
  workflowRuns,
  type ApprovalOption,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { verifyWebhookSignature } from "@/lib/yoxa/signature";

/**
 * Receiver for Yoxa's deployed human-approval events.
 *
 * This is the inbound half of HITL: Yoxa posts a signed event, this route
 * persists a pending approval, and a human answers it later in this app's own
 * UI. The decision goes back through `sendHitlDecision`, not from the browser.
 *
 * Delivery is at-least-once, so a redelivered event must not create a second
 * task. Deduplication is the unique index on `webhook_events.event_id` — a
 * check-then-insert would race under concurrent redelivery.
 *
 * Note the auth difference from the connector routes: those use a bearer token,
 * this uses an HMAC over the raw body. Do not add bearer auth here.
 */

interface ApprovalPayload {
  event_id?: unknown;
  event_type?: unknown;
  deployment_id?: unknown;
  workflow_run_id?: unknown;
  request_id?: unknown;
  title?: unknown;
  description?: unknown;
  options?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseOptions(value: unknown): ApprovalOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    const optionId = asString(o.option_id);
    const title = asString(o.title);
    if (!optionId || !title) return [];
    return [
      {
        option_id: optionId,
        title,
        ...(asString(o.description)
          ? { description: o.description as string }
          : {}),
      },
    ];
  });
}

export async function POST(request: Request) {
  // Raw bytes first: parsing and re-serialising would break the HMAC.
  const rawBody = await request.text();

  const verified = verifyWebhookSignature({
    rawBody,
    timestampHeader: request.headers.get("x-yoxa-webhook-timestamp"),
    signatureHeader: request.headers.get("x-yoxa-webhook-signature"),
  });
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.message },
      { status: verified.status },
    );
  }

  let payload: ApprovalPayload;
  try {
    payload = JSON.parse(rawBody) as ApprovalPayload;
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const eventId = asString(payload.event_id);
  const eventType = asString(payload.event_type);
  if (!eventId || !eventType) {
    return NextResponse.json(
      { error: "Missing event_id or event_type." },
      { status: 400 },
    );
  }

  const db = getDb();

  // Insert first. If the unique index rejects it, this is a redelivery and the
  // work below has already been done.
  const claimed = await db
    .insert(webhookEvents)
    .values({
      eventId,
      eventType,
      payload: payload as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning();

  if (claimed.length === 0) {
    // Already handled. A 2xx stops Yoxa retrying.
    return new NextResponse(null, { status: 204 });
  }

  if (eventType === "hitl.webhook_test") {
    await recordAudit({ actor: "yoxa", action: "hitl.webhook_test" });
    return new NextResponse(null, { status: 204 });
  }

  if (eventType !== "hitl.approval_requested") {
    // Unknown but authentic. Stored above; nothing further to do.
    return new NextResponse(null, { status: 204 });
  }

  const yoxaRunId = asString(payload.workflow_run_id);
  const requestId = asString(payload.request_id);
  const deploymentId = asString(payload.deployment_id);
  const title = asString(payload.title);

  if (!yoxaRunId || !requestId || !deploymentId || !title) {
    return NextResponse.json(
      { error: "Approval event is missing required fields." },
      { status: 400 },
    );
  }

  // workflow_run_id is the stable cross-system link, so the local record is
  // found by that rather than by Yoxa's request id.
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.yoxaRunId, yoxaRunId))
    .limit(1);

  if (!run) {
    // Authentic but unmatched. Returning 2xx avoids an infinite retry loop for
    // an event this deployment can never resolve; the row above preserves it.
    await recordAudit({
      actor: "yoxa",
      action: "hitl.approval_unmatched",
      detail: { yoxa_run_id: yoxaRunId, request_id: requestId },
    });
    return new NextResponse(null, { status: 204 });
  }

  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, run.patientId))
    .limit(1);

  // The patient decides about their own record. When a patient has no login,
  // the run's initiator holds the decision instead.
  const assignee = patient?.userId ?? run.initiatedByUserId;

  await db
    .insert(approvals)
    .values({
      workflowRunId: run.id,
      patientId: run.patientId,
      kind: "consent_disclosure",
      yoxaRequestId: requestId,
      yoxaDeploymentId: deploymentId,
      prompt: title,
      proposedContent: asString(payload.description)
        ? { description: payload.description as string }
        : null,
      options: parseOptions(payload.options),
      assignedToUserId: assignee,
    })
    .onConflictDoNothing({ target: approvals.yoxaRequestId });

  await db
    .update(workflowRuns)
    .set({ state: "awaiting_approval", updatedAt: new Date() })
    .where(eq(workflowRuns.id, run.id));

  await recordAudit({
    patientId: run.patientId,
    workflowRunId: run.id,
    actor: "yoxa",
    action: "hitl.approval_requested",
    resource: requestId,
    detail: { title },
  });

  return new NextResponse(null, { status: 204 });
}
