import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Artifact storage, backed by Supabase Storage.
 *
 * The bucket is private: nothing here is readable by URL. Reads go through
 * `signedUrlFor`, which is called only after the caller's access has been
 * checked, and the signature expires.
 */

export const ARTIFACT_BUCKET = "artifacts";

export interface StoredFile {
  storageKey: string;
  byteSize: number;
}

/** Strip any path component a remote filename might carry. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}

export async function storeFile(
  patientId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<StoredFile> {
  // Keyed by patient so a bucket policy can be scoped by prefix later.
  const key = `${patientId}/${randomUUID()}-${safeFilename(filename)}`;

  const { error } = await createAdminClient()
    .storage.from(ARTIFACT_BUCKET)
    .upload(key, bytes, { contentType, upsert: false });

  if (error) {
    throw new Error(`Artifact upload failed: ${error.message}`);
  }

  return { storageKey: key, byteSize: bytes.byteLength };
}

/** Short-lived download URL. Call only after checking the reader's access. */
export async function signedUrlFor(
  storageKey: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await createAdminClient()
    .storage.from(ARTIFACT_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Could not sign artifact URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
