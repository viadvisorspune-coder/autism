import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";

/**
 * Append one audit event. There is no update or delete counterpart, by design:
 * step 15 of the workflow requires a record that later steps cannot rewrite.
 */
export async function recordAudit(event: {
  patientId?: string | null;
  workflowRunId?: string | null;
  actor: string;
  actorUserId?: string | null;
  action: string;
  resource?: string | null;
  aiInferred?: boolean;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditEvents).values({
    patientId: event.patientId ?? null,
    workflowRunId: event.workflowRunId ?? null,
    actor: event.actor,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    resource: event.resource ?? null,
    aiInferred: event.aiInferred ?? false,
    detail: event.detail ?? null,
  });
}
