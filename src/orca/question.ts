/**
 * A half-written question, kept.
 *
 * The document composer has saved its four fields on every keystroke since it
 * was built, on the argument that a draft you have to remember to save is not a
 * draft but a quiz. The Ask box had none of that: a question typed and then
 * interrupted — a nav press, a Back, a tab closed, a phone locking — was gone,
 * silently and completely.
 *
 * That is the more expensive loss of the two. Somebody composing a question
 * about their own health has often spent longer on the sentence than on
 * anything else in the session, and for the people this product is for, being
 * asked to write it a second time is the whole task again rather than a
 * nuisance.
 *
 * Session storage, not local: per tab and gone when the browser closes. A
 * question is a thing in flight, not a document, and one half-typed on a shared
 * laptop should not be waiting there next week.
 */
const KEY = (personId: string) => `orca:question:${personId}`

/**
 * Whether this device keeps half-written things at all.
 *
 * A control on Adjust, because the answer is different on a phone in somebody's
 * own pocket and on a clinic machine three people share. Kept in
 * `localStorage` rather than session, since the setting has to outlive the tab
 * it was set in — the draft it governs deliberately does not.
 *
 * Defaults to keeping. The failure it prevents — losing a sentence somebody
 * found expensive to write — happens to everybody, and the failure it risks
 * only happens where a device is shared, which the person can say.
 */
const KEEP_KEY = 'orca:keep-drafts'

export function keepingDrafts(): boolean {
  try {
    return localStorage.getItem(KEEP_KEY) !== 'no'
  } catch {
    return true
  }
}

export function setKeepingDrafts(keep: boolean): void {
  try {
    localStorage.setItem(KEEP_KEY, keep ? 'yes' : 'no')
  } catch {
    /* The setting applies for this session and no longer. */
  }
}

export function readQuestion(personId: string): string {
  if (!personId || !keepingDrafts()) return ''
  try {
    return sessionStorage.getItem(KEY(personId)) ?? ''
  } catch {
    // Private browsing. The box is simply empty, which is what it was before.
    return ''
  }
}

export function writeQuestion(personId: string, text: string): void {
  if (!personId) return
  try {
    if (text.trim() && keepingDrafts()) sessionStorage.setItem(KEY(personId), text)
    else sessionStorage.removeItem(KEY(personId))
  } catch {
    /* Nothing to do and nothing worth saying: the box still holds the text. */
  }
}

export function clearQuestion(personId: string): void {
  if (!personId) return
  try {
    sessionStorage.removeItem(KEY(personId))
  } catch {
    /* Same. */
  }
}
