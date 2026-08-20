import { createClient } from '@supabase/supabase-js'

/**
 * The Supabase client for the browser.
 *
 * Both values below are public by design — they are compiled into the bundle
 * every visitor downloads. What actually protects the record is row-level
 * security in Postgres: access is a deterministic backend decision, never
 * something the frontend or the agent layer is trusted to make.
 *
 * The service_role key must never appear in this application.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * True when the app has been given a backend to talk to. While this is false
 * the UI runs on the mock system-of-record in `src/data/`, which is how the
 * prototype works today.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('[ORCA] No Supabase credentials found — running on mock data. See .env.example.')
}

export const supabase = createClient(url ?? '', publishableKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
