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
      <h1 className="o-title o-measure">{children}</h1>
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

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="o-body mb-8 inline-block font-semibold underline">
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
