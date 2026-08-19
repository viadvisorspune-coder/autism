"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { records } from "@/db/schema";
import { currentPatientId, currentUser } from "@/lib/session";
import { triggerWorkflow } from "@/lib/yoxa/trigger";

export interface RecordResult {
  ok: boolean;
  message: string;
}

/**
 * The application action the Yoxa trigger is bound to.
 *
 * Order matters and is deliberate: the observation is persisted first, then the
 * workflow is triggered. If Yoxa is unreachable the person's words are still
 * saved, and they are told plainly — a failed trigger must never look like a
 * lost entry, and must never be swallowed silently.
 */
export async function submitObservation(
  _prev: RecordResult | null,
  formData: FormData,
): Promise<RecordResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Please sign in again." };

  const patientId = await currentPatientId(user.id);
  if (!patientId) {
    return { ok: false, message: "This account has no patient record." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length === 0) {
    return { ok: false, message: "Write something first." };
  }

  const structured: Record<string, number> = {};
  for (const key of ["overwhelm", "energy", "sensory_load"]) {
    const raw = formData.get(key);
    if (typeof raw === "string" && raw !== "") structured[key] = Number(raw);
  }

  const db = getDb();
  await db.insert(records).values({
    patientId,
    category: "personal",
    kind: "observation",
    body,
    structured,
    provenance: "patient_reported",
    sourceUserId: user.id,
    evidenceStatus: "partially_structured",
    uncertaintyNote:
      "Self-reported at the time of writing. No cause is established.",
    visibility: "private",
    occurredAt: new Date(),
  });

  const triggered = await triggerWorkflow({
    patientId,
    initiatedByUserId: user.id,
    triggerText: body,
    metadata: { source: "record_screen", ratings: structured },
  });

  revalidatePath("/timeline");

  return triggered.ok
    ? { ok: true, message: "Saved." }
    : { ok: false, message: triggered.message };
}
