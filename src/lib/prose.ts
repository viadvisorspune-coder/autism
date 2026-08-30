/**
 * Turning the workflow's HTML into something that reads like a person wrote it.
 *
 * `Return Answer` produces HTML, because it is meant to be read on screen. A
 * chat bubble is not a document, though, and pasting `<h3>ANSWER</h3><ul>…`
 * into a conversation gives you either a wall of visible tags or a wall of
 * headings — neither of which is how anybody talks.
 *
 * So this converts rather than renders: it reads the HTML and produces a small
 * list of typed blocks the interface draws with its own components.
 *
 * WHY NOT JUST SET innerHTML. Because the HTML is written by a language model.
 * Putting model-authored markup straight into the page is an injection waiting
 * to happen, and no amount of "it is only our own workflow" survives the first
 * time a record contains something that looks like a tag. Nothing here ever
 * emits markup — it emits text, and React draws the structure. That makes the
 * conversion safe by construction rather than by vigilance.
 *
 * It is also deliberately tolerant. A workflow that returns plain text, or
 * markdown, or HTML with a stray unclosed tag, still produces something
 * readable. An answer that fails to display because its wrapper was malformed
 * is an answer the person did not get.
 */

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'quote'; text: string }

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…',
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[String(name).toLowerCase()] ?? m)
}

/** Inline tags carry emphasis a chat bubble does not need. Keep the words. */
const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '')

const tidy = (s: string): string => decode(stripTags(s)).replace(/\s+/g, ' ').trim()

/**
 * Field labels, removed.
 *
 * The tool description already asks the workflow not to emit raw labels, and
 * it mostly does not. When one slips through — a line that is just "ANSWER:"
 * or "Uncertainty —" — it is furniture from the envelope rather than something
 * anybody said, and leaving it in is what makes an answer read like a form.
 */
const LABEL_ONLY =
  /^(answer|response|summary|sources?|uncertainty|withheld|status|next steps?|what happens next|which steps ran)\s*[:\-–—]?\s*$/i

const LEADING_LABEL =
  /^(answer|response|summary)\s*[:\-–—]\s*/i

export function htmlToBlocks(input: string): Block[] {
  if (!input) return []

  // Anything executable or presentational goes before parsing, contents and
  // all — not stripped to its text, removed.
  let html = input
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // No tags at all: plain text or markdown. Split on blank lines and treat
  // dashed lines as a list, which is how people write one.
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return fromPlainText(decode(html))
  }

  // <br> is a line break inside a block, so make it survive the tag strip.
  html = html.replace(/<br\s*\/?>/gi, '\n')

  const blocks: Block[] = []
  // One pass over the block-level elements in the order they appear.
  const BLOCK = /<(h[1-6]|p|li|blockquote|tr|div)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  let pendingList: string[] = []

  const flushList = () => {
    if (pendingList.length) {
      blocks.push({ kind: 'list', items: pendingList })
      pendingList = []
    }
  }

  while ((m = BLOCK.exec(html)) !== null) {
    const tag = m[1].toLowerCase()
    // A table row reads as a sentence once its cells are joined; a chat bubble
    // has no columns to line up.
    const raw = tag === 'tr' ? m[2].replace(/<\/t[dh]>/gi, ' — ') : m[2]
    const text = tidy(raw).replace(/\s*—\s*$/, '')
    if (!text || LABEL_ONLY.test(text)) continue

    if (tag === 'li') {
      pendingList.push(text)
      continue
    }
    flushList()

    if (/^h[1-6]$/.test(tag)) blocks.push({ kind: 'heading', text })
    else if (tag === 'blockquote') blocks.push({ kind: 'quote', text })
    else blocks.push({ kind: 'para', text: text.replace(LEADING_LABEL, '') })
  }
  flushList()

  // Markup this parser did not recognise still had words in it. Falling back to
  // the stripped text is better than returning nothing and calling the answer
  // empty — but block tags have to become line breaks first, or an unclosed
  // <p> welds the last word of one sentence to the first of the next.
  if (!blocks.length) {
    const separated = html.replace(/<\/?(p|div|h[1-6]|li|ul|ol|tr|blockquote)\b[^>]*>/gi, '\n')
    return fromPlainText(decode(stripTags(separated)))
  }

  return blocks
}

function fromPlainText(text: string): Block[] {
  const out: Block[] = []
  let items: string[] = []
  for (const rawLine of text.split(/\n{2,}|\r?\n/)) {
    const line = rawLine.trim()
    if (!line || LABEL_ONLY.test(line)) {
      if (items.length) { out.push({ kind: 'list', items }); items = [] }
      continue
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    if (bullet) { items.push(bullet[1].trim()); continue }
    if (items.length) { out.push({ kind: 'list', items }); items = [] }

    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) { out.push({ kind: 'heading', text: heading[1].trim() }); continue }

    out.push({ kind: 'para', text: line.replace(LEADING_LABEL, '') })
  }
  if (items.length) out.push({ kind: 'list', items })
  return out
}

/**
 * The whole answer as one readable string, for anywhere that cannot draw
 * blocks — a copy button, a title attribute, a log line.
 */
export const blocksToText = (blocks: Block[]): string =>
  blocks
    .map((b) => (b.kind === 'list' ? b.items.map((i) => `• ${i}`).join('\n') : b.text))
    .join('\n\n')

export const htmlToText = (html: string): string => blocksToText(htmlToBlocks(html))
