import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { EvidenceBundle } from '../data/types'

type TextSize = 'default' | 'large' | 'xlarge'

interface UIValue {
  textSize: TextSize
  setTextSize: (t: TextSize) => void
  reducedMotion: boolean
  setReducedMotion: (v: boolean) => void
  evidence: { title: string; bundle: EvidenceBundle } | null
  openEvidence: (title: string, bundle: EvidenceBundle) => void
  closeEvidence: () => void
  toast: string | null
  say: (message: string) => void
  dismissToast: () => void
}

const UIContext = createContext<UIValue | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSize] = useState<TextSize>('default')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [evidence, setEvidence] = useState<UIValue['evidence']>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.textsize = textSize
  }, [textSize])

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'default'
  }, [reducedMotion])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const openEvidence = useCallback((title: string, bundle: EvidenceBundle) => {
    setEvidence({ title, bundle })
  }, [])

  const value = useMemo<UIValue>(
    () => ({
      textSize,
      setTextSize,
      reducedMotion,
      setReducedMotion,
      evidence,
      openEvidence,
      closeEvidence: () => setEvidence(null),
      toast,
      say: (message: string) => setToast(message),
      dismissToast: () => setToast(null),
    }),
    [textSize, reducedMotion, evidence, openEvidence, toast],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
