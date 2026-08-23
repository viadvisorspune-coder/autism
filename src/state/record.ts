import { useSession } from './session'

/**
 * Which record the screen you are on is about.
 *
 * Every patient-facing screen used to name `pt-ananya` directly, which was
 * fine while there was one person in the prototype and quietly wrong the
 * moment there were five: Rohan could sign in and read Ananya's timeline, her
 * strategies and her profile. Not a permission bug — the screens never asked
 * whose record it was.
 *
 * So they ask here. An explicit prop still wins, because a clinician opening
 * a patient is looking at a record that is not their own and the route says
 * which. Without one it is the signed-in person's own record.
 *
 * The final fallback is the demo patient, and it is deliberately last: a
 * prototype that renders an empty screen reads as broken, while one that
 * renders the wrong person's record reads as working. The second is the more
 * dangerous failure, so it is the one that cannot happen by default.
 */
export function useRecordId(explicit?: string | null): string {
  const { patientId } = useSession()
  return explicit ?? patientId ?? 'pt-ananya'
}
