/**
 * The shape mark: warmth for Ananya, and nothing else.
 *
 * A large flat geometric form in one accent colour, sitting in a colour field
 * at the top of a card. Circle, diamond, arch, cross, octagon, chevron. Static,
 * flat, no gradient, no illustration, no motion.
 *
 * WHY THIS IS ALLOWED AT ALL. The guidance is explicit that there is no autism
 * aesthetic and that pastel-and-clouds is its own anti-pattern. Nothing in it
 * forbids a soft corner or a piece of colour; what it forbids is decoration
 * pretending to be information, and anything childish. A flat diamond in mint
 * is neither. What it buys is recognition: a person scanning eight cards finds
 * the one about their mornings by its shape before they have read a word, and
 * a screen that is only type is a screen nobody wants to open.
 *
 * WHY IT CARRIES NO MEANING. Everything the mark says is also in the text
 * beside it. In greyscale, or to somebody who cannot separate mint from
 * lavender, nothing whatsoever is lost — the title still says what the card is.
 * This is the line between warmth and information, and it is the reason the
 * assignment below is by topic rather than by status: status is meaning, and
 * meaning does not go in a shape.
 *
 * WHY IT IS HERS ALONE. Anil's is an HR interface and Tejas's is operational
 * software; a playful employer screen would read as unserious about somebody's
 * employment, which is the opposite of what makes him trust it. Professionals
 * get white cards and, where a status needs marking, an accent bar. Same
 * system, different amount.
 *
 * WHY IT IS STABLE. Mornings is always the mint diamond. A mark that rotates is
 * a mark that has to be re-learned every time, which is worse than not having
 * one — so the assignment is a hash of the topic, not of the entry, and the
 * same topic returns the same pairing on every screen and every session.
 */
import type { EventCategory } from '../data/types'

export type ShapeName = 'circle' | 'diamond' | 'arch' | 'cross' | 'octagon' | 'chevron'

export interface Mark {
  shape: ShapeName
  /** The shape itself. */
  ink: string
  /** The field it sits in. */
  field: string
}

/**
 * Six pairings, assigned by topic.
 *
 * Drawn from Ananya's own five governance colours plus two neighbours, so the
 * marks sit in the same world as the rest of her interface rather than
 * introducing a second palette. Each field is the ink at roughly a fifth
 * strength, which keeps the shape legible against it without either fighting
 * the other.
 */
const MARKS: Mark[] = [
  { shape: 'diamond', ink: '#7fb8a4', field: '#e4f1ec' }, // mint
  { shape: 'circle', ink: '#e0a458', field: '#faeddc' }, // amber
  { shape: 'arch', ink: '#a78bc4', field: '#efe7f6' }, // lavender
  { shape: 'chevron', ink: '#e08a70', field: '#fbe7e1' }, // coral
  { shape: 'octagon', ink: '#6f9bbd', field: '#e4eef5' }, // blue
  { shape: 'cross', ink: '#c9ab52', field: '#f7f0dc' }, // ochre
]

/**
 * A stable index from a string.
 *
 * Deliberately the dullest possible hash. It has to be stable across sessions
 * and across devices, which rules out anything involving insertion order or a
 * random seed, and it does not have to be good — six buckets and a handful of
 * topics.
 */
function bucket(key: string): number {
  let n = 0
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0
  return n % MARKS.length
}

/**
 * Topics that come up often enough to be worth pinning by hand.
 *
 * The hash would give these something, and something is not the same as the
 * right thing: mornings is the card Ananya opens most, and it having the mint
 * diamond is a decision rather than an accident of arithmetic.
 */
const PINNED: Record<string, number> = {
  Mornings: 0,
  Health: 1,
  Support: 2,
  Education: 3,
  Work: 4,
  Personal: 5,
}

export function markFor(topic: string | EventCategory | undefined): Mark {
  const key = String(topic ?? 'Personal')
  const index = key in PINNED ? PINNED[key] : bucket(key)
  return MARKS[index]
}

/**
 * The mark, drawn.
 *
 * SVG rather than a font glyph or an image: it is six paths, it scales to any
 * size without a second asset, and it is the one way to be certain nothing here
 * is an emoji that renders as a different picture on somebody else's phone.
 *
 * `aria-hidden` without exception. The mark carries nothing that is not in the
 * text beside it, so announcing "diamond" to a screen reader would add a word
 * about the decoration and none about the record.
 */
export function ShapeMark({ topic, size = 64 }: { topic?: string; size?: number }) {
  const mark = markFor(topic)
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill={mark.ink}
      className="shrink-0"
    >
      {mark.shape === 'circle' ? <circle cx="32" cy="32" r="26" /> : null}
      {mark.shape === 'diamond' ? <path d="M32 4 60 32 32 60 4 32Z" /> : null}
      {mark.shape === 'arch' ? <path d="M6 58V30a26 26 0 0 1 52 0v28Z" /> : null}
      {mark.shape === 'cross' ? <path d="M24 4h16v20h20v16H40v20H24V40H4V24h20Z" /> : null}
      {mark.shape === 'octagon' ? (
        <path d="M21 4h22l17 17v22L43 60H21L4 43V21Z" />
      ) : null}
      {mark.shape === 'chevron' ? <path d="M8 8h20l28 24-28 24H8l28-24Z" /> : null}
    </svg>
  )
}

/**
 * The colour field the mark sits in, as the head of a card.
 *
 * 140px, mark centred left, and it replaces the colour band on Ananya's
 * editorial cards rather than sitting above one. Two bands of colour at the top
 * of the same card would be two things claiming to be the card's face.
 */
export function ShapeHead({ topic }: { topic?: string }) {
  const mark = markFor(topic)
  return (
    <div
      aria-hidden
      className="flex h-[140px] items-center px-8"
      style={{ background: mark.field }}
    >
      <ShapeMark topic={topic} />
    </div>
  )
}
