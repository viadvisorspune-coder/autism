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
}

/**
 * The roles this demo account is permitted to use. In the real system this
 * comes from the backend identity layer — the frontend never decides it.
 */
export const roleOptions: RoleOption[] = [
  {
    role: 'patient',
    label: 'Patient',
    description: 'Understand myself, get support, decide, share, track.',
    experience: 'patient',
    home: '/patient',
    personId: 'u-ananya',
  },
  {
    role: 'psychologist',
    label: 'Psychologist',
    description: 'Understand the patient, review change, work, document, coordinate.',
    experience: 'clinical',
    home: '/psychologist',
    personId: 'u-kavita',
  },
  {
    role: 'psychiatrist',
    label: 'Psychiatrist',
    description: 'Clinical context, change, appointment, clinical decision.',
    experience: 'clinical',
    home: '/psychiatrist',
    personId: 'u-arun',
  },
  {
    role: 'therapist',
    label: 'Therapist',
    description: 'Goal, intervention, outcome, adapt.',
    experience: 'clinical',
    home: '/therapist',
    personId: 'u-meera',
  },
  {
    role: 'ot',
    label: 'Occupational therapist',
    description: 'Function, environment, adaptation, outcome.',
    experience: 'clinical',
    home: '/ot',
    personId: 'u-sana',
  },
  {
    role: 'gp',
    label: 'GP',
    description: 'Relevant context, current issue, care coordination.',
    experience: 'clinical',
    home: '/gp',
    personId: 'u-vikram',
  },
  {
    role: 'clinic',
    label: 'Hospital / clinic',
    description: 'Coordinate, document, track, hand off.',
    experience: 'organisation',
    home: '/clinic',
    personId: 'u-priya',
  },
  {
    role: 'employer',
    label: 'Employer / HR',
    description: 'Request, review, implement, track. No clinical information.',
    experience: 'organisation',
    home: '/employer',
    personId: 'u-anil',
  },
  {
    role: 'university',
    label: 'University accessibility',
    description: 'Request, review, implement, track.',
    experience: 'organisation',
    home: '/university',
    personId: 'u-ruth',
  },
  {
    role: 'trusted',
    label: 'Trusted person',
    description: 'See what has been shared, support, report.',
    experience: 'trusted',
    home: '/trusted',
    personId: 'u-divya',
  },
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Monitor, govern, audit.',
    experience: 'admin',
    home: '/admin',
    personId: 'u-tejas',
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
  signIn: () => void
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

  const signIn = useCallback(() => setSignedIn(true), [])
  const signOut = useCallback(() => {
    setSignedIn(false)
    setRole(null)
    setSetupComplete(false)
  }, [])
  const chooseRole = useCallback((next: Role) => setRole(next), [])
  const completeSetup = useCallback(() => setSetupComplete(true), [])

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

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
