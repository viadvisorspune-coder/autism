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
      },
    })

    if (error) return 'The decision could not be sent.'
    if (data?.already_answered) return null
    return null
  } catch {
    return 'The decision could not be sent.'
  }
}
