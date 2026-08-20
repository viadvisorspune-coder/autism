/**
 * output_artifact_service — receives the approved artefact.
 *
 * Yoxa's generated output tools produce PDFs during a run and attach them to
 * this connector as multipart parts named `files`. It must also accept an
 * ordinary JSON request, because the API Connection Check sends no files at
 * all — requiring one would fail the check for the wrong reason.
 *
 * Artefacts land in a private bucket and are recorded as documents on the
 * patient's own record. Nothing here is published, emailed or made public.
 */
import { admin, guard, json, list, recordAudit, str } from '../_shared/yoxa.ts'

const MAX_FILES = 10
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024
const MAX_BYTES_TOTAL = 100 * 1024 * 1024
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) || 'artifact'

Deno.serve(
  guard(async (_req, { body, files }) => {
    const patientId = str(body.patient_id)
    const title = str(body.title) ?? 'Generated artefact'
    const category = str(body.category) ?? 'Personal'
    const recipient = str(body.recipient)
    const summary = str(body.summary)
    const workflowRunId = str(body.workflow_run_id)
    const access = list(body.access).length ? list(body.access) : ['patient']

    if (!patientId) return json({ error: 'patient_id is required' }, 400)

    if (files.length > MAX_FILES) {
      return json({ error: `at most ${MAX_FILES} files may be attached` }, 413)
    }
    const total = files.reduce((sum, f) => sum + f.bytes.byteLength, 0)
    if (total > MAX_BYTES_TOTAL) return json({ error: 'attachments exceed 100 MiB in total' }, 413)

    for (const file of files) {
      if (file.bytes.byteLength > MAX_BYTES_PER_FILE) {
        return json({ error: `${file.name} exceeds 50 MiB` }, 413)
      }
      if (!ALLOWED.includes(file.contentType)) {
        return json({ error: `${file.contentType} is not an accepted artefact type` }, 415)
      }
    }

    const documentId = `doc-${crypto.randomUUID().slice(0, 8)}`
    const stored: { file_name: string; content_type: string; size_bytes: number; storage_path: string }[] = []

    for (const file of files) {
      const path = `${patientId}/${documentId}/${safeName(file.name)}`
      const { error } = await admin.storage
        .from('orca-artifacts')
        .upload(path, file.bytes, { contentType: file.contentType, upsert: false })

      if (error) return json({ error: `storage: ${error.message}` }, 400)

      stored.push({
        file_name: file.name,
        content_type: file.contentType,
        size_bytes: file.bytes.byteLength,
        storage_path: path,
      })
    }

    const { error: docError } = await admin.from('documents').insert({
      id: documentId,
      patient_id: patientId,
      title,
      file_type: files[0]?.contentType === 'application/pdf' ? 'PDF' : 'Structured',
      category,
      source_label: 'ORCA workflow',
      status: files.length ? 'Awaiting review' : 'Draft',
      extracted: summary ? [{ label: 'Summary', value: summary, accepted: false }] : [],
      access,
      storage_path: stored[0]?.storage_path ?? null,
      workflow_run_id: workflowRunId,
    })

    if (docError) return json({ error: docError.message }, 400)

    await recordAudit({
      actorLabel: 'ORCA Reasoning, Support & Action agent',
      patientId,
      action: `Stored generated artefact (${files.length} file${files.length === 1 ? '' : 's'})`,
      record: `Document ${documentId}`,
      accessType: 'Write',
      why: recipient ? `Prepared for ${recipient}` : 'Workflow output',
      result: 'Allowed',
      workflowRunId,
    })

    return json({
      document_id: documentId,
      patient_id: patientId,
      title,
      status: files.length ? 'Awaiting review' : 'Draft',
      received_file_count: files.length,
      stored_files: stored,
      note: files.length
        ? 'Stored privately on the patient’s record. It is not shared with anyone until the patient approves a disclosure.'
        : 'No files were attached. Accepted as a connection check.',
    })
  }),
)
