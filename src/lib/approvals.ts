import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Sends a person's decision back to the workflow that is waiting on it.
 *
 * The response secret lives in the Edge Function, never here — that is the
 * whole reason `hitl-respond` exists rather than this file posting to Yoxa
 * directly. A browser that can answer an approval on its own is a browser that
 * can answer somebody else's.
 *
 * Returns null when the decision was sent, or a sentence to show the person
 * when it was not. Never throws: an approval screen that breaks silently is
 * worse than one that says it could not send.
 */
export async function respondToApproval(
  requestId: string,
  optionId: string | null,
  message: string | null,
  actorId: string | null,
): Promise<string | null> {
  if (!isSupabaseConfigured) {
    return 'This build has no backend configured, so the decision could not be sent.'
  }

  try {
    const { data, error } = await supabase.functions.invoke('hitl-respond', {
      body: {
        request_id: requestId,
        selected_option_id: optionId ?? undefined,
        override_message: message ?? undefined,
        /**
         * Who is deciding.
         *
         * Omitting this was a silent, total failure. `hitl-respond` resolves
         * the actor from a real session first and falls back to an asserted
         * `actor_id` — and ORCA has no sign-in, so there is never a session
         * and the fallback was all there was. With no `actor_id` in the body
         * every decision came back 401, which the caller reported as the
         * generic "could not be sent". The approval stayed open, the run
         * stayed parked, and nothing said why.
         *
         * Asserted rather than proven, which is only acceptable because this
         * is a prototype on synthetic data. `hitl-respond` still checks the
         * actor against the record's scope before it accepts the decision, so
         * a claimed identity cannot answer an approval it has no connection
         * to — it can only claim to be someone who could.
         */
        actor_id: actorId ?? undefined,
      },
    })

    if (error) return 'The decision could not be sent.'
    if (data?.already_answered) return null
    return null
  } catch {
    return 'The decision could not be sent.'
  }
}
