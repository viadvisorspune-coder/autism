import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { EvidenceBundle } from '../data/types'

type TextSize = 'default' | 'large' | 'xlarge'

/**
 * How much a screen shows at once.
 *
 *   calm — one thing at a time. Supporting detail is collapsed behind a named
 *          control that says what is inside it, colour is used once per screen
 *          rather than on every status, and spacing is wider.
 *   full — everything open.
 *
 * Nothing is removed in calm. Every section that collapses says how many items
 * it holds and opens on one press, because hiding information from someone
 * without telling them it exists is worse than showing too much.
 *
 * Calm is the default. Someone meeting this interface for the first time is
 * usually doing so on a bad day, and the version that asks less of them should
 * be the one they meet first.
 */
export type Density = 'calm' | 'full'

/**
 * How loud the colours are.
 *
 *   standard — the full palette, accents at their intended saturation.
 *   low      — every accent desaturated and the grounds softened.
 *
 * A separate axis from density, and deliberately not folded into it. Density
 * is about how much is on the screen; this is about how hard the screen
 * pushes. Somebody who wants everything visible at once may still find
 * saturated colour difficult, and pairing the two would force a trade nobody
 * asked for.
 *
 * Text tokens are untouched by it. "Reduced contrast" in the brief means
 * calmer surfaces, never harder reading — so the low palette lowers the
 * saturation of accents and grounds and leaves ink where it is.
 */
export type Palette = 'standard' | 'low'

interface UIValue {
  palette: Palette
  setPalette: (p: Palette) => void
  textSize: TextSize
  setTextSize: (t: TextSize) => void
  reducedMotion: boolean
  setReducedMotion: (v: boolean) => void
  density: Density
  setDensity: (d: Density) => void
  evidence: { title: string; bundle: EvidenceBundle } | null
  openEvidence: (title: string, bundle: EvidenceBundle) => void
  closeEvidence: () => void
  toast: string | null
  say: (message: string) => void
  dismissToast: () => void
}

const UIContext = createContext<UIValue | null>(null)

/** Preferences survive a reload. Being asked to set them again is a small cost
 *  for most people and a large one for someone who found them hard to set. */
function stored<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    return (window.localStorage.getItem(key) as T) ?? fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* Private browsing. The preference still applies for this session. */
  }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>(() => stored<TextSize>('orca.textsize', 'default'))
  const [reducedMotion, setReducedMotionState] = useState(
    () => stored<'default' | 'reduced'>('orca.motion', 'default') === 'reduced',
  )
  const [density, setDensityState] = useState<Density>(() => stored<Density>('orca.density', 'calm'))
  const [palette, setPaletteState] = useState<Palette>(() =>
    stored<Palette>('orca.palette', 'standard'),
  )
  const [evidence, setEvidence] = useState<UIValue['evidence']>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.textsize = textSize
  }, [textSize])

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'default'
  }, [reducedMotion])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  useEffect(() => {
    document.documentElement.dataset.palette = palette
  }, [palette])

  // Long enough to read twice at a slower reading speed, and dismissible.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 9000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const setTextSize = useCallback((t: TextSize) => {
    setTextSizeState(t)
    remember('orca.textsize', t)
  }, [])

  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v)
    remember('orca.motion', v ? 'reduced' : 'default')
  }, [])

  const setPalette = useCallback((p: Palette) => {
    setPaletteState(p)
    remember('orca.palette', p)
  }, [])

  const setDensity = useCallback((d: Density) => {
    setDensityState(d)
    remember('orca.density', d)
  }, [])

  const openEvidence = useCallback((title: string, bundle: EvidenceBundle) => {
    setEvidence({ title, bundle })
  }, [])

  const value = useMemo<UIValue>(
    () => ({
      textSize,
      setTextSize,
      reducedMotion,
      setReducedMotion,
      density,
      setDensity,
      palette,
      setPalette,
      evidence,
      openEvidence,
      closeEvidence: () => setEvidence(null),
      toast,
      say: (message: string) => setToast(message),
      dismissToast: () => setToast(null),
    }),
    [textSize, setTextSize, reducedMotion, setReducedMotion, density, setDensity, palette, setPalette, evidence, openEvidence, toast],
  )

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
