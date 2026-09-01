/**
 * A PDF written by hand, because the alternative was worse.
 *
 * ORCA's real documents come back from the fifteen-step workflow as files it
 * produced and posted to `output-artifact`. This file exists for the one case
 * where that is not available and a file still has to exist: the fixed
 * demonstration answers in `canned.ts`, which must produce something a person
 * can actually open, print and hand to somebody.
 *
 * WHY NOT A LIBRARY. Edge functions run on Deno with a cold start on every
 * invocation, and every PDF library worth using pulls a font subsetter and a
 * few hundred kilobytes of dependency behind it. What is needed here is one
 * page of black text on white in a standard font — the narrowest possible
 * corner of the format, and the one corner every reader has supported since
 * 1993. The whole generator is under two hundred lines and has no dependency
 * to go stale.
 *
 * WHAT IT DELIBERATELY CANNOT DO. No images, no embedded fonts, no colour, no
 * tables, no links. Those are the features that make PDF generation hard, and
 * every one of them is absent from what this needs to produce. If a real
 * document ever needs them it should come from the workflow that owns real
 * documents, not from here.
 */

/** A4 at 72dpi, which is the unit PDF measures in. */
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 62
const TEXT_W = PAGE_W - MARGIN * 2
const TOP = PAGE_H - 78
const BOTTOM = 76

export type Block =
  | { style: 'title'; text: string }
  | { style: 'heading'; text: string }
  | { style: 'body'; text: string }
  | { style: 'bullet'; text: string }
  | { style: 'meta'; text: string }
  | { style: 'rule' }

interface Style {
  font: 'F1' | 'F2'
  size: number
  /** Distance to the next line within a wrapped paragraph. */
  leading: number
  /** Extra space above the block. */
  before: number
  /** Left inset, for the hanging indent a bullet needs. */
  indent: number
}

const STYLES: Record<string, Style> = {
  title: { font: 'F2', size: 17, leading: 21, before: 0, indent: 0 },
  heading: { font: 'F2', size: 11, leading: 15, before: 18, indent: 0 },
  body: { font: 'F1', size: 10.5, leading: 15, before: 9, indent: 0 },
  bullet: { font: 'F1', size: 10.5, leading: 15, before: 5, indent: 14 },
  meta: { font: 'F1', size: 8.5, leading: 12, before: 9, indent: 0 },
}

/**
 * Non-ASCII turned into octal escapes rather than dropped.
 *
 * The file is assembled as a string and its byte offsets are recorded in the
 * cross-reference table; if any character encoded to more than one byte, every
 * offset after it would be wrong and the file would not open. Escaping keeps
 * the string one byte per character while still printing the right glyph,
 * given the WinAnsi encoding the fonts declare.
 */
const WINANSI: Record<string, string> = {
  '‘': '\\221', '’': '\\222', '“': '\\223', '”': '\\224',
  '•': '\\225', '–': '\\226', '—': '\\227', '…': '\\205',
  ' ': ' ', 'é': '\\351', '£': '\\243', '€': '\\200',
}

function escape(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch === '\\') out += '\\\\'
    else if (ch === '(') out += '\\('
    else if (ch === ')') out += '\\)'
    else if (ch in WINANSI) out += WINANSI[ch]
    else if (ch.charCodeAt(0) < 128) out += ch
    // Anything else has no glyph in this encoding. Dropping it is the only
    // option that keeps the offsets right, and it is visible in the output
    // rather than silently corrupting the file.
    else out += '?'
  }
  return out
}

/**
 * Line breaking by measured width.
 *
 * Helvetica's widths are known constants, but carrying the full 224-entry
 * table for two demonstration documents is not worth it. Averaging by
 * character class gets within a few percent on running prose, and the margin
 * is 62pt — wide enough that a few percent never reaches the edge.
 */
function widthOf(text: string, size: number): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 278
    else if ('ijltfrI.,;:!|\'`'.includes(ch)) units += 300
    else if ('mwMW@'.includes(ch)) units += 855
    else if (ch >= 'A' && ch <= 'Z') units += 690
    else units += 545
  }
  return (units / 1000) * size
}

function wrap(text: string, size: number, available: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let line = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`
    if (widthOf(candidate, size) <= available) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  lines.push(line)
  return lines
}

/** One page's worth of drawing operators. */
interface Painted {
  ops: string[]
}

export function simplePdf(blocks: Block[]): Uint8Array {
  const pages: Painted[] = []
  let current: Painted = { ops: [] }
  let y = TOP

  const newPage = () => {
    pages.push(current)
    current = { ops: [] }
    y = TOP
  }

  for (const block of blocks) {
    if (block.style === 'rule') {
      if (y - 18 < BOTTOM) newPage()
      y -= 12
      current.ops.push(
        `0.82 0.80 0.77 RG 0.7 w ${MARGIN} ${y.toFixed(2)} m ${PAGE_W - MARGIN} ${y.toFixed(2)} l S`,
      )
      y -= 6
      continue
    }

    const s = STYLES[block.style]
    const available = TEXT_W - s.indent
    const lines = wrap(block.text, s.size, available)
    y -= s.before

    lines.forEach((line, i) => {
      if (y - s.leading < BOTTOM) newPage()
      y -= s.leading
      // The bullet glyph sits in the indent, so it is drawn once and the text
      // of a wrapped bullet lines up under the first line rather than under
      // the marker.
      if (block.style === 'bullet' && i === 0) {
        current.ops.push(
          `BT /F1 ${s.size} Tf 0.08 0.08 0.08 rg 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (\\225) Tj ET`,
        )
      }
      const grey = block.style === 'meta' ? '0.42 0.40 0.38' : '0.08 0.08 0.08'
      current.ops.push(
        `BT /${s.font} ${s.size} Tf ${grey} rg ` +
          `1 0 0 1 ${(MARGIN + s.indent).toFixed(2)} ${y.toFixed(2)} Tm (${escape(line)}) Tj ET`,
      )
    })
  }
  pages.push(current)

  /* ------------------------------------------------------- assembly */

  // Object numbering is fixed so the page tree can name its children before
  // their objects exist: 1 catalog, 2 pages, 3 and 4 the two fonts, then a
  // page object and a content stream for each page in turn.
  const first = 5
  const pageObj = (i: number) => first + i * 2
  const contentObj = (i: number) => first + i * 2 + 1

  const objects: string[] = []
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`)
  objects.push(
    `<< /Type /Pages /Count ${pages.length} ` +
      `/Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`,
  )
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
  objects.push(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  )

  pages.forEach((page, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj(i)} 0 R >>`,
    )
    const stream = page.ops.join('\n')
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  // Latin-1 rather than UTF-8: every character is now below 128, so the two
  // agree, and going through TextEncoder would silently widen any that was not.
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}
