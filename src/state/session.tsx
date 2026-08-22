import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Experience, Role } from '../data/types'
import { people } from '../data/db'

export interface RoleOption {
  role: Role
  label: string
  description: string
  experience: Experience
  home: string
  personId: string
  /** The account this person signs in with. Fictional, like everything else. */
  email: string
  /** Their own name and job, not the name of a permission level. */
  name: string
  title: string
}

/**
 * The people who use ORCA, one account each.
 *
 * An earlier version had a single account that then asked which role you
 * wanted, which is not how any of these people experience it: Ananya is not
 * choosing to be a patient today, and her psychologist is not picking a
 * permission level. They are different people with different sign-ins who
 * happen to share one record between them.
 *
 * In the real system this list comes from the identity layer and a person sees
 * only their own account. Here it is on the sign-in page on purpose, so anyone
 * can step into any of them and see what that person sees.
 */
export const roleOptions: RoleOption[] = [
  {
    role: 'patient',
    label: 'Patient',
    description: 'Understand myself, get support, decide, share, track.',
    experience: 'patient',
    home: '/patient',
    personId: 'u-ananya',
    email: 'ananya.rao@example.in',
    name: 'Ananya Rao',
    title: 'Living with an autism diagnosis',
  },
  {
    role: 'psychologist',
    label: 'Psychologist',
    description: 'Understand the patient, review change, work, document, coordinate.',
    experience: 'clinical',
    home: '/psychologist',
    personId: 'u-kavita',
    email: 'k.nair@sahyadri.example',
    name: 'Dr Kavita Nair',
    title: 'Clinical Psychologist',
  },
  {
    role: 'psychiatrist',
    label: 'Psychiatrist',
    description: 'Clinical context, change, appointment, clinical decision.',
    experience: 'clinical',
    home: '/psychiatrist',
    personId: 'u-arun',
    email: 'a.deshpande@sahyadri.example',
    name: 'Dr Arun Deshpande',
    title: 'Consultant Psychiatrist',
  },
  {
    role: 'therapist',
    label: 'Therapist',
    description: 'Goal, intervention, outcome, adapt.',
    experience: 'clinical',
    home: '/therapist',
    personId: 'u-meera',
    email: 'm.joshi@sahyadri.example',
    name: 'Meera Joshi',
    title: 'Speech & Communication Therapist',
  },
  {
    role: 'ot',
    label: 'Occupational therapist',
    description: 'Function, environment, adaptation, outcome.',
    experience: 'clinical',
    home: '/ot',
    personId: 'u-sana',
    email: 's.kulkarni@sahyadri.example',
    name: 'Sana Kulkarni',
    title: 'Occupational Therapist',
  },
  {
    role: 'gp',
    label: 'GP',
    description: 'Relevant context, current issue, care coordination.',
    experience: 'clinical',
    home: '/gp',
    personId: 'u-vikram',
    email: 'v.rao@kothrudfamily.example',
    name: 'Dr Vikram Rao',
    title: 'General Practitioner',
  },
  {
    role: 'clinic',
    label: 'Hospital / clinic',
    description: 'Coordinate, document, track, hand off.',
    experience: 'organisation',
    home: '/clinic',
    personId: 'u-priya',
    email: 'p.salvi@sahyadri.example',
    name: 'Priya Salvi',
    title: 'Care Coordinator',
  },
  {
    role: 'employer',
    label: 'Employer / HR',
    description: 'Request, review, implement, track. No clinical information.',
    experience: 'organisation',
    home: '/employer',
    personId: 'u-anil',
    email: 'a.fernandes@northline.example',
    name: 'Anil Fernandes',
    title: 'HR Business Partner',
  },
  {
    role: 'university',
    label: 'University accessibility',
    description: 'Request, review, implement, track.',
    experience: 'organisation',
    home: '/university',
    personId: 'u-ruth',
    email: 'r.menon@pid.example',
    name: 'Ruth Menon',
    title: 'Accessibility Adviser',
  },
  {
    role: 'trusted',
    label: 'Trusted person',
    description: 'See what has been shared, support, report.',
    experience: 'trusted',
    home: '/trusted',
    personId: 'u-divya',
    email: 'divya.rao@example.in',
    name: 'Divya Rao',
    title: 'Ananya’s sister',
  },
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Monitor, govern, audit.',
    experience: 'admin',
    home: '/admin',
    personId: 'u-tejas',
    email: 't.bhatt@orca.example',
    name: 'Tejas Bhatt',
    title: 'Platform Administrator',
  },
]

interface SessionValue {
  signedIn: boolean
  role: Role | null
  option: RoleOption | null
  experience: Experience
  personName: string
  organisation: string
  setupComplete: boolean
  signIn: (option: RoleOption) => void
  signOut: () => void
  chooseRole: (role: Role) => void
  completeSetup: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

const STORAGE_KEY = 'orca.session'

interface StoredSession {
  signedIn: boolean
  role: Role | null
  setupComplete: boolean
}

/** Kept in session storage so a refresh or a deep link does not sign you out. */
function readStored(): StoredSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredSession
  } catch {
    /* storage unavailable — fall through to a signed-out session */
  }
  return { signedIn: false, role: null, setupComplete: false }
}

