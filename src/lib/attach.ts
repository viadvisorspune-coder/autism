/**
 * Sending a file the person is holding.
 *
 * ORCA could already produce documents and show them, and had no way to
 * receive one. That is the wrong way round for a product about somebody's own
 * record: a person with a letter from occupational health or a photo of a rota
 * has the most relevant thing in the room, and typing a description of it is a
 * worse version of handing it over.
 *
 * Uploaded before the question is sent rather than alongside it, so the
 * trigger can say a file exists. A workflow cannot open the file — it reads
 * text — but being told there is one, what kind, and what it is called is
 * enough to acknowledge it rather than answer as though nothing was provided.
 */

import { isSupabaseConfigured, supabase } from './supabase'

export interface Attached {
  documentId: string
  title: string
  fileType: string
  /** One sentence for the trigger, written by the server that stored it. */
  describe: string
}

export type AttachResult = { ok: true; file: Attached } | { ok: false; error: string }

/** What the file picker offers, matching what the server will accept. */
export const ACCEPTED_FILES =
  'application/pdf,text/plain,text/markdown,text/csv,image/png,image/jpeg,image/webp,image/heic,audio/mpeg,audio/wav,audio/mp4,audio/webm,video/mp4,video/webm'

export async function attachFile(
  file: File,
  patientId: string,
  actorId: string,
): Promise<AttachResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'This build has no backend, so the file was not saved.' }
  }

  const form = new FormData()
  form.append('files', file)
  /**
   * The other fields travel as an envelope, not as loose parts.
   *
   * The shared multipart reader looks for `arguments_json` first and treats
   * every other non-file field as a plain string. Sending them individually
   * works, but this keeps one shape across every function that takes files.
   */
  form.append(
    'arguments_json',
    JSON.stringify({ patient_id: patientId, actor_id: actorId, title: file.name }),
  )

  try {
    const { data, error } = await supabase.functions.invoke('orca-attach', { body: form })

    if (error) {
      /**
       * The server's own sentence, where it wrote one.
       *
       * Refusals here are specific and actionable — the file is too large, or
       * a type ORCA cannot read — and replacing them with "upload failed"
       * throws away the only part that tells somebody what to do next.
       */
      const detail = await reason(error)
      return { ok: false, error: detail ?? 'That file could not be added.' }
    }

    return {
      ok: true,
      file: {
        documentId: String(data.document_id),
        title: String(data.title ?? file.name),
        fileType: String(data.file_type ?? 'File'),
        describe: String(data.describe ?? ''),
      },
    }
  } catch {
    return { ok: false, error: 'That file could not be added. Check your connection.' }
  }
}

/** A refusal is an answer, and it carries a reason worth showing. */
async function reason(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context
  if (!context) return null
  try {
    const parsed =
      context instanceof Response
        ? await context.clone().json()
        : (context as { body?: unknown }).body
    const record = (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as Record<
      string,
      unknown
    > | null
    if (record && typeof record.detail === 'string') return record.detail
    return null
  } catch {
    return null
  }
}
