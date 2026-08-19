import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { artifacts, workflowRuns } from "@/db/schema";
import { errorResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { safeFilename, storeFile } from "@/lib/storage";
import { authenticateYoxa } from "@/lib/yoxa/auth";
import { artifactRequest } from "@/lib/yoxa/contracts";

/**
 * Backs `output_artifact_service` — receiving the PDFs Yoxa's output tools
 * generate (steps 9, 11 and 12).
 *
 * Yoxa sends this endpoint two different transports, and both must work:
 *
 *  - An API Connection Check sends ordinary JSON with no files. It must
 *    succeed, so a missing file is not an error.
 *  - A workflow run with attachments selected sends multipart/form-data: each
 *    top-level JSON property as a text field, the whole body again as
 *    `arguments_json`, and one repeated `files` part per generated file.
 *
 * The uploaded OpenAPI file describes only the JSON shape. The multipart
 * envelope is Yoxa's runtime convention, not a documented input.
 */

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
]);

interface Incoming {
  fields: Record<string, unknown>;
  files: File[];
}

async function parseIncoming(request: Request): Promise<Incoming | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files: File[] = [];
    const fields: Record<string, unknown> = {};

    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        // Only the reserved `files` part carries generated attachments.
        if (key === "files") files.push(value);
        continue;
      }
      if (key === "arguments_json") continue;
      fields[key] = value;
    }

    // The complete constructed body is the more reliable source when present.
    const argumentsJson = form.get("arguments_json");
    if (typeof argumentsJson === "string" && argumentsJson.length > 0) {
      try {
        const parsed: unknown = JSON.parse(argumentsJson);
        if (parsed && typeof parsed === "object") {
          Object.assign(fields, parsed as Record<string, unknown>);
        }
      } catch {
        // Fall back to the individual text fields rather than failing the run.
      }
    }

    return { fields, files };
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return null;
    return { fields: body as Record<string, unknown>, files: [] };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = authenticateYoxa(request);
  if (!auth.ok) return errorResponse(auth.status, auth.message);

  const incoming = await parseIncoming(request);
  if (!incoming) {
    return errorResponse(400, "Request body could not be parsed.");
  }

  const parsed = artifactRequest.safeParse(incoming.fields);
  if (!parsed.success) {
    return errorResponse(
      422,
      "Request body failed validation.",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    );
  }
  const body = parsed.data;

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

  const { files } = incoming;

  if (files.length > MAX_FILES) {
    return errorResponse(413, `At most ${MAX_FILES} files may be attached.`);
  }
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(413, `"${safeFilename(file.name)}" exceeds 50 MiB.`);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return errorResponse(
        415,
        `Content type "${file.type}" is not accepted.`,
      );
    }
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return errorResponse(413, "Attached files exceed 100 MiB in total.");
  }

  const stored: { artifact_id: string; filename: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { storageKey, byteSize } = await storeFile(
      body.patient_id,
      file.name,
      bytes,
      file.type,
    );
    const [row] = await db
      .insert(artifacts)
      .values({
        workflowRunId: body.workflow_run_id,
        patientId: body.patient_id,
        filename: safeFilename(file.name),
        contentType: file.type,
        byteSize,
        storageKey,
        recipientUserId: body.recipient_user_id ?? null,
        approvalId: body.approval_id ?? null,
      })
      .returning();
    stored.push({ artifact_id: row.id, filename: row.filename });
  }

  await recordAudit({
    patientId: body.patient_id,
    workflowRunId: body.workflow_run_id,
    actor: "yoxa",
    action: files.length > 0 ? "artifact.received" : "artifact.check",
    detail: { title: body.title, file_count: files.length },
  });

  // The same envelope is returned whether or not files arrived, so the response
  // schema in the uploaded OpenAPI file holds for a connection check too.
  return NextResponse.json({
    workflow_run_id: body.workflow_run_id,
    title: body.title,
    received_count: stored.length,
    artifacts: stored,
  });
}
