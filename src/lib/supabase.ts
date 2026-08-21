import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Which variable names are absent, by name.
 *
 * "No backend configured" is true but useless when you are standing in a
 * hosting dashboard wondering which of two things you typed wrong. Naming the
 * missing variable turns a guessing game into one line of instruction — and
 * these are public values, so naming them costs nothing.
 */
export const missingEnv: string[] = [
  url ? null : 'VITE_SUPABASE_URL',
  publishableKey ? null : 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter((name): name is string => name !== null)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('[ORCA] No Supabase credentials found — running on mock data. See .env.example.')
}

/**
 * Built on first use, not at module load.
 *
 * createClient throws when the URL is missing, and this module is imported by
 * the boot path — so constructing it eagerly took an unconfigured deployment
 * from "runs on demonstration data" to a blank white page, before React ran at
 * all. A missing backend is a condition this app is designed to survive; it
 * must never be a condition that stops it starting.
 *
 * Every caller checks isSupabaseConfigured first, so the throw below is
 * unreachable in practice and exists to be loud if that ever stops being true.
 */
let client: SupabaseClient | null = null

function real(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this build. Check isSupabaseConfigured first.')
  }
  if (!client) {
    client = createClient(url as string, publishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/** Same shape as the client, resolved lazily on first property access. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(real(), property, receiver)
  },
})
