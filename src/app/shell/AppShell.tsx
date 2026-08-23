import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../state/session'
import { useMaturity } from '../../state/maturity'
import { onAskOrca } from '../../lib/ask'
import { MobileTabs } from './MobileTabs'
import { ArrivalAlert } from '../../components/ArrivalAlert'
import { Copilot } from '../../components/Copilot'
import { useRecordStatus } from '../../data/RecordProvider'
import { accentByExperience, navByRole } from '../nav'
import { notificationsFor } from '../../data/db'
import { DisplayPanel, EvidencePanel, NotificationPanel, SearchPanel, Toast } from './Panels'

function Logo({ tone }: { tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={`flex h-7 w-7 items-center justify-center rounded-2xl ${tone} text-[0.78rem] font-bold text-white`}
      >
        O
      </span>
      <span className="text-[0.98rem] font-semibold tracking-[-0.01em] text-ink">ORCA</span>
    </span>
  )
}

export default function AppShell() {
  const { role, option, personName, organisation, experience, signOut } = useSession()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<'none' | 'notifications' | 'search' | 'display' | 'profile'>('none')
  // Professionals get a rail rather than a page: an answer beside the thing it
  // is about, not on another screen.
  const [copilot, setCopilot] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  // A shortcut anywhere in the app opens the rail with its question ready.
  useEffect(() => onAskOrca((question) => {
    setPendingQuestion(question)
    setCopilot(true)
  }), [])

  if (!role || !option) return null

  const accent = accentByExperience[experience]
  const items = navByRole[role]
  const unread = notificationsFor(role).filter((n) => n.unread).length

  const close = () => setPanel('none')

  return (
    <div className="min-h-screen">
      {/* ---------------------------------------------------------- top bar */}
      <header className="frost sticky top-0 z-30">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {/* The drawer is reachable from the tab bar on a phone, so this
              button only earns its place on a tablet, where there is no tab
              bar and the sidebar is still hidden. */}
          <button
            className="hidden min-h-[2.75rem] rounded-2xl bg-surface-2 px-3 py-1 text-[0.8rem] text-ink-2 md:block lg:hidden"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
          >
            Menu
          </button>
          <Link to={option.home} className="shrink-0">
            <Logo tone={accent.bg} />
          </Link>
          <span className="hidden truncate border-l border-line pl-3 text-[0.82rem] text-muted sm:block">
            {organisation || 'Personal account'}
          </span>

          <button
            onClick={() => setPanel('search')}
            className="ml-auto hidden w-64 items-center gap-2 rounded-2xl border-line bg-surface-2 px-3 py-1.5 text-left text-[0.82rem] text-muted md:flex"
          >
            Search
          </button>

          <div className="ml-auto flex items-center gap-1 md:ml-0">

            <button
              onClick={() => setPanel('notifications')}
              className="relative rounded-2xl px-2.5 py-1.5 text-[0.82rem] text-ink-2 hover:bg-canvas"
            >
              <span className="hidden sm:inline">Notifications</span>
              <span aria-hidden className="sm:hidden">🔔</span>
              <span className="sr-only sm:hidden">Notifications</span>
              {unread > 0 ? (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-state-alert px-1 text-[0.66rem] font-semibold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setPanel('display')}
              className="hidden rounded-2xl px-2.5 py-1.5 text-[0.82rem] text-ink-2 hover:bg-canvas sm:block"
            >
              Help
            </button>
            <button
              onClick={() => setPanel(panel === 'profile' ? 'none' : 'profile')}
              className="flex items-center gap-2 rounded-2xl px-2 py-1.5 text-[0.82rem] text-ink hover:bg-canvas"
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 items-center justify-center rounded-full ${accent.tint} text-[0.75rem] font-semibold ${accent.text}`}
              >
                {personName.slice(0, 1)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block leading-tight">{personName}</span>
                <span className={`block text-[0.72rem] leading-tight ${accent.text}`}>{option.label}</span>
              </span>
            </button>
          </div>
        </div>

        {panel === 'profile' ? (
          <div className="frost elevate absolute right-4 top-14 z-40 w-64 rounded-[20px] p-2">
            <p className="px-3 py-2 text-[0.8rem] text-muted">
              Signed in as <span className="text-ink">{personName}</span>
              <span className="mt-0.5 block">{option.title}</span>
            </p>
            <button
              onClick={() => {
                close()
                setPanel('display')
              }}
              className="w-full rounded-2xl px-3 py-2 text-left text-[0.85rem] text-ink hover:bg-canvas"
            >
              Display settings
            </button>
            <button
              onClick={() => {
                signOut()
                navigate('/')
              }}
              className="w-full rounded-2xl px-3 py-2 text-left text-[0.85rem] text-ink hover:bg-canvas"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[100rem]">
        {/* ------------------------------------------------ primary navigation */}
        {/* Below lg this is a sheet over the page, not a block that shoves the
            page sideways. Tapping the greyed area closes it, which is what
            everyone tries first. */}
        {navOpen ? (
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 top-14 z-30 bg-ink/25 lg:hidden"
          />
        ) : null}
        <nav
          aria-label="Primary"
          className={`${
            navOpen
              ? 'fixed inset-y-14 left-0 z-40 w-[17rem] max-w-[85vw] overflow-y-auto pb-24'
              : 'hidden'
          } frost shrink-0 px-3 py-4 lg:sticky lg:inset-auto lg:top-14 lg:z-auto lg:block lg:h-[calc(100vh-3.5rem)] lg:w-60 lg:max-w-none lg:overflow-y-auto lg:pb-4`}
        >
          <p className="mb-2 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
            {option.label}
          </p>
          <Frequent onNavigate={() => setNavOpen(false)} />
          {items.map((group) => (
            <div key={group.title} className="mb-5 last:mb-0">
              <p
                className={`mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.09em] ${accent.text}`}
              >
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setNavOpen(false)}
                      className={({ isActive }) =>
                        `block min-h-[2.75rem] rounded-2xl px-3 py-2.5 text-[0.86rem] ${
                          isActive
                            ? `${accent.tint} ${accent.text} font-medium`
                            : 'text-ink-2 hover:bg-canvas hover:text-ink'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* The way in, in the navigation where it was asked for. One control
              per surface: this on a desktop, the centre tab on a phone, where
              the sidebar is behind a drawer and two taps from a thumb. */}
          <button
            onClick={() => {
              setNavOpen(false)
              if (role === 'patient') navigate('/patient/guide')
              else setCopilot(true)
            }}
            className={`mt-5 block w-full rounded-[20px] ${accent.bg} px-4 py-4 text-left text-white hover:opacity-95`}
          >
            <span className="flex items-center gap-2 text-[0.95rem] font-semibold">
              <span aria-hidden>✦</span> Ask ORCA
            </span>
            <span className="mt-1 block text-[0.79rem] leading-relaxed text-white/85">
              {role === 'patient'
                ? 'Describe what is happening in your own words. It answers from your record, and stops to ask you before anything is shared.'
                : 'Ask about this record, or your whole caseload. It answers from what you are allowed to see.'}
            </span>
          </button>

          <p className="mt-6 px-3 text-[0.72rem] leading-relaxed text-muted">
            ORCA supports decisions. It does not diagnose, and it never shares anything without
            explicit approval.
          </p>
        </nav>

        {/* ------------------------------------------------------- main content */}
        {/* pb-28 on a phone so the last card is not sitting under the tabs. */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 sm:py-8 md:pb-8">
          <RecordBanner />
          <VisitRecorder />
          <Outlet />
        </main>

        {/* A rail, not an overlay: the record stays readable beside the answer,
            which is the whole reason a clinician would use it mid-conversation. */}
        {copilot ? (
          <div className="hidden w-[24rem] shrink-0 xl:block">
            <div className="sticky top-14 h-[calc(100vh-3.5rem)]">
              <Copilot
                onClose={() => setCopilot(false)}
                question={pendingQuestion}
                onQuestionUsed={() => setPendingQuestion(null)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Below xl there is no room beside the record, so it becomes a panel. */}
      {copilot ? (
        <div className="fixed inset-0 z-40 flex justify-end xl:hidden">
          <button
            aria-label="Close copilot"
            onClick={() => setCopilot(false)}
            className="flex-1 bg-ink/20"
          />
          <div className="h-full w-[24rem] max-w-full">
            <Copilot
              onClose={() => setCopilot(false)}
              question={pendingQuestion}
              onQuestionUsed={() => setPendingQuestion(null)}
            />
          </div>
        </div>
      ) : null}

      {/* The single way in. There used to be four — a header button, a sidebar
          card, this pill, and a tab — reaching two different chat surfaces, so
          "ask ORCA" meant something different depending on where you pressed. */}
      {role === 'patient' ? <MobileTabs onOpenMore={() => setNavOpen(true)} /> : null}

      {/* Something arriving for you mid-task is worth showing wherever you are,
          so it lives in the shell rather than on any one screen. */}
      <ArrivalAlert />

      {panel === 'notifications' ? <NotificationPanel onClose={close} /> : null}
      {panel === 'search' ? <SearchPanel onClose={close} /> : null}
      {panel === 'display' ? <DisplayPanel onClose={close} /> : null}
      <EvidencePanel />
      <Toast />
    </div>
  )
}


/**
 * Said once, at the top of every screen, rather than repeated per card.
 *
 * Only shown when the record is NOT live. A page that cannot tell you whether
 * it holds your record or a demonstration of one is worse than a page that
 * admits it, but a banner on every screen every time it is working correctly
 * is noise, and noise is the thing this interface is trying to spend least of.
 */
function RecordBanner() {
  const { status, note } = useRecordStatus()
  if (status === 'live') return null

  // While it is still loading, one quiet line rather than an alarm. The screen
  // below is already usable; this only says it is not yet the real record.
  if (status === 'loading') {
    return <p className="mb-5 text-[0.79rem] text-muted">Loading your record. Showing example data meanwhile.</p>
  }

  return (
    <div className="mb-6 rounded-[20px]  bg-state-wait-tint px-4 py-3">
      <p className="text-[0.85rem] font-semibold text-ink">Demonstration data</p>
      <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">
        {note ?? 'The live record could not be reached.'} Everything below is the prototype's own example
        record. It is not a reading of anyone's information.
      </p>
    </div>
  )
}


/**
 * Counting what this person actually does.
 *
 * Only the page they landed on, only once per navigation, only on this device.
 * It exists to answer one question — which of these fifteen destinations does
 * this person keep going back to — so that after a fortnight the two they
 * always use can be offered before the thirteen they never open.
 *
 * Deliberately a path and nothing else. No timings, no content, nothing about
 * what they read when they got there. The point is to shorten a journey the
 * person is already making, and anything beyond the destination would be
 * surveillance dressed as convenience.
 */
function VisitRecorder() {
  const location = useLocation()
  const { record } = useMaturity()
  const last = useRef<string | null>(null)

  useEffect(() => {
    const path = location.pathname
    if (last.current === path) return
    last.current = path
    const leaf = path.split('/').filter(Boolean).slice(1).join('/') || 'home'
    record(`visit:${leaf}`)
  }, [location.pathname, record])

  return null
}

/**
 * The two or three places this person always ends up.
 *
 * Sits above the grouped navigation once there is enough history to be sure,
 * and says why it is there. An unexplained list that reorders itself is
 * disorienting for anyone and worse for someone who navigates by position —
 * so this is additive, sits in a fixed place, and never reorders the real
 * navigation underneath it.
 */
function Frequent({ onNavigate }: { onNavigate: () => void }) {
  const { level, frequent } = useMaturity()
  const { role } = useSession()
  if (level < 2 || !role) return null

  const groups = navByRole[role]
  const all = groups.flatMap((g) => g.items)

  const top = frequent(8)
    .filter((a) => a.startsWith('visit:'))
    .map((a) => a.replace('visit:', ''))
    .map((leaf) => all.find((item) => item.to.split('/').filter(Boolean).slice(1).join('/') === leaf))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 3)

  if (top.length < 2) return null

  return (
    <div className="mb-5">
      <p className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-muted">
        You come here often
      </p>
      <ul className="space-y-0.5">
        {top.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className="block rounded-2xl px-3 py-2 text-[0.86rem] text-ink-2 hover:bg-canvas hover:text-ink"
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
