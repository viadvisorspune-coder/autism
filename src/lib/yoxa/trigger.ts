import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { workflowRuns } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

/**
 * Starting a Yoxa workflow run from a trusted application action.
 *
 * This must only ever be called from server-side code. The deployment secret
 * never reaches the browser, and the public application is responsible for
 * checking that the current user may perform the action *before* calling this.
 *
 * The workflow's entry trigger is `new_platform_event` in text mode, so the
 * body is JSON with `trigger_text` and optional `metadata`.
 */

/**
 * Header carrying the deployment secret.
 *
 * CONFIRM THIS against the cURL copied from Yoxa's Release → Integration
 * screen before the first live run. That cURL is the authoritative contract for
 * the URL, headers and payload; this constant is the one place to correct if
 * the copied command uses a different header name.
 */
const DEPLOYMENT_SECRET_HEADER = "X-Yoxa-Deployment-Secret";

export interface TriggerResult {
  ok: boolean;
  workflowRunId: string;
  yoxaRunId: string | null;
  /** Safe to surface to the user; contains no secret and no Yoxa internals. */
  message: string;
}

/**
 * Trigger a run and persist its id.
 *
 * A new idempotency key is generated per logical action. Retrying the *same*
 * action after a transient failure should reuse the stored key, which is why it
 * is persisted rather than kept only in memory.
 */
export async function triggerWorkflow(args: {
  patientId: string;
  initiatedByUserId: string;
  triggerText: string;
  metadata?: Record<string, unknown>;
}): Promise<TriggerResult> {
  const triggerUrl = process.env.YOXA_TRIGGER_URL;
  const secret = process.env.YOXA_DEPLOYMENT_SECRET;
  if (!triggerUrl || !secret) {
    throw new Error(
      "YOXA_TRIGGER_URL and YOXA_DEPLOYMENT_SECRET must be set server-side.",
    );
  }

  const db = getDb();
  const idempotencyKey = randomUUID();

  // The local run exists before the call, so a failed trigger still leaves a
  // record to retry against rather than a silently dropped user action.
  const [run] = await db
    .insert(workflowRuns)
    .values({
      patientId: args.patientId,
      initiatedByUserId: args.initiatedByUserId,
      idempotencyKey,
      triggerText: args.triggerText,
      state: "triggered",
    })
    .returning();

  let response: Response;
  try {
    response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        [DEPLOYMENT_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({
        trigger_text: args.triggerText,
        ...(args.metadata ? { metadata: args.metadata } : {}),
      }),
    });
  } catch (cause) {
    // Never log the error verbatim: a fetch failure can echo request headers.
    await db
      .update(workflowRuns)
      .set({ state: "failed", updatedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));
    await recordAudit({
      patientId: args.patientId,
      workflowRunId: run.id,
      actor: "system",
      actorUserId: args.initiatedByUserId,
      action: "workflow.trigger.network_error",
    });
    return {
      ok: false,
      workflowRunId: run.id,
      yoxaRunId: null,
      message: "Could not reach the workflow service. Your entry was saved.",
    };
  }

  if (!response.ok) {
    await db
      .update(workflowRuns)
      .set({ state: "failed", updatedAt: new Date() })
      .where(eq(workflowRuns.id, run.id));
    await recordAudit({
      patientId: args.patientId,
      workflowRunId: run.id,
      actor: "system",
      actorUserId: args.initiatedByUserId,
      action: "workflow.trigger.rejected",
      detail: { status: response.status },
    });
    return {
      ok: false,
      workflowRunId: run.id,
      yoxaRunId: null,
      message: "The workflow service rejected the request. Your entry was saved.",
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    workflow_run_id?: unknown;
  };
  const yoxaRunId =
    typeof body.workflow_run_id === "string" ? body.workflow_run_id : null;

  await db
    .update(workflowRuns)
    .set({ yoxaRunId, state: "running", updatedAt: new Date() })
    .where(eq(workflowRuns.id, run.id));

  await recordAudit({
    patientId: args.patientId,
    workflowRunId: run.id,
    actor: "system",
    actorUserId: args.initiatedByUserId,
    action: "workflow.trigger.accepted",
    resource: yoxaRunId,
  });

  return {
    ok: true,
    workflowRunId: run.id,
    yoxaRunId,
    message: "Recorded.",
  };
}
