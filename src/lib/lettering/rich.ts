/*
 * Per-word text style: writing one word (or group) inside a bubble in bold,
 * italic or another color. The translation text holds light markup:
 * *bold**   __italic__   [#e53935]colored[/]
 * The layout engine (layout.ts) works with plain text lines; style changes are embedded as
 * Unicode private use characters (U+E000 + style no). Each styled run
 * starts with its own marker and closes with U+E000, so any substring taken from a word
 * start begins in the default style, and measuring and drawing know the right state at line start.
 */

export interface RunStyle {
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface RichSegment { text: string, style: number }

const MARK_BASE = 0xe000
const MARK_MAX = 0xe0ff
const MARK_PATTERN = /[-]/g
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
// A global regex carries state (lastIndex): take a fresh copy on each use.
const TOKEN_SOURCE = /\*\*|__|\[#[0-9a-fA-F]{6}\]|\[\/\]/
const tokens = () => new RegExp(TOKEN_SOURCE.source, 'g')

export const isMark = (char: string) => {
  const code = char.charCodeAt(0)
  return char.length === 1 && code >= MARK_BASE && code <= MARK_MAX
}
const mark = (index: number) => String.fromCharCode(MARK_BASE + index)

/** Does the text contain style markup? */
export function hasRichMarkup(text: string) {
  return TOKEN_SOURCE.test(text)
}

interface Span { text: string, style: RunStyle }

/** Splits markup into styled runs; an unmatched marker is ignored, not treated as plain text. */
function parse(text: string): Span[] {
  const spans: Span[] = []
  const state: { bold: boolean, italic: boolean, colors: string[] } = { bold: false, italic: false, colors: [] }
  let cursor = 0
  const push = (chunk: string) => {
    if (!chunk) return
    const style: RunStyle = {}
    if (state.bold) style.bold = true
    if (state.italic) style.italic = true
    const color = state.colors[state.colors.length - 1]
    if (color) style.color = color.toLowerCase()
    spans.push({ text: chunk, style })
  }
  for (const match of text.matchAll(tokens())) {
    push(text.slice(cursor, match.index))
    cursor = (match.index ?? 0) + match[0].length
    const token = match[0]
    if (token === '**') state.bold = !state.bold
    else if (token === '__') state.italic = !state.italic
    else if (token === '[/]') state.colors.pop()
    else if (COLOR_PATTERN.test(token.slice(1, -1))) state.colors.push(token.slice(1, -1))
  }
  push(text.slice(cursor))
  return spans
}

/** Isaretlemesiz duz metin (inceleme, sozluk, arama, disa aktarim). */
export function stripRichMarkup(text: string) {
  return parse(text).map((span) => span.text).join('')
}

const styleKey = (style: RunStyle) => `${style.bold ? 'b' : ''}${style.italic ? 'i' : ''}${style.color ?? ''}`

/**
 * Encodes for layout. styles[0] is the default style. Each styled run is split at
 * spaces; each word piece opens with its own marker and closes with U+E000.
 */
export function encodeRich(text: string): { encoded: string, styles: RunStyle[] } {
  const styles: RunStyle[] = [{}]
  const index = new Map<string, number>([['', 0]])
  let encoded = ''
  for (const span of parse(text)) {
    const key = styleKey(span.style)
    if (!key) { encoded += span.text; continue }
    let id = index.get(key)
    if (id === undefined) {
      if (styles.length > MARK_MAX - MARK_BASE) { encoded += span.text; continue }
      id = styles.length
      styles.push(span.style)
      index.set(key, id)
    }
    const styleId = id
    encoded += span.text.split(/(\s+)/).map((part) => (!part || /^\s+$/.test(part) ? part : `${mark(styleId)}${part}${mark(0)}`)).join('')
  }
  return { encoded, styles }
}

/** Kodlu satiri stil parcalarina ayirir (satir basi varsayilan stil). */
export function segmentsOf(line: string): RichSegment[] {
  const segments: RichSegment[] = []
  let style = 0
  let buffer = ''
  for (const char of line) {
    if (isMark(char)) {
      if (buffer) segments.push({ text: buffer, style })
      buffer = ''
      style = char.charCodeAt(0) - MARK_BASE
      continue
    }
    buffer += char
  }
  if (buffer) segments.push({ text: buffer, style })
  return segments
}

/** Isaretleri atar (kodlu dize -> gorunen metin). */
export function stripMarks(text: string) {
  return text.replace(MARK_PATTERN, '')
}

/** The second part of a hyphenated word starts with the style at the end of the first part. */
export function carryMark(head: string) {
  let last = ''
  for (const char of head) if (isMark(char)) last = char
  return last && last !== mark(0) ? last : ''
}

/**
 * Hece noktalari duz kelimede hesaplanir, kodlu kelimedeki konuma cevrilir (nokta,
 * p. gorunen harften hemen sonrasi).
 */
export function mapBreakPoints(encodedWord: string, points: (plain: string) => number[]) {
  const offsets: number[] = []
  let plain = ''
  for (let position = 0; position < encodedWord.length; position += 1) {
    const char = encodedWord[position]
    if (isMark(char)) continue
    plain += char
    offsets.push(position + 1)
  }
  return points(plain).map((point) => offsets[point - 1]).filter((point): point is number => point !== undefined)
}

/** Secili metni isaretlemeyle sarar (editor dugmeleri). Ayni isaretle sarili ise kaldirir. */
export function toggleWrap(text: string, start: number, end: number, open: string, close: string) {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)
  if (before.endsWith(open) && after.startsWith(close)) {
    const next = before.slice(0, -open.length) + selected + after.slice(close.length)
    return { text: next, start: start - open.length, end: end - open.length }
  }
  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length)
    return { text: before + inner + after, start, end: start + inner.length }
  }
  return { text: before + open + selected + close + after, start: start + open.length, end: end + open.length }
}
