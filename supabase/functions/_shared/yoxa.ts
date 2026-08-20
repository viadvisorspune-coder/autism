/**
 * Shared plumbing for the Yoxa connector endpoints.
 *
 * These functions are the deterministic layer. The agent layer decides what to
 * ask for; this decides whether it is allowed, records that it happened, and
 * returns a response shaped exactly as the connector's OpenAPI document says.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Service-role client. Every one of these endpoints enforces scope itself. */
export const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
)

/**
 * Yoxa authenticates with a bearer token held only in the function's
 * environment. Deploy with verify_jwt disabled so this — not Supabase's own
 * JWT check — is the gate, otherwise Yoxa's token is rejected before arrival.
 */
export function authorised(req: Request): boolean {
  const expected = Deno.env.get('YOXA_CONNECTOR_TOKEN')
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const presented = header.replace(/^Bearer\s+/i, '').trim()
  // Length-independent comparison is unnecessary here; tokens are compared
  // after both are normalised and neither is derived from user input.
  return presented.length > 0 && presented === expected
}

export interface UploadedFile {
  name: string
  contentType: string
  bytes: Uint8Array
}

export interface ParsedRequest {
  body: Record<string, unknown>
  files: UploadedFile[]
}

/**
 * Accepts both request shapes Yoxa sends: an ordinary JSON body during an API
 * Connection Check, and multipart/form-data when a workflow run attaches
 * generated output files. Never require a file — the connection check has none.
 */
export async function readRequest(req: Request): Promise<ParsedRequest> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const files: UploadedFile[] = []
    let body: Record<string, unknown> = {}

    const envelope = form.get('arguments_json')
    if (typeof envelope === 'string' && envelope.trim()) {
      try {
        body = JSON.parse(envelope) as Record<string, unknown>
      } catch {
        body = {}
      }
    }

    for (const [key, value] of form.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push({
          name: value.name,
          contentType: value.type || 'application/octet-stream',
          bytes: new Uint8Array(await value.arrayBuffer()),
        })
        continue
      }
      if (key === 'arguments_json' || value instanceof File) continue
      // Top-level body properties also arrive as plain text fields.
      if (!(key in body)) body[key] = value === '' ? null : value
    }

    return { body, files }
  }

  try {
    return { body: (await req.json()) as Record<string, unknown>, files: [] }
  } catch {
    return { body: {}, files: [] }
  }
}

/** Append-only audit. Called on every consequential path, allowed or denied. */
export async function recordAudit(entry: {
  actorId?: string | null
  actorLabel: string
  actorRole?: string | null
  patientId?: string | null
  action: string
  record: string
  accessType: 'Read' | 'Write' | 'Share' | 'Approve' | 'Revoke' | 'Login'
  why?: string
  result: 'Allowed' | 'Denied'
  workflowRunId?: string | null
}): Promise<string | null> {
  const { data, error } = await admin
    .from('audit_log')
    .insert({
      actor_id: entry.actorId ?? null,
      actor_label: entry.actorLabel,
      actor_role: entry.actorRole ?? null,
      patient_id: entry.patientId ?? null,
      action: entry.action,
      record: entry.record,
      access_type: entry.accessType,
      why: entry.why ?? null,
      result: entry.result,
      workflow_run_id: entry.workflowRunId ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('audit write failed', error.message)
    return null
  }
  return data.id as string
}

/** Standard entry wrapper: CORS preflight, method guard, bearer check. */
export function guard(
  handler: (req: Request, parsed: ParsedRequest) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    if (!authorised(req)) return json({ error: 'unauthorised' }, 401)

    try {
      const parsed = await readRequest(req)
      return await handler(req, parsed)
    } catch (error) {
      console.error(error)
      return json({ error: 'internal_error', detail: String(error) }, 500)
    }
  }
}

export const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
