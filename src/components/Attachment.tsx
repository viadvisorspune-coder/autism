import { Link } from 'react-router-dom'
import type { Attachment } from '../lib/live'

/**
 * The document, in the conversation that asked for it.
 *
 * Asking for a report and being told "it has been saved to your documents" is
 * a system describing its own filing cabinet instead of answering. The person
 * asked here. The thing arrives here, under the sentence that promised it,
 * and opening it is one press rather than a navigation.
 *
 * Two states, both honest. When the file is ready there is a link to it and a
 * note that it expires — because it does, and a link that silently stops
 * working is worse than one that said it would. When the run recorded the
 * document but has not written the bytes yet, it says so rather than offering
 * a button that fails.
 */
export function AttachmentCard({ file }: { file: Attachment }) {
  const kind = (file.file_type || 'FILE').toUpperCase()

  return (
    <div className="mt-3 rounded-[18px] bg-surface-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 shrink-0 rounded-[10px] bg-brand-tint px-2 py-1 text-[0.68rem] font-bold tracking-[0.04em] text-brand-ink"
        >
          {kind}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-medium text-ink">{file.title}</p>
          <p className="mt-0.5 text-[0.8rem] text-muted">{file.category}</p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {file.url ? (
              <>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-brand px-3 py-1.5 text-[0.83rem] font-medium text-white hover:bg-brand-ink"
                >
                  Open it
                </a>
                <span className="text-[0.76rem] text-muted">This link works for 30 minutes.</span>
              </>
            ) : (
              <span className="text-[0.8rem] text-state-wait">
                Still being written. It will appear here when it is ready.
              </span>
            )}
            <Link
              to={`/patient/documents/${file.id}`}
              className="text-[0.83rem] font-medium text-brand underline-offset-2 hover:underline"
            >
              Keep it in documents
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Which files belong under which message.
 *
 * A run produces one document and one message announcing it, and both carry
 * the same `workflow_run_id`. Attaching on that rather than on time order
 * means a slow run whose document lands after three more messages still puts
 * it under the right one.
 */
export function filesForRun(
  attachments: Attachment[] | undefined,
  runId: string | null | undefined,
): Attachment[] {
  if (!attachments?.length || !runId) return []
  return attachments.filter((a) => a.workflow_run_id === runId)
}
