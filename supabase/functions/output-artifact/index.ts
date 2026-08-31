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
/**
 * What a run may hand back.
 *
 * `text/html` is here because ORCA Produce's generated-output tool, Return
 * Draft, declares its output type as html — a governed HTML return, not a
 * file. Without it that connector answers 415 on every successful run and the
 * draft is refused at the door, which reads from Yoxa as the workflow failing
 * when in fact it worked and the receiver would not take it.
 *
 * The list stays a list rather than becoming "anything". An artefact route
 * that accepts arbitrary content types is a file-upload endpoint with a nicer
 * name, and this one writes into a patient's record.
 */
const ALLOWED = [
  'application/pdf',
  'text/html',
  'text/plain',
  'image/png',
  'image/jpeg',
]

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

    // One run, one document.
    //
    // Every call used to mint a fresh id, so a workflow that produced an
    // artefact at three stages left three unrelated part-documents on the
    // record — none of them the thing anyone wanted, and no way to tell from
    // the list which was which or that they belonged together. A person
    // looking for "the letter to my employer" found three files called
    // Generated artefact.
    //
    // A run is one piece of work, so it gets one document, and later calls add
    // to it rather than starting again. What arrives at the end is the whole
    // thing: every file the run produced, and every summary it wrote, kept in
    // the order they were made.
    const { data: existing } = workflowRunId
      ? await admin
          .from('documents')
          .select('id, title, extracted, storage_path')
          .eq('workflow_run_id', workflowRunId)
          .maybeSingle()
      : { data: null }

    const documentId = existing?.id ?? `doc-${crypto.randomUUID().slice(0, 8)}`
    const isAddition = Boolean(existing)
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

    // Sections accumulate in the order they were written, each labelled with
    // the stage that produced it. A document that says which part came from
    // where can be read; one long unattributed blob cannot.
    const section = str(body.section) ?? str(body.stage)
    const priorSections = Array.isArray(existing?.extracted)
      ? (existing!.extracted as { label: string; value: string; accepted: boolean }[])
      : []
    const newSection = summary
      ? [{ label: section ?? (isAddition ? `Part ${priorSections.length + 1}` : 'Summary'), value: summary, accepted: false }]
      : []

    const row = {
      patient_id: patientId,
      // A later, more specific title wins over the placeholder the first call
      // used; a placeholder never overwrites a real one.
      title: isAddition && title === 'Generated artefact' ? existing!.title : title,
      // Named for what a person would call it, not for its MIME type. An HTML
      // return is a document to read, so it files as a Document rather than as
      // "Structured", which is the shelf for extracted data.
      file_type:
        files[0]?.contentType === 'application/pdf'
          ? 'PDF'
          : files[0]?.contentType?.startsWith('image/')
            ? 'Image'
            : files[0]?.contentType === 'text/html' || files[0]?.contentType === 'text/plain'
              ? 'Document'
              : 'Structured',
      category,
      source_label: 'ORCA workflow',
      status: files.length || priorSections.length ? 'Awaiting review' : 'Draft',
      extracted: [...priorSections, ...newSection],
      access,
      storage_path: existing?.storage_path ?? stored[0]?.storage_path ?? null,
      workflow_run_id: workflowRunId,
    }

    const { error: docError } = isAddition
      ? await admin.from('documents').update(row).eq('id', documentId)
      : await admin.from('documents').insert({ id: documentId, ...row })

    if (docError) return json({ error: docError.message }, 400)

    await recordAudit({
      actorLabel: 'ORCA Reasoning, Support & Action agent',
      patientId,
      action: isAddition
        ? `Added to the run's artefact (${files.length} file${files.length === 1 ? '' : 's'})`
        : `Stored generated artefact (${files.length} file${files.length === 1 ? '' : 's'})`,
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
