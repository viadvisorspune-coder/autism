/**
 * The shell: a rail of destinations, and the screen beside it.
 *
 * ONE SHELL, FOR EVERYBODY. There were two for a while — a header row for the
 * professionals and this rail for Ananya — on the argument that everyone else
 * arrives to do a piece of work and a persistent sidebar is furniture taking
 * width from it. That was wrong about what a rail is. A map of the
 * destinations that stays visible is worth more to somebody moving between a
 * caseload, a record and a set of tasks than to somebody with one record to
 * read, and giving a psychologist a different navigation model than the person
 * whose record she is reading made one product look like two.
 *
 * The list is `navFor(role)` and nothing else: same words, same order, drawn
 * the same way for every account. What a person has on it differs; how they
 * read it does not. It collapses to a strip along the top on a narrow
 * viewport, in CSS, which is the only rearrangement in the whole shell — a
 * 232px column beside a 360px screen leaves no readable measure, so the choice
 * is two shapes against unreadable rather than two shapes against one.
 *
 * The palette is set here, on the root element, from who is signed in. It is a
 * statement about whose record this is rather than a preference: the further
 * from the person, the less colour, and a screen cannot opt out of that by
 * styling itself differently. Structure no longer varies by role; colour still
 * does.
 */
import { useEffect } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../state/session'
import { useRecordStatus } from '../data/RecordProvider'
import { AsksProvider, useAsks } from './asks'
import { SubjectProvider, useSubject } from './subject'
import {
  type Destination,
  type IconName,
  greetingName,
  homeFor,
  navFor,
  paletteFor,
} from './system'
import {
  IconAccess,
  IconAdjust,
  IconAppointments,
  IconAsk,
  IconCaseload,
  IconDecisions,
  IconDocuments,
  IconHealth,
  IconHome,
  IconIncidents,
  IconNotes,
  IconPipeline,
  IconRecord,
  IconRequests,
  IconRuns,
  IconSharing,
  IconStrategies,
  IconTasks,
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

  // The reconnection notice has been read by anyone who moved on. It does not
  // time out — see useConnection — but it does not follow you around either.
  useEffect(() => {
    clearRestored()
  }, [pathname, clearRestored])

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

  /**
   * Which record you are in, above the screen, on every screen.
   *
   * Only for the people who look after more than one. For everybody else there
   * is exactly one record and naming it in the furniture would be noise; for a
   * clinician it is the difference between writing a handover about Ananya and
   * writing one about Rohan.
   */
  const subjectBar =
    choosable && subjectId ? (
      <div className="o-row mb-6">
        <span className="o-row-main">
          <span className="o-row-title block">{subjectName}</span>
          <span className="o-row-meta block">The record every screen below is about</span>
        </span>
        <Link to="/caseload" className="o-chip no-underline">
          Change who this is about
        </Link>
      </div>
    ) : null

  return (
    <div className="o-app">
      <SkipLink />
      <Rail items={items} name={option?.name ?? 'You'} home={homeFor(role)} onSignOut={signOut} />
      <div className="min-w-0">
        {notices}
        <main id="orca-main" className="o-canvas">
          {subjectBar}
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

const GLYPH: Record<IconName, (p: { size?: number }) => React.ReactElement> = {
  home: IconHome,
  ask: IconAsk,
  record: IconRecord,
  decisions: IconDecisions,
  documents: IconDocuments,
  sharing: IconSharing,
  appointments: IconAppointments,
  adjust: IconAdjust,
  tasks: IconTasks,
  strategies: IconStrategies,
  requests: IconRequests,
  runs: IconRuns,
  access: IconAccess,
  incidents: IconIncidents,
  health: IconHealth,
  caseload: IconCaseload,
  notes: IconNotes,
  pipeline: IconPipeline,
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
  home,
  onSignOut,
}: {
  items: Destination[]
  name: string
  /** Where the wordmark goes. Each role's own first screen, never a fixed one. */
  home: string
  onSignOut: () => void
}) {
  return (
    <div className="o-rail">
      <Link
        to={home}
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
        {/*
          The initial of what you would call them, not of the string.

          `name[0]` on "Dr Kavita Nair" is D, which is the initial of an
          honorific rather than of a person — every clinician in the cast had
          the same letter in their own profile card.
        */}
        <span aria-hidden className="o-avatar">
          {(greetingName(name).split(' ').pop() ?? name).slice(0, 1)}
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
