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

export function readQuestion(personId: string): string {
  if (!personId) return ''
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
    if (text.trim()) sessionStorage.setItem(KEY(personId), text)
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
