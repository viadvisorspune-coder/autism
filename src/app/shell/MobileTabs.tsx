import { NavLink, useLocation } from 'react-router-dom'
import { requestsFor } from '../../data/db'
import { useRecordId } from '../../state/record'

/**
 * The patient interface on a phone.
 *
 * Ananya reads this on a bad day, standing up, one-handed, often on the way
 * somewhere. That is a different machine from the one the desktop layout was
 * designed for, and treating it as a narrow desktop produced two specific
 * failures: a top bar with seven controls in 390 points, which overflowed the
 * screen and slid sideways; and a floating "Ask ORCA" pill that sat on top of
 * the text it was meant to help with.
 *
 * A tab bar fixes both by moving the primary destinations to the bottom of the
 * screen, where a thumb actually reaches. The top of a modern phone is the
 * hardest place on the device to touch and the easiest place to put things,
 * which is why so many apps put their controls there and why so few people
 * use them.
 *
 * Five tabs, because that is what fits at a legible size, and every one is a
 * destination rather than an action — a tab bar that sometimes navigates and
 * sometimes does something is the fastest way to make people afraid of it.
 * Asking ORCA sits in the middle, raised and coloured, because it is the one
 * thing this product is for and because the centre is where the thumb rests.
 *
 * "More" opens the same drawer the desktop uses, so nothing becomes
 * unreachable by being demoted — the shape changes, the map does not.
 *
 * Targets are 44 points minimum and the bar carries the home-indicator inset,
 * so the last row is not sitting under the gesture area on a modern iPhone.
 */

interface Tab {
  label: string
  to?: string
  end?: boolean
  onPress?: () => void
  centre?: boolean
  badge?: number
  icon: string
}

export function MobileTabs({
  onOpenMore,
  patientId: given,
}: {
  onOpenMore: () => void
  patientId?: string
}) {
  const patientId = useRecordId(given)
  const location = useLocation()

  // Derived from the record rather than polled: a request with an unanswered
  // question is this person's turn, and a number on a tab is only worth
  // showing if pressing it leads to the thing the number is about.
  const yourTurn = requestsFor(patientId).filter((r) =>
    r.clarifications.some((c) => !c.answer),
  ).length

  const tabs: Tab[] = [
    { label: 'Home', to: '/patient', end: true, icon: '⌂' },
    { label: 'My story', to: '/patient/story', icon: '☰' },
    { label: 'Ask ORCA', to: '/patient/guide', centre: true, icon: '✦' },
    { label: 'Requests', to: '/patient/requests', badge: yourTurn, icon: '↗' },
    { label: 'More', onPress: onOpenMore, icon: '⋯' },
  ]

  return (
    <nav
      aria-label="Main"
      className="frost fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.to
          ? tab.end
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to)
          : false

        const inner = (
          <>
            <span
              aria-hidden
              className={
                tab.centre
                  ? 'flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[1rem] text-white'
                  : `text-[1.05rem] leading-none ${active ? 'text-brand' : 'text-muted'}`
              }
            >
              {tab.icon}
            </span>
            <span
              className={`text-[0.68rem] leading-none ${
                active ? 'font-semibold text-brand' : 'text-muted'
              }`}
            >
              {tab.label}
            </span>
            {tab.badge ? (
              <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-state-alert px-1 text-[0.62rem] font-semibold text-white">
                {tab.badge}
              </span>
            ) : null}
          </>
        )

        const shell =
          'relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5'

        return tab.to ? (
          <NavLink key={tab.label} to={tab.to} end={tab.end} className={shell}>
            {inner}
          </NavLink>
        ) : (
          <button key={tab.label} onClick={tab.onPress} className={shell}>
            {inner}
          </button>
        )
      })}
    </nav>
  )
}
