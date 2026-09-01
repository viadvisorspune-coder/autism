/**
 * The pieces every screen is built from.
 *
 * Two of them — the refusal and the gate — are the reason this file exists.
 * Twelve of the thirty-five things people come here to do end in one or the
 * other, which makes them the most-used components in the product and the ones
 * most often left to fall out of an error state. They are designed here,
 * deliberately, once.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type Block, htmlToBlocks, htmlToText } from '../lib/prose'
import { people } from '../data/db'
import { type Domain, type Tone, domainName, toneClass } from './system'
import { ago } from './draft'
import { ActionButton, useAction } from './action'

/* ------------------------------------------------------------ structure */

/** A card: a colour block, a hairline, and content. Nothing floats. */
export function Card({
  tone,
  tall,
  children,
  className = '',
}: {
  tone: Tone
  tall?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`o-card ${toneClass[tone]} ${className}`}>
      <div className={`o-band ${tall ? 'o-band-tall' : ''}`} />
      {children}
    </div>
  )
}

/** The one real heading on a screen. Literal, never a slogan. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-10">
      {/*
        Where focus lands after a navigation.

        tabIndex -1 so it can be focused programmatically without joining the
        tab order — a heading that traps a Tab press on the way past would be a
        worse problem than the one this solves.
      */}
      <h1 className="o-title o-measure" tabIndex={-1} data-focus-target>
        {children}
      </h1>
      {sub ? <p className="o-meta mt-3 o-measure">{sub}</p> : null}
    </div>
  )
}

/** A section heading, with the hairline that separates it from what is above. */
export function SectionHead({ children }: { children: ReactNode }) {
  return (
    <>
      <hr className="o-rule mb-5" />
      <h2 className="o-h2 mb-5">{children}</h2>
    </>
  )
}

export function Back({
  to,
  state,
  children,
}: {
  to: string
  /**
   * What the screen being returned to should pick up.
   *
   * Going back from an answer used to arrive at an empty Ask box, which asks
   * somebody to retype a question that is on the screen they just left. The
   * state travels with the navigation so the destination can restore it.
   */
  state?: unknown
  children: ReactNode
}) {
  return (
    <Link to={to} state={state} className="o-body mb-8 inline-block font-semibold underline">
      ← {children}
    </Link>
  )
}

/* ------------------------------------------------------------- refusal */

/** Who holds the part of the record this person cannot see. */
function clinicalTeam(): string {
  const team = people
    .filter((p) => p.role === 'psychologist' || p.role === 'psychiatrist' || p.role === 'gp')
    .filter((p) => p.active !== false)
    .map((p) => p.name)
  return team.length ? team.join(' · ') : "Ananya's clinical team"
}

/**
 * The wall.
 *
 * Three parts, always: what is not available, who can see it, what to do
 * instead. The last one is the part that is usually missing — a refusal that
 * only says no makes the person guess, and guessing about somebody else's
 * medical record is exactly the behaviour this product exists to remove. This
 * one names where the information lives and what their route to it is.
 *
 * NEVER CONFIRMS EXISTENCE. "Not available to you" reads identically whether
 * the record holds the thing or not. Anil asking about a diagnosis and Anil
 * asking about a diagnosis that was never made get the same screen, because
 * any difference between the two is itself a disclosure.
 *
 * NEVER APOLOGISES. No "sorry", no "unfortunately". The boundary is correct,
 * and stating it plainly is more respectful than softening it.
 */
export function Refusal({
  domain,
  instead,
}: {
  domain: Domain
  /** Divya's route is different from everybody else's, so it is passed in. */
  instead?: ReactNode
}) {
  return (
    <Card tone="past">
      <div className="o-card-body">
        <h2 className="o-h2 mb-6">Not available to you</h2>
        <p className="o-body o-measure">
          {domainName[domain]} is not part of your access to Ananya&rsquo;s record.
        </p>

        <h3 className="o-h3 mb-2 mt-8">Who can see this</h3>
        <p className="o-body o-measure">{clinicalTeam()}</p>

        <h3 className="o-h3 mb-2 mt-8">If you need this</h3>
        <p className="o-body o-measure">
          {instead ?? 'Ask Ananya directly, or contact her care coordinator.'}
        </p>
      </div>
    </Card>
  )
}

