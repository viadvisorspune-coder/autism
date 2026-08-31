/**
 * Knowing where you are, and being put there.
 *
 * Four things that are invisible when they work and disorienting when they are
 * missing. None of them is a screen; all of them are the difference between an
 * interface you can hold in your head and one you have to re-read.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { navFor } from './system'
import type { Role } from '../data/types'

/**
 * The browser tab says which screen this is.
 *
 * Every screen was titled "ORCA", so six open tabs were six identical tabs and
 * the back-forward menu was a list of the same word. The title is also the
 * first thing a screen reader announces after a navigation, which makes it the
 * cheapest orientation cue in the whole interface and the one most often left
 * undone.
 *
 * Screen first, product second: a tab strip truncates from the right, so
 * "Your record — ORCA" survives being narrowed and "ORCA — Your record" does
 * not.
 */
export function useTitle(screen: string | null) {
  useEffect(() => {
    document.title = screen ? `${screen} — ORCA` : 'ORCA'
  }, [screen])
}

/**
 * Focus follows the reader to the new screen.
 *
 * A single-page app changes the whole page and leaves keyboard focus on the
 * link that was clicked, which for anybody not using a mouse means the new
 * screen has silently arrived somewhere they are not. Moving focus to the
 * heading puts them at the top of what they just asked for, and announces what
 * it is on the way.
 *
 * `tabIndex={-1}` on the target, so it can receive focus without joining the
 * tab order — see the heading elements that use this. Skipped on the first
 * render, because stealing focus on arrival is its own rudeness.
 */
export function useFocusOnNavigate() {
  const { pathname } = useLocation()
  const target = useRef<HTMLElement | null>(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const heading = document.querySelector<HTMLElement>('[data-focus-target]')
    if (!heading) return
    target.current = heading
    heading.focus({ preventScroll: true })
    // The heading is at the top of the column; scrolling there separately keeps
    // focus and viewport agreeing rather than leaving the page mid-screen.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
}

/**
 * A way past the navigation, for anybody arriving by keyboard.
 *
 * The same five links sit above every screen, so without this a keyboard user
 * tabs through all of them on every single page before reaching anything they
 * came for. Visible only when focused, which is the one case where it is
 * useful and the only case where it would otherwise be clutter.
 */
export function SkipLink() {
  return (
    <a
      href="#orca-main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-black focus:bg-white focus:px-4 focus:py-3 focus:no-underline"
    >
      Skip to the main content
    </a>
  )
}

/**
 * Whether the browser thinks it can reach anything.
 *
 * Worth saying plainly, because a record system that goes quiet is otherwise
 * indistinguishable from a record system that is broken — and a person whose
 * medical record appears to have stopped answering deserves to know it is
 * their train tunnel rather than their record.
 *
 * `navigator.onLine` is the browser's own belief and is only reliable in one
 * direction: false really does mean no network, while true only means an
 * interface is up. So this is used to explain a silence, never to claim
 * everything is working.
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  )
  useEffect(() => {
    const down = () => setOffline(true)
    const up = () => setOffline(false)
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('online', up)
    }
  }, [])
  return offline
}

/** The screen name for a path, for the tab title. */
export function screenName(pathname: string, role: Role | null): string | null {
  const item = navFor(role).find(
    (d) => pathname === d.to || pathname.startsWith(`${d.to}/`),
  )
  return item?.label ?? null
}
