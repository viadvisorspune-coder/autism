/**
 * Helpers for the endpoints ORCA's own frontend calls.
 *
 * These differ from the Yoxa connectors: the caller is a signed-in person, so
 * the gate is their Supabase session, and the endpoint still has to check that
 * this particular person may act on this particular record.
 */
import { admin, json } from './yoxa.ts'

export interface AppActor {
  id: string
  name: string
  role: string
}

/**
 * The actor, from a real session where there is one.
 *
 * DEMO BOUNDARY: ORCA has no sign-in yet, so when ORCA_DEMO_MODE is set the
 * caller may name the actor instead of proving it. Scope is still enforced —
 * mayActOnPatient runs either way — but identity is asserted, not verified.
 * The flag is deliberately opt-in per project: forget to set it in production
 * and the asserted path simply does not exist.
 */
export async function actorFromRequest(
  req: Request,
  body: Record<string, unknown>,
): Promise<AppActor | null> {
  const real = await currentActor(req)
  if (real) return real

  if (Deno.env.get('ORCA_DEMO_MODE') !== 'true') return null

  const claimed = typeof body.actor_id === 'string' ? body.actor_id : null
  if (!claimed) return null

  const { data } = await admin
    .from('app_users')
    .select('id, name, role')
    .eq('id', claimed)
    .maybeSingle()

  return data ?? null
}

/** Resolve the signed-in user from the Authorization header, or null. */
export async function currentActor(req: Request): Promise<AppActor | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: appUser } = await admin
    .from('app_users')
    .select('id, name, role')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()

  return appUser ?? null
}

/** True when this person owns the record or holds a live connection to it. */
export async function mayActOnPatient(actorId: string, patientId: string): Promise<boolean> {
  const { data: patient } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle()

  if (patient?.user_id === actorId) return true

  const { data: connection } = await admin
    .from('connections')
    .select('consent_status, review_due')
    .eq('patient_id', patientId)
    .eq('person_id', actorId)
    .maybeSingle()

  if (!connection || connection.consent_status !== 'Active') return false
  return !connection.review_due || new Date(connection.review_due) >= new Date()
}

/** The Yoxa origin is derived from the trigger URL rather than configured twice. */
export function yoxaOrigin(): string | null {
  const trigger = Deno.env.get('YOXA_TRIGGER_URL')
  if (!trigger) return null
  try {
    return new URL(trigger).origin
  } catch {
    return null
  }
}

export function unauthorised(): Response {
  return json({ error: 'sign_in_required' }, 401)
}

export function forbidden(reason: string): Response {
  return json({ error: 'not_permitted', reason }, 403)
}
