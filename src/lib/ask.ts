/**
 * Asking ORCA from anywhere.
 *
 * The copilot lives in the shell and the shortcuts that want to use it live on
 * individual screens, several layers down. Threading a callback through every
 * one of those would mean every screen knowing about the copilot, which is a
 * lot of coupling to buy one button.
 *
 * A window event is enough: a shortcut announces a question, the shell opens
 * the panel and hands it over. Nothing else in the app needs to know either
 * side exists.
 */

export const ASK_EVENT = 'orca:ask'

export function askOrca(question: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: question }))
}

export function onAskOrca(handler: (question: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<string>).detail)
  window.addEventListener(ASK_EVENT, listener)
  return () => window.removeEventListener(ASK_EVENT, listener)
}
