/**
 * The icon set: line drawings at one weight, and nothing that means anything.
 *
 * EVERY ICON HERE IS DECORATIVE, and the markup says so — `aria-hidden` is not
 * optional on any of them. Each one sits beside a word that carries the whole
 * meaning, and none is the only way to know what something is. That rule is why
 * a set this small is enough: an icon that had to be understood on its own
 * would need to be a much better icon than any of these, and the honest fix for
 * "nobody knows what this glyph means" is a word next to it, which is what
 * every call site already has.
 *
 * ONE WEIGHT, ONE GRID. 24px box, 1.7px stroke, round caps and joins, no fills
 * except where a shape is genuinely solid. Mixing stroke weights across a set
 * is the thing that makes hand-assembled icons look hand-assembled.
 *
 * They inherit `currentColor` and size from `width`/`height` props, so a rail
 * link tinting itself tints its icon, and nothing needs a second colour rule.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Glyph({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.6V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.6" />
    <path d="M10 20v-5h4v5" />
  </Glyph>
)

/** Ask. A speech shape rather than a question mark: it is a conversation. */
export const IconAsk = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.6 9.6 0 0 1-2.6-.35L5 20.5l1.1-3.1A6.2 6.2 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" />
    <path d="M9.5 11.2a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 1.9-2.4 3.2" />
  </Glyph>
)

/** Record. Layered entries in time, not a clock. */
export const IconRecord = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6 4.5h9.5L20 9v10.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
    <path d="M15 4.5V9h4.6" />
    <path d="M8.4 13h7M8.4 16.4h4.6" />
  </Glyph>
)

/** Decisions. Two ways to go, and a person who picks. */
export const IconDecisions = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 4.2v6.4" />
    <path d="M12 10.6 6.8 14.2M12 10.6l5.2 3.6" />
    <circle cx="12" cy="3.4" r="1.6" />
    <circle cx="5.9" cy="15.4" r="1.7" />
    <circle cx="18.1" cy="15.4" r="1.7" />
    <path d="M4.2 19.6h3.4M16.4 19.6h3.4" />
  </Glyph>
)

export const IconDocuments = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M8 3.5h6.6L19 7.9V18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14.4 3.5v4.5H19" />
    <path d="M5 7.4V20a1 1 0 0 0 1 1h9.4" />
  </Glyph>
)

/** Sharing. Three points and the lines between them. */
export const IconSharing = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="17.6" cy="5.9" r="2.4" />
    <circle cx="6.4" cy="12" r="2.4" />
    <circle cx="17.6" cy="18.1" r="2.4" />
    <path d="m8.5 10.9 7-3.8M8.5 13.1l7 3.8" />
  </Glyph>
)

export const IconAppointments = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="3.8" y="5.4" width="16.4" height="14.8" rx="2.2" />
    <path d="M3.8 10h16.4M8.4 3.4v3.6M15.6 3.4v3.6" />
  </Glyph>
)

/** Adjust. Two sliders, because that is what is behind it. */
export const IconAdjust = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4.6 8.4h14.8M4.6 15.6h14.8" />
    <circle cx="9.4" cy="8.4" r="2.3" />
    <circle cx="15" cy="15.6" r="2.3" />
  </Glyph>
)

/** Tasks. A list with things ticked off it. */
export const IconTasks = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4.4 7.2 6 8.8l2.8-3M4.4 16.4 6 18l2.8-3" />
    <path d="M12.2 7.6h7.4M12.2 16.8h7.4" />
  </Glyph>
)

/** Strategies. Something tried, and the direction it went. */
export const IconStrategies = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 17.4 9 11l3.6 3.4L20 6" />
    <path d="M15.4 6H20v4.6" />
  </Glyph>
)

/** Requests. One person asking another. */
export const IconRequests = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4.6 6.6h14.8v9.2a1 1 0 0 1-1 1H8.8L4.6 20V6.6Z" />
    <path d="M9 10.4h6M9 13.4h3.6" />
  </Glyph>
)

