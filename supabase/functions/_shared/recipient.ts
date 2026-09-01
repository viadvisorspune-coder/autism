/**
 * Working out who a document is for.
 *
 * Routing needs this. "Prepare a letter for my employer" takes the full
 * governance path and "write a handover for my OT" does not, and the only
 * thing separating them is who receives it. Nothing was supplying a recipient
 * at all, so the fifteen-step lane could only ever be reached by someone
 * happening to use the word "formal".
 *
 * RESOLVED AGAINST THE RECORD, NOT READ OUT OF THE TEXT. The message is only
 * used to look somebody up among the people already connected to this record.
 * A name that matches nobody produces no recipient, which is the safe outcome:
 * the request falls to an ordinary draft the person reviews, rather than
 * addressing a document to whoever the sentence happened to name.
 *
 * THIS IS NOT THE IDENTITY RULE BEING BENT. Who is *asking* still comes from
 * the session and is never read from the message — that is what stops somebody
 * claiming to be their psychologist. Who a document is *addressed to* is an
 * ordinary parameter of the request, and it is still checked against the
 * connections that actually exist before it is believed.
 */

import { admin } from './yoxa.ts'
import type { Recipient } from './compose.ts'

interface Connected {
  id: string
  name: string
  role: string
  org: string
}

/**
 * Role words a person might use instead of a name.
 *
 * "My employer" names no one but is unambiguous about the role, which is what
 * routing actually needs. Kept to words that map to exactly one role, so a
 * guess is never made between two of them.
 */
const ROLE_WORDS: [RegExp, string][] = [
  [/\bemployer\b|\bmy work\b|\bhr\b|\bline manager\b/i, 'employer'],
  [/\buniversity\b|\buni\b|\bcollege\b|\bdisability service\b/i, 'university'],
  [/\boccupational health\b/i, 'employer'],
  [/\bgp\b|\bdoctor\b|\bfamily doctor\b/i, 'gp'],
  [/\bpsychologist\b/i, 'psychologist'],
  [/\bpsychiatrist\b/i, 'psychiatrist'],
  [/\btherapist\b/i, 'therapist'],
  [/\bot\b|\boccupational therapist\b/i, 'ot'],
  [/\bcoordinator\b/i, 'coordinator'],
  [/\bclinic\b/i, 'clinic'],
]

/** Every name a person might reasonably be called. */
function aliases(name: string): string[] {
  const clean = name.replace(/^(dr|prof|mr|mrs|ms|mx)\.?\s+/i, '').trim()
  const parts = clean.split(/\s+/)
  const out = [clean]
  // A surname on its own — "for Dr Nair" — is how people actually refer to
  // clinicians, and is specific enough when it matches exactly one connection.
  if (parts.length > 1) out.push(parts[parts.length - 1])
  if (parts.length > 0) out.push(parts[0])
  return [...new Set(out.filter((a) => a.length > 2))]
}

const mentions = (message: string, alias: string): boolean =>
  new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message)

export async function resolveRecipient(
  patientId: string,
  message: string,
): Promise<Recipient | null> {
  const { data } = await admin
    .from('connections')
    .select('person_id, consent_status, app_users(id, name, role, organisation)')
    .eq('patient_id', patientId)
    .eq('consent_status', 'Active')

  const people: Connected[] = (data ?? [])
    .map((row) => {
      const u = (row as Record<string, unknown>).app_users as Record<string, unknown> | null
      if (!u) return null
      return {
        id: String(u.id),
        name: String(u.name ?? ''),
        role: String(u.role ?? ''),
        org: String(u.organisation ?? ''),
      }
    })
    .filter((p): p is Connected => p !== null && Boolean(p.name))

  if (!people.length) return null

  /**
   * A name wins over a role word.
   *
   * "A handover for Dr Nair" is more specific than "a handover for my
   * psychologist", and if both appear they refer to the same person anyway.
   */
  const named = people.filter((p) => aliases(p.name).some((a) => mentions(message, a)))
  if (named.length === 1)
    return { id: named[0].id, name: named[0].name, role: named[0].role, org: named[0].org }

  /**
   * Two people matched, so no recipient is chosen.
   *
   * Picking the first would address somebody's medical information to a person
   * the sentence did not unambiguously name. Returning nothing sends the
   * request down the ordinary draft path, where a human reads it before it
   * goes anywhere — which is exactly the right place for an ambiguous
   * instruction to be resolved.
   */
  if (named.length > 1) return null

  for (const [pattern, role] of ROLE_WORDS) {
    if (!pattern.test(message)) continue
    const byRole = people.filter((p) => p.role === role)
    if (byRole.length === 1)
      return { id: byRole[0].id, name: byRole[0].name, role: byRole[0].role, org: byRole[0].org }
    // More than one person in that role is the same ambiguity as above.
    if (byRole.length > 1) return null
    /**
     * Nobody connected holds that role, but the role was named.
     *
     * Still worth returning, because routing only needs to know the document
     * is going outside the care team. The workflow will be told a role and no
     * name, which is honest about what we actually know.
     */
    return { name: '', role, org: '' }
  }

  return null
}
