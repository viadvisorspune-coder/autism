/**
 * A file a person adds to their own record from the chat.
 *
 * ORCA could already produce documents — `output-artifact` receives what a
 * workflow generates — and could show them. It had no way to receive one from
 * the person whose record it is. That asymmetry is the wrong way round for
 * this product: somebody holding a letter from occupational health, a
 * screenshot of a rota, or a page of their own notes has the most relevant
 * thing in the room and nowhere to put it.
 *
 * WHY A SEPARATE FUNCTION. `app-write` speaks JSON and is the wrong shape for
 * bytes; `output-artifact` speaks multipart but authenticates with the Yoxa
 * connector token, because it exists for workflows rather than people. Sharing
 * either would mean widening an audience to fit a payload, which is how a
 * connector endpoint quietly becomes a public upload.
 *
 * WHAT IT ACCEPTS. Text, PDF, images and audio — the formats somebody
 * plausibly holds evidence in. Anything else is refused by name rather than
 * silently ignored, because a person who attached a file and saw nothing
 * happen has no way to tell refusal from failure.
 */

import { admin, cors, json, readRequest, recordAudit, str } from '../_shared/yoxa.ts'
import { actorFromRequest, forbidden, mayActOnPatient, unauthorised } from '../_shared/app.ts'

const MAX_BYTES = 25 * 1024 * 1024

/**
 * What a person may attach.
 *
 * Wider than what a workflow may return, and deliberately so: a workflow
 * produces documents, while a person contributes evidence, and evidence
 * arrives as whatever they were given. A voice note describing a difficult
 * morning is a legitimate record entry.
 */
const ALLOWED: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'Text',
  'text/markdown': 'Text',
  'text/csv': 'Spreadsheet',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'image/webp': 'Image',
  'image/heic': 'Image',
  'audio/mpeg': 'Audio',
  'audio/wav': 'Audio',
  'audio/mp4': 'Audio',
  'audio/webm': 'Audio',
  'video/mp4': 'Video',
  'video/webm': 'Video',
}

/**
 * What to call a file type when telling somebody it was refused.
 *
 * Falls back to the extension, then to "that kind of file" — never to the MIME
 * type, which is the one thing guaranteed to mean nothing to the person
 * reading it.
 */
const FAMILIAR: [RegExp, string][] = [
  [/wordprocessingml|msword/, 'a Word document'],
  [/spreadsheetml|ms-excel/, 'an Excel spreadsheet'],
  [/presentationml|ms-powerpoint/, 'a PowerPoint file'],
  [/zip|compressed/, 'a zip file'],
  [/rtf/, 'a rich text file'],
  [/^image\//, 'that image format'],
  [/^audio\//, 'that audio format'],
  [/^video\//, 'that video format'],
]

function describeType(contentType: string, fileName: string): string {
  for (const [pattern, name] of FAMILIAR) if (pattern.test(contentType)) return name
  const ext = fileName.match(/\.([a-z0-9]{1,6})$/i)?.[1]
  return ext ? `.${ext.toLowerCase()} files` : 'that kind of file'
}

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'attachment'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const { body, files } = await readRequest(req)

  const actor = await actorFromRequest(req, body)
  if (!actor) return unauthorised()

  const patientId = str(body.patient_id)
  if (!patientId) return json({ error: 'patient_id is required' }, 400)
  if (!(await mayActOnPatient(actor.id, patientId))) {
    return forbidden('You do not have access to this record.')
  }

  if (!files.length) return json({ error: 'no file was sent' }, 400)
  const file = files[0]

  if (file.bytes.byteLength > MAX_BYTES) {
    return json(
      {
        error: 'too_large',
        detail: 'That file is larger than 25 MB. Try a smaller version of it.',
      },
      413,
    )
  }

  const kind = ALLOWED[file.contentType]
  if (!kind) {
    /**
     * Refused in words a person can read.
     *
     * The first version printed the MIME type back —
     * "ORCA cannot read application/vnd.openxmlformats-officedocument.
     * wordprocessingml.document" — which is technically precise and useless
     * to the person holding the file. Saying "a Word document" tells them
     * what to convert, which is the only thing the message is for.
     *
     * Refused by name rather than ignored, because somebody who attached a
     * file and saw nothing happen cannot tell refusal from failure and will
     * try the same file again.
     */
    return json(
      {
        error: 'unsupported_type',
        detail:
          `ORCA cannot read ${describeType(file.contentType, file.name)}. ` +
          'It accepts PDFs, plain text, images, audio and video. ' +
          'Saving it as a PDF usually works.',
      },
      415,
    )
  }

  const documentId = `doc-${crypto.randomUUID().slice(0, 8)}`
  const path = `${patientId}/${documentId}/${safeName(file.name)}`

  const { error: storeError } = await admin.storage
    .from('orca-artifacts')
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false })
  if (storeError) return json({ error: 'storage', detail: storeError.message }, 400)

  /**
   * Recorded as coming from the person, not from ORCA.
   *
   * Provenance is the point of the whole record. A letter somebody uploaded
   * and a letter a workflow generated are different kinds of evidence, and a
   * reader who cannot tell them apart cannot weigh either.
   */
  const { error: docError } = await admin.from('documents').insert({
    id: documentId,
    patient_id: patientId,
    title: str(body.title) ?? file.name,
    file_type: kind,
    category: 'Provided by the person',
    storage_path: path,
    workflow_run_id: str(body.workflow_run_id),
    recorded_on: new Date().toISOString().slice(0, 10),
    source_id: actor.id,
    source_label: `${actor.name}${actor.role ? `, ${actor.role}` : ''}`,
    status: 'Recorded',
  })
  if (docError) return json({ error: docError.message }, 400)

  await recordAudit({
    actorId: actor.id,
    actorLabel: actor.name,
    actorRole: actor.role,
    patientId,
    action: 'Added a file to the record',
    record: `${file.name} (${kind})`,
    accessType: 'Write',
    why: 'Attached to a question in ORCA chat',
    result: 'Allowed',
    workflowRunId: str(body.workflow_run_id),
  })

  return json({
    document_id: documentId,
    title: str(body.title) ?? file.name,
    file_type: kind,
    /**
     * A sentence the trigger can carry.
     *
     * A workflow reading a trigger cannot open a file, but it can be told one
     * exists, what kind, and what it is called — which is enough to say so in
     * an answer rather than behaving as though nothing had been provided.
     */
    describe: `The person attached a ${kind.toLowerCase()} named "${file.name}" with this question.`,
  })
})