/** Runs. Work moving through stages. */
export const IconRuns = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.4V12l3 1.8" />
  </Glyph>
)

/** Access. A key, because that is what this screen hands out. */
export const IconAccess = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="8.4" cy="12" r="3.6" />
    <path d="M12 12h7.6M17 12v2.8M14.8 12v2.2" />
  </Glyph>
)

/** Incidents. Something that needs looking at. */
export const IconIncidents = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 4.6 20.4 19H3.6L12 4.6Z" />
    <path d="M12 10.2v3.6M12 16.4h.01" />
  </Glyph>
)

/** Health. Whether the parts are up. */
export const IconHealth = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M3.6 12.4h4l2-4.6 3 9.4 2.2-6 1.6 3.2h4" />
  </Glyph>
)

/** Caseload. More than one life, which is the whole distinction. */
export const IconCaseload = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="9.2" cy="9" r="3.2" />
    <path d="M3.8 19.2a5.4 5.4 0 0 1 10.8 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.8M17.4 19.2a5 5 0 0 0-2-4" />
  </Glyph>
)

/** Notes. Written by hand, by a person. */
export const IconNotes = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M5 19.4V6a1 1 0 0 1 1-1h8.6L19 9.4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
    <path d="M14.4 5v4.4H19" />
    <path d="M8.4 12.6h6M8.4 15.8h3.4" />
  </Glyph>
)

export const IconSearch = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="10.8" cy="10.8" r="5.8" />
    <path d="m15.2 15.2 4.2 4.2" />
  </Glyph>
)

export const IconBell = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6.6 10.4a5.4 5.4 0 0 1 10.8 0c0 3.4 1.2 4.6 1.6 5.2H5c.4-.6 1.6-1.8 1.6-5.2Z" />
    <path d="M10.2 18.6a2 2 0 0 0 3.6 0" />
  </Glyph>
)

export const IconChevron = (p: IconProps) => (
  <Glyph {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Glyph>
)

export const IconArrow = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4.8 12h14M13.4 6.6 18.8 12l-5.4 5.4" />
  </Glyph>
)

export const IconBack = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M19.2 12H5.2M10.6 6.6 5.2 12l5.4 5.4" />
  </Glyph>
)

export const IconSun = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </Glyph>
)

export const IconMoon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
  </Glyph>
)

/**
 * The whale.
 *
 * ORCA's only piece of illustration, and the only place in the product where a
 * drawing does no work at all. It earns its space on one screen — the panel
 * that has to be approached — and appears nowhere else, because a mascot that
 * turns up beside a disclosure decision would be the interface being cheerful
 * about something that is not.
 */
export const Whale = ({ size = 168, ...rest }: IconProps) => (
  <svg
    aria-hidden
    focusable="false"
    viewBox="0 0 200 150"
    width={size}
    height={(size * 150) / 200}
    fill="none"
    {...rest}
  >
    <path
      d="M28 96c0-27 24-46 55-46 26 0 42 10 53 24 8 10 20 12 30 8 4-2 7 2 5 6-4 9-14 16-25 17 5 6 8 13 8 20 0 3-3 5-6 4-9-3-16-8-21-14-11 8-27 12-44 12-31 0-55-13-55-31Z"
      fill="currentColor"
      opacity="0.92"
    />
    <path
      d="M42 100c8 9 27 15 46 15 12 0 24-2 33-7-9 12-27 19-46 19-19 0-33-10-33-27Z"
      fill="#000"
      opacity="0.12"
    />
    <circle cx="70" cy="74" r="6.5" fill="#fff" />
    <circle cx="71.5" cy="75" r="3.2" fill="#1c1a25" />
    <path d="M92 90c5 4 13 4 18 0" stroke="#1c1a25" strokeWidth="2.4" strokeLinecap="round" />
    <path
      d="M60 50c-3-7-1-14 4-18 1 6 5 10 10 12"
      fill="currentColor"
      opacity="0.92"
    />
  </svg>
)
