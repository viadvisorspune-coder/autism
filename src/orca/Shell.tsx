/**
 * The shell — two of them, and which one you get depends on whose record it is.
 *
 * THE HEADER SHELL is the original and still the default: one row of
 * navigation, one 720px column beneath it, the same words in the same order and
 * the same place on every screen. It is what a clinician, a coordinator, an
 * employer and an administrator get, and the reasoning behind it has not
 * changed. They arrive to do a piece of work, the column is the work, and a
 * persistent sidebar would be furniture taking width away from it.
 *
 * THE RAIL SHELL is Ananya's, and only Ananya's. She is not doing a piece of
 * work. This is her own record, she is in it often and sometimes on a bad day,
 * and she is the only person here whose screens put things side by side — what
 * is today, what is new, what is waiting. A left rail is what makes that
 * layout legible, and it lets the destinations stay visible while she reads,
 * which for somebody who navigates by recognising a stable map matters more
 * than the width it costs.
 *
 * Both shells take the same `navFor(role)` list, in the same order, with the
 * same words. What differs is where the list is drawn.
 *
 * The palette is set here, on the root element, from who is signed in. It is a
 * statement about whose record this is rather than a preference: the further
 * from the person, the less colour, and a screen cannot opt out of that by
 * styling itself differently.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { AsksProvider, useAsks } from './asks'
import { SubjectProvider, useSubject } from './subject'
import { type Destination, type IconName, homeFor, navFor, paletteFor } from './system'
import {
  IconAdjust,
  IconAppointments,
  IconAsk,
  IconDecisions,
  IconDocuments,
  IconHome,
  IconRecord,
  IconSharing,
} from './icons'
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

  /**
   * The rail is Ananya's, decided from the role and nothing else.
   *
   * Not a preference and not a breakpoint. Which shell you are in is a fact
   * about which account you are signed into, so it cannot drift, and a
   * clinician cannot end up in the patient's shell by resizing a window.
   */
  const rail = role === 'patient'

  const notices = (
    <>
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
    </>
  )

  /**
   * The record footnote, on both shells.
   *
   * Whether what is on screen is the real record is the one thing this
   * interface must never be vague about, so it is not something either shell
   * gets to leave out.
   */
  const footnote = (
    <p className="o-meta o-measure">
      ORCA holds one record and shows each person only their part of it. Nothing is sent to anyone
      without a decision from {option?.role === 'patient' ? 'you' : 'Ananya'}.
    </p>
  )

  if (rail) {
    return (
      <div className="o-app">
        <SkipLink />
        <Rail items={items} name={option?.name ?? 'You'} onSignOut={signOut} />
        <div className="min-w-0">
          {notices}
          <main id="orca-main" className="o-canvas">
            <Outlet />
          </main>
          <div className="o-canvas pt-0">
            {footnote}
            <NotLive />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <SkipLink />
      {notices}
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
          {footnote}
          <NotLive />
        </div>
      </footer>
    </div>
  )
}

const GLYPH: Record<IconName, (p: { size?: number }) => React.ReactElement> = {
  home: IconHome,
  ask: IconAsk,
  record: IconRecord,
  decisions: IconDecisions,
  documents: IconDocuments,
  sharing: IconSharing,
  appointments: IconAppointments,
  adjust: IconAdjust,
}

/**
 * The map down the left, for the one person who lives here.
 *
 * IT IS A LIST OF LINKS AND NOTHING ELSE. No collapse control, no pinning, no
 * flyout on hover, no nesting. Every one of those is a way for the map to be in
 * a different state than the last time you looked at it, and the entire value
 * of a persistent rail is that it is not.
 *
 * The icon is decoration and the word is the destination — see `icons.tsx`.
 * Read aloud, this is a list of the same words the header shell reads out, in
 * the same order, because it is the same list.
 */
function Rail({
  items,
  name,
  onSignOut,
}: {
  items: Destination[]
  name: string
  onSignOut: () => void
}) {
  return (
    <div className="o-rail">
      <Link
        to="/home"
        className="o-h3 flex shrink-0 items-center gap-2 px-3 font-extrabold no-underline"
      >
        <span aria-hidden className="o-avatar">
          O
        </span>
        ORCA
      </Link>

      <nav aria-label="Sections" className="o-rail-grow">
        {items.map((item) => {
          const Icon = item.icon ? GLYPH[item.icon] : null
          return (
            <NavLink key={item.to} to={item.to} className="o-rail-link">
              {Icon ? (
                <span className="o-rail-icon">
                  <Icon />
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <Waiting to={item.to} pill />
            </NavLink>
          )
        })}
      </nav>

      {/*
        Signing out is behind the name rather than beside the destinations.
        It is not a place you go, and a rail of seven destinations with an
        eighth item that ends the session is a rail with a trapdoor in it.
      */}
      <div className="o-rail-foot">
        <span aria-hidden className="o-avatar">
          {name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="o-row-title block truncate">{name}</span>
          <button type="button" className="o-meta underline" onClick={onSignOut}>
            Sign out
          </button>
        </span>
      </div>
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
function Waiting({ to, pill }: { to: string; pill?: boolean }) {
  const { waiting } = useAsks()
  if (to !== '/decisions' || waiting < 1) return null
  return (
    <>
      {' '}
      <span aria-hidden className={pill ? 'o-count' : undefined}>
        {pill ? waiting : `(${waiting})`}
      </span>
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
    <p className="o-body o-measure mt-6 o-panel p-4">
      <span className="font-semibold">This is example data, not a real record.</span>{' '}
      {note} Nothing you do here reaches anyone, and nothing here was written by a person.
    </p>
  )
}

/**
 * The account panel: who you are, and the way out.
 *
 * The two settings that lived here have moved to Adjust, which is a
 * destination in the navigation rather than something behind your own name in
 * a dropdown. Text size and colour intensity are, for a fair number of the
 * people using this, the difference between a readable screen and an unusable
 * one; hiding them one press deeper than everything else was a statement about
 * how often we expected them to be needed, and it was the wrong one.
 *
 * What is left is what a panel behind somebody's name should hold: who they
 * are signed in as, where the settings went, and how to leave.
 */
function Account({ onSignOut }: { onSignOut: () => void }) {
  const { option, organisation } = useSession()

  return (
    <div className="border-t border-black bg-[var(--paper)]">
      <div className="o-wrap py-8">
        <p className="o-h3">{option?.name}</p>
        <p className="o-meta mt-1">
          {option?.title}
          {organisation ? ` · ${organisation}` : ''}
        </p>

        <p className="o-body o-measure mt-6">
          Text size, colour, movement and what this device keeps are on{' '}
          <Link to="/adjust" className="underline">
            Adjust
          </Link>
          .
        </p>

        <hr className="o-rule my-8" />
        <button type="button" className="o-btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
