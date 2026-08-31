/**
 * Work in progress, kept.
 *
 * The New document form held everything in component state, so pressing Cancel,
 * navigating away, or reloading threw away four fields with no warning and no
 * way back. For somebody who finds composing the thing the expensive part, that
 * is not a small loss — it is the whole task, silently.
 *
 * Two rules, and the second is the one that is usually missing:
 *
 *   NOTHING IS DISCARDED WITHOUT BEING ASKED. Cancel on a form with content in
 *   it asks first, and names what would be lost.
 *
 *   AN UNFINISHED THING SAYS SO WHERE IT LIVES. A draft nobody can find is a
 *   draft that was lost with extra steps, so it appears on Documents with what
 *   it is and when it was last touched. The person should not have to remember
 *   they had an unfinished task.
 *
 * Local storage rather than the record. A half-written document is not a fact
 * about anybody's health and has no business being stored beside things that
 * are; it is a fact about this browser, on this device, and belongs here until
 * the person decides it is finished.
 */

export interface DocumentDraft {
  type: string
  recipient: string
  from: string
  to: string
  purpose: string
  /** Whose record it is about, so a draft never reappears under the wrong one. */
  subjectId: string
  savedAt: string
}

const KEY = (personId: string) => `orca.draft.document.${personId}`

export function readDraft(personId: string): DocumentDraft | null {
  if (!personId) return null
  try {
    const raw = window.localStorage.getItem(KEY(personId))
    return raw ? (JSON.parse(raw) as DocumentDraft) : null
  } catch {
    return null
  }
}

/**
 * Saved only when there is something to save.
 *
 * An empty form is not a draft, and writing one would put "Continue your
 * draft" on the Documents screen for somebody who opened a form and changed
 * their mind — which teaches people that the prompt means nothing.
 */
export function writeDraft(personId: string, draft: Omit<DocumentDraft, 'savedAt'>): void {
  if (!personId) return
  if (!hasContent(draft)) {
    clearDraft(personId)
    return
  }
  try {
    window.localStorage.setItem(
      KEY(personId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    )
  } catch {
    /* Private browsing. The draft holds for this screen only. */
  }
}

export function clearDraft(personId: string): void {
  if (!personId) return
  try {
    window.localStorage.removeItem(KEY(personId))
  } catch {
    /* Nothing stored, nothing to clear. */
  }
}

/**
 * Whether anything has been filled in beyond the defaults.
 *
 * The type field arrives pre-selected, so it does not count on its own — a
 * form whose only content is the value it opened with has not been worked on.
 */
export function hasContent(draft: Omit<DocumentDraft, 'savedAt'>): boolean {
  return Boolean(
    draft.recipient.trim() || draft.from.trim() || draft.to.trim() || draft.purpose.trim(),
  )
}

/** How long ago, in words, for the card that offers it back. */
export function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'less than a minute ago'
  if (minutes === 1) return 'a minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours === 1) return 'an hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