/**
 * The door.
 *
 * A different screen from the refusal because the outcome is different: there
 * is a route, and it runs through the person whose record it is. Showing both
 * as the same wall would misrepresent one of them, and it is this one — where
 * the consent model actually shows — that would be lost.
 *
 * Asking creates an item in Ananya's Decisions. She sees what is being asked
 * for and why, and can approve or decline.
 */
export function Gate({
  domain,
  kind = 'domain',
  requested,
  onRequest,
}: {
  domain: Domain
  /**
   * Which gate this is.
   *
   * `reason` is the employer asking why an adjustment is needed — an entirely
   * reasonable question whose answer happens to be clinical. Wording it like
   * the other gate produced "workplace information is part of Ananya's
   * clinical record", which is not true and reads as the system covering
   * something up at precisely the moment it is trying to be honest.
   */
  kind?: 'domain' | 'reason'
  requested?: boolean
  onRequest: () => void
}) {
  return (
    <Card tone="decision">
      <div className="o-card-body">
        <h2 className="o-h2 mb-6">This needs Ananya&rsquo;s permission</h2>
        <p className="o-body o-measure">
          {kind === 'reason' ? (
            <>
              You can see what is in place. Why it is needed comes from Ananya&rsquo;s health
              information, which is not part of your access. Telling you that needs her explicit
              consent, which is not currently on file.
            </>
          ) : (
            <>
              {domainName[domain]} is part of Ananya&rsquo;s clinical record. Your access to that
              record needs her explicit consent, which is not currently on file.
            </>
          )}
        </p>

        <h3 className="o-h3 mb-4 mt-8">What you can do</h3>
        {requested ? (
          <>
            <p className="o-body o-measure font-semibold">You have asked Ananya for access.</p>
            <p className="o-meta o-measure mt-3">
              It is waiting in her Decisions. Nothing was read from her record, and nothing will
              be until she decides.
            </p>
          </>
        ) : (
          <>
            <button type="button" className="o-btn o-btn-primary" onClick={onRequest}>
              Ask Ananya for access
            </button>
            <p className="o-body o-measure mt-5">
              She will see what you are asking for and why, and can approve or decline.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * The boundary, said on every answer rather than only on the refusals.
 *
 * "What am I not being shown" works better as a standing element than as a
 * question somebody has to think to ask — making it exceptional would mean
 * most people never discover the boundary exists at all. Standing also stops
 * it reading as a rebuke on the occasions when it matters.
 *
 * Renders nothing for the people who can see everything, because for them
 * there is nothing true to say.
 */
export function NotShown({ boundary }: { boundary: { what: string; who: string } | null }) {
  if (!boundary) return null
  return (
    <section className="mt-10">
      <h3 className="o-h3 mb-2">Not shown</h3>
      <p className="o-body o-measure">{boundary.what}</p>
      <h3 className="o-h3 mb-2 mt-6">Who can see it</h3>
      <p className="o-body o-measure">{boundary.who}</p>
    </section>
  )
}

/* ---------------------------------------------------------------- prose */

/**
 * The workflow's HTML, drawn as typed blocks.
 *
 * Every block is a React element built from text — no markup from the workflow
 * ever reaches the DOM. See lib/prose.ts for why that matters more here than
 * it looks: the HTML is model-authored, and a record can legitimately contain
 * something shaped like a tag.
 */
export function Prose({ html, className = 'o-answer' }: { html: string; className?: string }) {
  const blocks: Block[] = htmlToBlocks(html)
  const [copied, setCopied] = useState(false)

  if (!blocks.length) {
    return (
      <p className="o-body">
        The answer came back empty. Nothing was left out on purpose.
      </p>
    )
  }

  return (
    <div>
      <div className="o-measure space-y-5">
        {blocks.map((b, i) => {
          if (b.kind === 'heading')
            return (
              <h3 key={i} className="o-h3 pt-3">
                {b.text}
              </h3>
            )
          if (b.kind === 'list')
            return (
              <ul key={i} className="space-y-3">
                {b.items.map((item, j) => (
                  <li key={j} className={`${className} flex gap-3`}>
                    <span aria-hidden className="mt-[0.7em] h-[3px] w-3 shrink-0 bg-black" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          if (b.kind === 'quote')
            return (
              <p key={i} className={`${className} border-l-2 border-black pl-4`}>
                {b.text}
              </p>
            )
          return (
            <p key={i} className={className}>
              {b.text}
            </p>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(htmlToText(html))
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        }}
        className="o-meta mt-6 underline"
      >
        {copied ? 'Copied' : 'Copy this answer'}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- dates */

export function longDate(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function shortDate(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * A read that failed, said as a failure.
 *
 * The distinction this exists for: **empty is not unavailable is not broken.**
 * "You have no decisions waiting" and "we could not find out whether you have
 * decisions waiting" are different facts, and only the first one means you can
 * stop looking. Rendering the second as the first is how somebody misses the
 * thing that was waiting for them.
 *
 * Three parts, like every other failure in this interface: what happened, why,
 * and what to do. It keeps retrying on its own, so the honest instruction is
 * usually "wait" rather than a button that does what is already happening.
 */
export function CouldNotLoad({
  what,
  onRetry,
}: {
  what: string
  onRetry?: () => void | boolean | Promise<boolean | void>
}) {
  return (
    <div role="alert" className="o-card">
      <div className="o-card-body">
        <h2 className="o-h3 mb-3">{what} could not be loaded</h2>
        <p className="o-body o-measure">
          The record did not answer. This is a connection problem, not a change to what you are
          allowed to see — nothing has been hidden and nothing has been lost.
        </p>
        {/*
          Said out loud, because a read that retries itself is the one case
          where automatic retrying is fine and the rule is that it must be
          communicated rather than silent. Reading again costs nothing and
          changes nothing; a send would be a different matter, and nothing in
          this interface retries one of those on its own.
        */}
        <p className="o-body o-measure mt-4">
          ORCA keeps trying every few seconds. What is on screen may be out of date until it
          succeeds.
        </p>
        {onRetry ? <RetryNow onRetry={onRetry} /> : null}
      </div>
    </div>
  )
}

/**
 * "Try now", reporting on itself.
 *
 * Pressing this used to do nothing visible: the read takes a moment, the button
 * did not change, and the screen it is on looks identical during the attempt
 * and after a failed one. So people pressed it again, and again. Now it says
 * what it is doing for exactly as long as it is doing it.
 *
 * Separate from `CouldNotLoad` only because it needs a hook, and a hook inside
 * a conditional is not one.
 */
function RetryNow({ onRetry }: { onRetry: () => void | boolean | Promise<boolean | void> }) {
  const action = useAction(() => Promise.resolve(onRetry()))
  return (
    <div className="mt-6">
      <ActionButton
        action={action}
        idle="Try now"
        working="Updating your record…"
        done="Updated just now"
        failed="Still not answering"
      />
    </div>
  )
}

/** An empty screen that says why it is empty and what would fill it. */
export function Nothing({ children }: { children: ReactNode }) {
  return (
    <div className="o-card">
      <div className="o-card-body">
        <p className="o-body o-measure">{children}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ expand and collapse */

/**
 * A section that opens.
 *
 * ONE COMPONENT, SO EVERY DISCLOSURE IN ORCA BEHAVES IDENTICALLY. The chevron
 * points down when there is more and up when it is showing, the heading is the
 * control rather than a separate affordance beside it, and the state is on the
 * button as `aria-expanded` rather than implied by the arrow — an arrow is a
 * picture of a state, not a statement of one.
 *
 * `note` sits outside the collapsed region on purpose. On the answer screen it
 * is the number of entries the answer rests on, and that is not a detail to be
 * opened for: an answer that cites three entries and one that cites none must
 * be distinguishable without a click.
 *
 * The content stays mounted and is made `inert` while closed, so a collapsed
 * section cannot be tabbed into and nothing inside it is announced. Rendering
 * it only when open would work too, and would throw away the height transition
 * along with any scroll position inside it.
 */
export function Disclosure({
  summary,
  note,
  defaultOpen = false,
  children,
}: {
  summary: string
  note?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="o-h3 flex w-full items-center justify-between gap-4 text-left"
      >
        <span>{summary}</span>
        {/*
          Hidden from the accessibility tree. `aria-expanded` above already
          says which way this is, and a screen reader reading "up pointing
          triangle" after it is the same fact twice in a worse language.
        */}
        <span aria-hidden className="shrink-0">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {note ? <div className="mt-3">{note}</div> : null}
      <div className="o-reveal" data-open={open ? 'yes' : 'no'}>
        <div inert={!open}>
          <div className="pt-6">{children}</div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ system status */

/**
 * What ORCA is doing, said in a sentence.
 *
 * ONE COMPONENT FOR EVERY WAIT IN THE PRODUCT. Reading, checking, saving,
 * sending, updating, and failing to do any of those. They were previously
 * either invisible — a screen that renders nothing while it reads looks exactly
 * like a screen with nothing on it — or written inline in slightly different
 * words on each screen.
 *
 * NO SPINNER, AND NOT BECAUSE OF TASTE. A spinner says "something is
 * happening" and nothing else. Everyone here is waiting on something specific:
 * their record being read, their decision being sent, a draft being written.
 * The sentence is the indicator, and it says which. A shimmer skeleton is worse
 * again — it animates continuously, in the shape of content that does not exist
 * yet, on an interface built for people who find unnecessary movement
 * expensive.
 *
 * `role="status"` rather than an alert: this is progress, not an interruption.
 * A screen reader hears it at the next pause instead of over what it was
 * already saying. `Failed` below is the one that interrupts.
 */
export function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="o-body o-measure border border-black p-5">
      {children}
    </p>
  )
}

/**
 * A first read, before there is anything to show.
 *
 * `what` names the thing, so the sentence is "Loading your record" rather than
 * "Loading". Only shown while there is genuinely nothing on screen — a poll
 * that refreshes a list already in front of somebody must not replace it with
 * the word "Loading", which is a screen going backwards.
 */
export function Loading({ what }: { what: string }) {
  return <Status>Loading {what}…</Status>
}

/**
 * How current what you are looking at is.
 *
 * Deliberately quiet — `o-meta`, no border, no card. It is a footnote about
 * freshness, not an event, and a polling screen that announced every four-second
 * refresh would be an interface tapping somebody on the shoulder to say nothing
 * happened. So it is not a live region: it is there when looked for.
 *
 * Says "not read yet" rather than nothing at all when no read has come back.
 * A missing line is indistinguishable from a line that has not updated.
 */
export function Updated({ at }: { at: string | null }) {
  return <p className="o-meta o-measure mt-8">{at ? `Updated ${ago(at)}.` : 'Not read yet.'}</p>
}

/**
 * Something did not work, and here is what is still true.
 *
 * Four parts, in this order, because that is the order the questions arrive in:
 * what failed, what that did **not** cost, what to do, and what else you can do
 * instead. The second is the one usually missing and the one that matters most
 * here — somebody who has just typed six paragraphs about their child needs to
 * know those six paragraphs still exist before they will read anything else on
 * the screen.
 *
 * `role="alert"` because this one does interrupt. A failure announced at the
 * next convenient pause is a failure announced after the person has already
 * pressed the button again.
 *
 * Nothing retries itself here. A read may — it costs nothing and the screen
 * says so — but a send is consequential, and something that reaches another
 * person's inbox must never be sent twice because a retry was quietly helpful.
 */
export function Failed({
  what,
  kept,
  onRetry,
  retryLabel = 'Try again',
  children,
}: {
  /** The sentence that names the failure, e.g. "We couldn't send this document." */
  what: string
  /** What survived it. Omitted only when genuinely nothing was at stake. */
  kept?: string
  onRetry?: () => void
  retryLabel?: string
  /** A second way out — leaving it as a draft, going back, asking someone else. */
  children?: ReactNode
}) {
  return (
    <div role="alert" className="o-card">
      <div className="o-card-body">
        <p className="o-body o-measure font-semibold">{what}</p>
        {kept ? <p className="o-body o-measure mt-3">{kept}</p> : null}
        <p className="o-body o-measure mt-3">
          Nothing was sent, and nothing is being retried on its own.
        </p>
        {onRetry || children ? (
          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            {onRetry ? (
              <button type="button" className="o-btn o-btn-primary" onClick={onRetry}>
                {retryLabel}
              </button>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  )
}
