/**
 * The shell: one row of navigation, one column beneath it, and nothing else.
 *
 * Four items for everyone except the administrator, in the same words, the same
 * order and the same place on every screen. No sidebar, no drawer, no
 * responsive rearrangement — the column is 720px on a laptop and 720px on a
 * phone, because a layout that changes shape between devices is the map you
 * learned being redrawn while you are using it.
 *
 * The palette is set here, on the root element, from who is signed in. It is a
 * statement about whose record this is rather than a preference: the further
 * from the person, the less colour, and a screen cannot opt out of that by
 * styling itself differently.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../state/session'
import { useUI } from '../state/ui'
import { AsksProvider } from './asks'
import { SubjectProvider, useSubject } from './subject'
import { homeFor, navFor, paletteFor } from './system'

export default function Shell() {
  const { signedIn, role } = useSession()

  // The palette belongs to the person, so it goes on before the first paint of
  // any screen and comes off when they leave for the older interface.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.ia = 'orca'
    /**
     * `data-look`, not `data-palette`.
     *
     * `data-palette` was already taken: the comfort setting writes 'standard'
     * or 'low' to it on the same element, and whichever effect ran last won.
     * In practice that was the comfort setting, so every professional got the
     * subject's full multicolour — the one thing the colour rule exists to
     * prevent. Two different ideas cannot share one attribute.
     */
    root.dataset.look = paletteFor(role)
    return () => {
      delete root.dataset.ia
      delete root.dataset.look
    }
  }, [role])

  if (!signedIn || !role) return <Navigate to="/" replace />

  return (
    <SubjectProvider>
      <AsksProvider>
        <Frame />
      </AsksProvider>
    </SubjectProvider>
  )
}

function Frame() {
  const { role, option, signOut } = useSession()
  const { subjectId, subjectName, choosable } = useSubject()
  const items = navFor(role)
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  // A new screen is a new context. Leaving a menu hanging open across a
  // navigation is a small thing that makes an interface feel unreliable.
  useEffect(() => {
    setMenuOpen(false)
    setNavOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen">
      <header className="border-b border-black bg-[var(--paper)]">
        {/*
          Wraps rather than clips.

          A clinician has five destinations plus their own name, and at 720px
          that does not fit on one line — the account control was sitting on
          top of "Documents". Navigation that overlaps itself is worse than
          navigation on two lines.
        */}
        <div className="o-wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <Link to={homeFor(role)} className="o-h3 shrink-0 font-extrabold no-underline">
              ORCA
            </Link>
            <nav aria-label="Sections" className="hidden flex-wrap items-center gap-x-5 gap-y-2 md:flex">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `o-body no-underline ${
                      isActive ? 'font-semibold underline decoration-2 underline-offset-8' : ''
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/*
              The wrapper carries the breakpoint, not the button.

              `.o-btn` sets its own display, and this sheet is loaded after
              Tailwind's, so `md:hidden` on the button itself lost the cascade
              and left a second navigation control sitting on top of the first
              at every width. A div with nothing else on it cannot lose that
              argument.
            */}
            <div className="md:hidden">
              <button
                type="button"
                className="o-btn o-btn-small"
                aria-expanded={navOpen}
                onClick={() => setNavOpen((o) => !o)}
              >
                Sections
              </button>
            </div>
            <button
              type="button"
              className="o-btn o-btn-small"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {option?.name?.split(' ')[0] ?? 'Account'} ▾
            </button>
          </div>
        </div>

        {navOpen ? (
          <nav aria-label="Sections" className="o-wrap border-t border-black py-3 md:hidden">
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className="o-body no-underline">
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {menuOpen ? <Account onSignOut={signOut} /> : null}

        {/*
          Which record you are in, in the chrome, on every screen.

          Only for the people who look after more than one. For everybody else
          there is exactly one record and naming it in the furniture would be
          noise; for a clinician it is the difference between writing a handover
          about Ananya and writing one about Rohan.
        */}
        {choosable && subjectId ? (
          <div className="border-t border-black bg-[var(--paper)]">
            <div className="o-wrap flex flex-wrap items-center justify-between gap-3 py-3">
              <p className="o-body font-semibold">{subjectName}</p>
              <Link to="/caseload" className="o-meta underline">
                Change who this is about
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main className="o-wrap py-16">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-black">
        <div className="o-wrap py-8">
          <p className="o-meta o-measure">
            ORCA holds one record and shows each person only their part of it. Nothing is sent to
            anyone without a decision from {option?.role === 'patient' ? 'you' : 'Ananya'}.
          </p>
        </div>
      </footer>
    </div>
  )
}

/**
 * A setting, expressed as the choice it is.
 *
 * Declared here rather than inside Account: a component defined during render
 * is a new component type on every render, so React remounts it and anything
 * it holds. These hold nothing today, which is exactly the kind of true-for-now
 * that stops being true quietly.
 */
function Choice({
  on,
  onSelect,
  children,
}: {
  on: boolean
  onSelect: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={`o-btn o-btn-small ${on ? 'o-btn-primary' : ''}`}
    >
      {children}
    </button>
  )
}

/**
 * The account panel: who you are, and the two settings that change how hard
 * this screen pushes.
 *
 * Colour intensity and movement are separate discomforts, kept on separate
 * axes on purpose. Somebody who finds motion unbearable should not have to
 * accept a washed-out palette to stop it.
 */
function Account({ onSignOut }: { onSignOut: () => void }) {
  const { option, organisation } = useSession()
  const { textSize, setTextSize, reducedMotion, setReducedMotion } = useUI()

  return (
    <div className="border-t border-black bg-[var(--paper)]">
      <div className="o-wrap py-8">
        <p className="o-h3">{option?.name}</p>
        <p className="o-meta mt-1">
          {option?.title}
          {organisation ? ` · ${organisation}` : ''}
        </p>

        <h3 className="o-h3 mb-3 mt-8">Text size</h3>
        <div className="flex flex-wrap gap-3">
          <Choice on={textSize === 'default'} onSelect={() => setTextSize('default')}>
            Standard
          </Choice>
          <Choice on={textSize === 'large'} onSelect={() => setTextSize('large')}>
            Large
          </Choice>
          <Choice on={textSize === 'xlarge'} onSelect={() => setTextSize('xlarge')}>
            Larger
          </Choice>
        </div>

        <h3 className="o-h3 mb-3 mt-8">Movement</h3>
        <div className="flex flex-wrap gap-3">
          <Choice on={!reducedMotion} onSelect={() => setReducedMotion(false)}>
            Standard
          </Choice>
          <Choice on={reducedMotion} onSelect={() => setReducedMotion(true)}>
            Reduced
          </Choice>
        </div>
        <p className="o-meta o-measure mt-4">
          Both are remembered on this device. Neither changes your record or what anyone else
          can see.
        </p>

        <hr className="o-rule my-8" />
        <button type="button" className="o-btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
