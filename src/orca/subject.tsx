/**
 * Which record you are in.
 *
 * Ananya, her sister, her employer and her university are only ever in one, so
 * this resolves to the session's record and never changes. Her clinicians look
 * after several, and for them it is the single most important fact on the
 * screen — which is why selecting a subject is a screen of its own and the
 * name then sits in the chrome, on every page, until it is changed.
 *
 * You cannot ask a question without a subject selected. That is enforced here
 * rather than left to the workflow: a question composed against no subject, or
 * against the wrong one, is not a question that should reach a record at all.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSession } from '../state/session'
import { patientName, patientsFor } from '../data/db'
import { hasCaseload } from './system'

interface SubjectValue {
  /** The record in scope, or null when a clinician has not chosen one. */
  subjectId: string | null
  subjectName: string
  /** Whose choice this is: a clinician's, or simply who they are. */
  choosable: boolean
  choose: (patientId: string) => void
  clear: () => void
  /** Everyone this person may open. Empty for anybody without a caseload. */
  caseload: { id: string; name: string }[]
}

const SubjectContext = createContext<SubjectValue | null>(null)

const KEY = (personId: string) => `orca.subject.${personId}`

export function SubjectProvider({ children }: { children: ReactNode }) {
  const { option, role, patientId } = useSession()
  const personId = option?.personId ?? ''
  const choosable = hasCaseload(role)

  const caseload = useMemo(() => {
    if (!choosable || !personId) return []
    return patientsFor(String(role), personId).map((p) => ({ id: p.id, name: p.name }))
  }, [choosable, role, personId])

  const [chosen, setChosen] = useState<string | null>(() => {
    if (!personId) return null
    try {
      return sessionStorage.getItem(KEY(personId))
    } catch {
      return null
    }
  })

  // Signing in as somebody else must not carry the previous person's subject
  // across. Two clinicians in one browser is the ordinary demo case.
  useEffect(() => {
    if (!personId) {
      setChosen(null)
      return
    }
    try {
      setChosen(sessionStorage.getItem(KEY(personId)))
    } catch {
      setChosen(null)
    }
  }, [personId])

  const choose = useCallback(
    (id: string) => {
      setChosen(id)
      try {
        if (personId) sessionStorage.setItem(KEY(personId), id)
      } catch {
        /* The choice holds for this page only. */
      }
    },
    [personId],
  )

  const clear = useCallback(() => {
    setChosen(null)
    try {
      if (personId) sessionStorage.removeItem(KEY(personId))
    } catch {
      /* Nothing stored, nothing to clear. */
    }
  }, [personId])

  const value = useMemo<SubjectValue>(() => {
    // A stored choice this person is no longer connected to is not a choice.
    const valid = chosen && caseload.some((c) => c.id === chosen) ? chosen : null
    const subjectId = choosable ? valid : patientId
    return {
      subjectId,
      subjectName: subjectId ? patientName(subjectId) : '',
      choosable,
      choose,
      clear,
      caseload,
    }
  }, [chosen, caseload, choosable, patientId, choose, clear])

  return <SubjectContext.Provider value={value}>{children}</SubjectContext.Provider>
}

export function useSubject() {
  const ctx = useContext(SubjectContext)
  if (!ctx) throw new Error('useSubject must be used inside SubjectProvider')
  return ctx
}
