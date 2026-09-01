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
import { useRecordStatus } from '../data/RecordProvider'
import { AsksProvider, useAsks } from './asks'
import { SubjectProvider, useSubject } from './subject'
import { homeFor, navFor, paletteFor } from './system'
import { SkipLink, screenName, useConnection, useFocusOnNavigate, useTitle } from './orientation'

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
  useTitle(screenName(pathname, role))
  useFocusOnNavigate()
  const { offline, restored, clearRestored } = useConnection()
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  // A new screen is a new context. Leaving a menu hanging open across a
  // navigation is a small thing that makes an interface feel unreliable.
  useEffect(() => {
    setMenuOpen(false)
    setNavOpen(false)
    // The reconnection notice has been read by anyone who moved on. It does not
    // time out — see useConnection — but it does not follow you around either.
    clearRestored()
  }, [pathname, clearRestored])

  return (
    <div className="min-h-screen">
      <SkipLink />
      {/*
        Said once, at the top, before anything the person might act on.

        A record system that has gone quiet is otherwise indistinguishable from
        one that is broken, and somebody whose medical record appears to have
        stopped answering is owed the knowledge that it is their connection
        rather than their record.
      */}
      {offline ? (
        <div className="border-b border-black bg-[var(--paper)]" data-disclose="page">
          <div className="o-wrap py-4">
            <p className="o-body o-measure" role="status">
              <span className="font-semibold">You are offline.</span> What is already on screen is
              still readable. Anything you type into a document is kept on this device and will
              still be here when you reconnect. New questions cannot be sent and nothing you do
              now will reach anyone until the connection comes back.
            </p>
          </div>
        </div>
      ) : null}
      {/*
        Coming back, said as plainly as going away was.

        The claim is narrow on purpose. ORCA queues nothing: a question that
        failed while the connection was down was not held and re-sent, and
        telling somebody "your changes are saved" when the only thing saved is
        a local draft would be a reassurance about the wrong thing. So this says
        exactly what survived and exactly what did not happen.

        It waits to be dismissed rather than fading. A person who looked away
        for ten seconds is precisely the person who needs to read it.
      */}
      {!offline && restored ? (
        <div className="border-b border-black bg-[var(--paper)]" data-disclose="page">
          <div className="o-wrap flex flex-wrap items-center justify-between gap-4 py-4">
            <p className="o-body o-measure" role="status">
              <span className="font-semibold">Connection restored.</span> Any document you were
              writing was kept on this device and is still here. Nothing was sent while you were
              offline, so anything you tried to send needs sending again.
            </p>
            <button type="button" className="o-btn o-btn-small shrink-0" onClick={clearRestored}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
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
                  <Waiting to={item.to} />
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
                    <Waiting to={item.to} />
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

      <main id="orca-main" className="o-wrap py-16">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-black">
        <div className="o-wrap py-8">
          <p className="o-meta o-measure">
            ORCA holds one record and shows each person only their part of it. Nothing is sent to
            anyone without a decision from {option?.role === 'patient' ? 'you' : 'Ananya'}.
          </p>
          <NotLive />
        </div>
      </footer>
    </div>
  )
}

/**
 * Something arrived. Go when you are ready.
 *
 * The whole of this component is the refusal it implies. A gate opening while
 * somebody is halfway down their own record, or a colleague asking for access
 * while they are composing a question, must never move them: being taken
 * somewhere you did not ask to go is the interruption, not the remedy for one.
 * So nothing here navigates, nothing flashes, nothing pulses, and the number
 * does not grow or announce itself when it changes.
 *
 * It is a number in brackets after a word, which is as quiet as an indicator
 * can be while still being one. Read aloud it says "Decisions, 2 waiting",
 * because "Decisions 2" is a heading in a manual.
 *
 * Only on Decisions, and only when there is something there. A nav item that
 * permanently carries a zero has taught everybody to stop reading it.
 */
function Waiting({ to }: { to: string }) {
  const { waiting } = useAsks()
  if (to !== '/decisions' || waiting < 1) return null
  return (
    <>
      {' '}
      <span aria-hidden>({waiting})</span>
      <span className="sr-only">, {waiting} waiting</span>
    </>
  )
}

/**
 * Whether what is on screen is the real record.
 *
 * The one thing this interface must never be vague about. If the backend
 * cannot be reached, every screen still renders — deliberately, because a
 * blank page is the worst thing to hand somebody who is already finding the
 * day expensive — but it renders the seeded example record, and an example
 * record that is indistinguishable from a real one is worse than an error.
 * Somebody would read a sentence about their own mornings that nobody ever
 * wrote.
 *
 * Renders nothing at all when the record is live, which is almost always.
 * A permanent banner saying "this is real" would be noise, and would train
 * people to stop reading the strip they actually need to see.
 */
function NotLive() {
  const { status, note } = useRecordStatus()
  if (status !== 'mock') return null
  return (
    <p className="o-body o-measure mt-6 border border-black p-4">
      <span className="font-semibold">This is example data, not a real record.</span>{' '}
      {note} Nothing you do here reaches anyone, and nothing here was written by a person.
    </p>
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