/**
 * Whether this person has been through first-run, on this device.
 *
 * Kept in local storage rather than the session, because "have I seen the
 * introduction" is a fact about a person and not about a browsing session —
 * being walked through the privacy model again on every sign-in would teach
 * people to click past the one screen most worth reading.
 */
const ONBOARDED = (personId: string) => `orca.onboarded.${personId}`

export function hasOnboarded(personId: string): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED(personId)) === 'yes'
  } catch {
    return false
  }
}

function rememberOnboarded(personId: string) {
  try {
    window.localStorage.setItem(ONBOARDED(personId), 'yes')
  } catch {
    /* Private browsing. They will be offered the introduction again. */
  }
}

/** Demo affordance: put a person back to their very first sign-in. */
export function forgetOnboarding(personId: string) {
  try {
    window.localStorage.removeItem(ONBOARDED(personId))
    window.localStorage.removeItem(`orca.maturity.${personId}`)
  } catch {
    /* Nothing stored, nothing to clear. */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const stored = readStored()
  const [signedIn, setSignedIn] = useState(stored.signedIn)
  const [role, setRole] = useState<Role | null>(stored.role)
  const [setupComplete, setSetupComplete] = useState(stored.setupComplete)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ signedIn, role, setupComplete }))
    } catch {
      /* nothing to do — the session simply will not survive a refresh */
    }
  }, [signedIn, role, setupComplete])

  // Signing in as a person, not signing in and then choosing what to be.
  const signIn = useCallback((option: RoleOption) => {
    setRole(option.role)
    setSignedIn(true)
    // A returning person goes straight to their work. Only someone who has
    // never been here gets the six screens.
    setSetupComplete(hasOnboarded(option.personId))
  }, [])
  const signOut = useCallback(() => {
    setSignedIn(false)
    setRole(null)
    setSetupComplete(false)
  }, [])
  const chooseRole = useCallback((next: Role) => setRole(next), [])
  const completeSetup = useCallback(() => {
    setSetupComplete(true)
    const current = roleOptions.find((r) => r.role === role)
    if (current) rememberOnboarded(current.personId)
  }, [role])

  const value = useMemo<SessionValue>(() => {
    const option = roleOptions.find((r) => r.role === role) ?? null
    const person = people.find((p) => p.id === option?.personId)
    return {
      signedIn,
      role,
      option,
      experience: option?.experience ?? 'patient',
      personName: person?.name ?? '',
      organisation: person?.organisation ?? (role === 'patient' ? 'Personal account' : ''),
      setupComplete,
      signIn,
      signOut,
      chooseRole,
      completeSetup,
    }
  }, [signedIn, role, setupComplete, signIn, signOut, chooseRole, completeSetup])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * Where each role lands, and which visual world it belongs to. The only part
 * of an account the database does not hold, because it is a property of the
 * interface rather than of the person.
 */
const ROLE_SHAPE: Record<Role, { home: string; experience: Experience }> = {
  patient: { home: '/patient', experience: 'patient' },
  psychologist: { home: '/psychologist', experience: 'clinical' },
  psychiatrist: { home: '/psychiatrist', experience: 'clinical' },
  therapist: { home: '/therapist', experience: 'clinical' },
  ot: { home: '/ot', experience: 'clinical' },
  gp: { home: '/gp', experience: 'clinical' },
  clinic: { home: '/clinic', experience: 'organisation' },
  employer: { home: '/employer', experience: 'organisation' },
  university: { home: '/university', experience: 'organisation' },
  trusted: { home: '/trusted', experience: 'trusted' },
  admin: { home: '/admin', experience: 'admin' },
}

/**
 * Every account that can currently sign in, from the record rather than from a
 * constant.
 *
 * This used to be a hard-coded list, which meant an administrator adding a
 * colleague changed a table on one screen and nothing else — they could not
 * sign in, and no other screen knew they existed. Reading the same people
 * everything else reads is what makes the administration screen real.
 *
 * The static list below stays as the floor for a build with no backend.
 */
export function accounts(): RoleOption[] {
  const live = people.filter((p) => p.active !== false && p.email)
  if (!live.length) return roleOptions

  return live.map((p) => {
    const shape = ROLE_SHAPE[p.role] ?? { home: '/patient', experience: 'patient' as Experience }
    return {
      role: p.role,
      label: p.title ?? p.role,
      description: p.title ?? '',
      experience: shape.experience,
      home: shape.home,
      personId: p.id,
      email: p.email as string,
      name: p.name,
      title: p.title ?? describeRole(p.role),
    }
  })
}

/** A role has a job description even when the person has no job title. */
function describeRole(role: Role): string {
  if (role === 'patient') return 'Living with an autism diagnosis'
  if (role === 'trusted') return 'Trusted person'
  if (role === 'admin') return 'Platform Administrator'
  return role
}

/** The account matching an email, however it was typed. */
export function accountFor(email: string): RoleOption | null {
  const wanted = email.trim().toLowerCase()
  return accounts().find((o) => o.email.toLowerCase() === wanted) ?? null
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
