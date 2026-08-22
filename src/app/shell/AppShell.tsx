import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSession } from '../../state/session'
import { useRecordStatus } from '../../data/RecordProvider'
import { accentByExperience, navByRole } from '../nav'
import { notificationsFor } from '../../data/db'
import { DisplayPanel, EvidencePanel, NotificationPanel, SearchPanel, Toast } from './Panels'

function Logo({ tone }: { tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={`flex h-7 w-7 items-center justify-center rounded-md ${tone} text-[0.78rem] font-bold text-white`}
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
  const [navOpen, setNavOpen] = useState(false)

  if (!role || !option) return null

  const accent = accentByExperience[experience]
  const items = navByRole[role]
  const unread = notificationsFor(role).filter((n) => n.unread).length

  const close = () => setPanel('none')

  return (
    <div className="min-h-screen">
      {/* ---------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            className="rounded-md border border-line px-2 py-1 text-[0.8rem] text-ink-2 lg:hidden"
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
            className="ml-auto hidden w-64 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-left text-[0.82rem] text-muted hover:border-line-strong md:flex"
          >
            Search
          </button>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              onClick={() => setPanel('search')}
              className="rounded-md px-2.5 py-1.5 text-[0.82rem] text-ink-2 hover:bg-canvas md:hidden"
            >
              Search
            </button>
            <button
              onClick={() => setPanel('notifications')}
              className="relative rounded-md px-2.5 py-1.5 text-[0.82rem] text-ink-2 hover:bg-canvas"
            >
              Notifications
              {unread > 0 ? (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-state-alert px-1 text-[0.66rem] font-semibold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setPanel('display')}
              className="rounded-md px-2.5 py-1.5 text-[0.82rem] text-ink-2 hover:bg-canvas"
            >
              Help
            </button>
            <button
              onClick={() => setPanel(panel === 'profile' ? 'none' : 'profile')}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.82rem] text-ink hover:bg-canvas"
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
          <div className="absolute right-4 top-14 z-40 w-64 rounded-[10px] border border-line bg-surface p-2 shadow-lg">
            <p className="px-3 py-2 text-[0.8rem] text-muted">
              Signed in as <span className="text-ink">{personName}</span>
              <span className="mt-0.5 block">{option.title}</span>
            </p>
            <button
              onClick={() => {
                close()
                setPanel('display')
              }}
              className="w-full rounded-md px-3 py-2 text-left text-[0.85rem] text-ink hover:bg-canvas"
            >
              Display settings
            </button>
            <button
              onClick={() => {
                signOut()
                navigate('/')
              }}
              className="w-full rounded-md px-3 py-2 text-left text-[0.85rem] text-ink hover:bg-canvas"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[100rem]">
        {/* ------------------------------------------------ primary navigation */}
        <nav
          aria-label="Primary"
          className={`${
            navOpen ? 'block' : 'hidden'
          } w-full shrink-0 border-r border-line bg-surface px-3 py-4 lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)] lg:w-60 lg:overflow-y-auto`}
        >
          <p className="mb-2 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
            {option.label}
          </p>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-[0.87rem] ${
                      isActive
                        ? `${accent.tint} font-medium text-ink`
                        : 'text-ink-2 hover:bg-canvas hover:text-ink'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {role === 'patient' ? (
            <Link
              to="/patient/guide"
              onClick={() => setNavOpen(false)}
              className="mt-5 block rounded-[10px] bg-brand px-4 py-3 text-white"
            >
              <span className="block text-[0.9rem] font-semibold">Talk to ORCA</span>
              <span className="mt-0.5 block text-[0.78rem] text-white/80">
                Ask about anything that is going on
              </span>
            </Link>
          ) : null}

          <p className="mt-6 px-3 text-[0.72rem] leading-relaxed text-muted">
            ORCA supports decisions. It does not diagnose, and it never shares anything without
            explicit approval.
          </p>
        </nav>

        {/* ------------------------------------------------------- main content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <RecordBanner />
          <Outlet />
        </main>
      </div>

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
    <div className="mb-6 rounded-[10px] border border-state-wait/25 bg-state-wait-tint px-4 py-3">
      <p className="text-[0.85rem] font-semibold text-ink">Demonstration data</p>
      <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">
        {note ?? 'The live record could not be reached.'} Everything below is the prototype's own example
        record. It is not a reading of anyone's information.
      </p>
    </div>
  )
}
