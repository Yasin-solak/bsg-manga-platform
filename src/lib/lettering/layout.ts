/*
 * Text layout inside bubbles (the editor, publish render and reader share this engine).
 * Order:
 * 1. From the preferred size down (to the smallest size), try fitting without splitting
 * words; in an elliptical bubble each line's width is the ellipse's chord at that
 * height (top/bottom lines narrow, middle lines wide).
 * 2. Otherwise, in the same size order, hyphenate only words that do not fit a line alone,
 * by the language's syllable rules (see hyphenation.ts).
 * 3. Otherwise return at the smallest size with an overflow flag (the editor warns).
 * Lines are balanced by narrowing widths at the found line count; single-word
 * orphan last lines and the staircase look are reduced.
 */

import type { RunStyle } from './rich'

export type LayoutShape = 'elips' | 'kutu' | 'yok'

export interface LayoutRequest {
  text: string
  width: number
  height: number
  shape: LayoutShape
  /** Tercih edilen yazi boyutu (px). */
  size: number
  /** Kullanici boyutu elle secti: kucultme yapilmaz. */
  fixed?: boolean
  minSize?: number
  /** Satir yuksekligi carpani. */
  lineHeight: number
  measure: (text: string, size: number) => number
  /** Valid break points for a word; if not given, the word is not split. */
  breakPoints?: (word: string) => number[]
  /** Tireyle bolunen kelimenin ikinci parcasina eklenecek on ek (kelime ici stil, rich.ts). */
  carry?: (head: string) => string
}

export interface LayoutLine {
  text: string
  width: number
  /** Maximum width a line can use (for alignment). */
  maxWidth: number
}

export interface LayoutResult {
  /** Per-word styles (rich.ts); referenced by markers in line text. Otherwise one style. */
  runStyles?: RunStyle[]
  size: number
  lineHeightPx: number
  lines: LayoutLine[]
  overflow: boolean
  hyphenated: boolean
}

type Frame = { ellipse: boolean, halfW: number, halfH: number, rectW: number, rectH: number }

const ELLIPSE_INSET = 0.9
const SIZE_STEP = 0.94
const HYPHEN = '-'

function frameOf(shape: LayoutShape, width: number, height: number): Frame {
  if (shape === 'elips') {
    return { ellipse: true, halfW: (width / 2) * ELLIPSE_INSET, halfH: (height / 2) * ELLIPSE_INSET, rectW: 0, rectH: 0 }
  }
  const pad = Math.max(3, Math.min(width, height) * 0.06)
  return { ellipse: false, halfW: 0, halfH: 0, rectW: Math.max(1, width - pad * 2), rectH: Math.max(1, height - pad * 2) }
}

function availableHeight(frame: Frame) {
  return frame.ellipse ? frame.halfH * 2 : frame.rectH
}

/** n satirlik blok dikeyde ortalandiginda her satirin kullanabilecegi genislik. */
export function lineWidths(frame: Frame, count: number, lineHeightPx: number): number[] | null {
  const block = count * lineHeightPx
  if (block > availableHeight(frame) + 0.5) return null
  const widths: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (!frame.ellipse) { widths.push(frame.rectW); continue }
    const top = -block / 2 + index * lineHeightPx
    const edge = Math.max(Math.abs(top), Math.abs(top + lineHeightPx))
    const ratio = Math.min(1, edge / frame.halfH)
    widths.push(2 * frame.halfW * Math.sqrt(Math.max(0, 1 - ratio * ratio)))
  }
  return widths
}

type Token = { word: string } | { newline: true }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  text.trim().split('\n').forEach((paragraph, index) => {
    if (index > 0) tokens.push({ newline: true })
    for (const word of paragraph.split(/\s+/).filter(Boolean)) tokens.push({ word })
  })
  return tokens
}

/**
 * Fills word by word with the given line widths. A word that does not fit the current line
 * moves to the next; splitting happens only if the word does not fit an empty line either
 * and it is allowed.
 */
function wrap(
  tokens: Token[], widths: number[], fits: (text: string, width: number) => boolean,
  allowHyphen: boolean, breakPoints: ((word: string) => number[]) | undefined,
  carry?: (head: string) => string,
): { lines: string[], hyphens: number } | null {
  const lines: string[] = []
  let current = ''
  let hyphens = 0
  const widthAt = (index: number) => widths[index]
  const flush = () => { lines.push(current); current = '' }
  for (const token of tokens) {
    if ('newline' in token) {
      flush()
      if (lines.length >= widths.length) return null
      continue
    }
    let word = token.word
    let points: number[] | null = null
    for (let guard = 0; guard < 64; guard += 1) {
      if (lines.length >= widths.length) return null
      const width = widthAt(lines.length)
      const candidate = current ? `${current} ${word}` : word
      if (fits(candidate, width)) { current = candidate; break }
      if (current) { flush(); continue }
      if (!allowHyphen || !breakPoints) return null
      points ??= breakPoints(word)
      const piece = word
      const usable: number[] = points.filter((point) => fits(piece.slice(0, point) + HYPHEN, width))
      if (!usable.length) return null
      const cut: number = usable[usable.length - 1]
      current = word.slice(0, cut) + HYPHEN
      hyphens += 1
      flush()
      const prefix = carry?.(word.slice(0, cut)) ?? ''
      points = points.filter((point) => point > cut).map((point) => point - cut + prefix.length)
      word = prefix + word.slice(cut)
    }
  }
  if (current || !lines.length) flush()
  return lines.length <= widths.length ? { lines, hyphens } : null
}

function sizesFor(request: LayoutRequest): number[] {
  if (request.fixed) return [request.size]
  const minSize = Math.min(request.size, Math.max(1, request.minSize ?? request.size * 0.5))
  const sizes: number[] = []
  for (let size = request.size; size > minSize; size *= SIZE_STEP) sizes.push(Math.round(size * 2) / 2)
  sizes.push(Math.round(minSize * 2) / 2)
  return [...new Set(sizes)]
}

function attempt(request: LayoutRequest, frame: Frame, tokens: Token[], size: number, allowHyphen: boolean) {
  const lineHeightPx = size * request.lineHeight
  const fits = (text: string, width: number) => request.measure(text, size) <= width
  const maxLines = Math.max(1, Math.floor(availableHeight(frame) / lineHeightPx))
  for (let count = 1; count <= maxLines; count += 1) {
    const widths = lineWidths(frame, count, lineHeightPx)
    if (!widths) break
    const result = wrap(tokens, widths, fits, allowHyphen, request.breakPoints, request.carry)
    if (!result) continue
    // Daha az satira dustuyse geometri degisir; gercek satir sayisiyla dogrula.
    const actualWidths = lineWidths(frame, result.lines.length, lineHeightPx)
    if (!actualWidths) continue
    const verified = wrap(tokens, actualWidths, fits, allowHyphen, request.breakPoints, request.carry)
    if (!verified || verified.lines.length !== result.lines.length) continue
    return balance(request, tokens, size, actualWidths, verified, allowHyphen, fits)
  }
  return null
}

/** Narrows widths while keeping line and hyphen counts: balanced lines. */
function balance(
  request: LayoutRequest, tokens: Token[], size: number, widths: number[],
  base: { lines: string[], hyphens: number }, allowHyphen: boolean, fits: (text: string, width: number) => boolean,
): LayoutResult {
  let best = base
  let low = 0.5
  let high = 1
  for (let step = 0; step < 8; step += 1) {
    const mid = (low + high) / 2
    const scaled = widths.map((width) => width * mid)
    const result = wrap(tokens, scaled, fits, allowHyphen, request.breakPoints, request.carry)
    if (result && result.lines.length === base.lines.length && result.hyphens <= base.hyphens) {
      best = result
      high = mid
    } else {
      low = mid
    }
  }
  return {
    size,
    lineHeightPx: size * request.lineHeight,
    lines: best.lines.map((text, index) => ({ text, width: request.measure(text, size), maxWidth: widths[index] })),
    overflow: false,
    hyphenated: best.hyphens > 0,
  }
}

export function layoutText(request: LayoutRequest): LayoutResult {
  const tokens = tokenize(request.text)
  const frame = frameOf(request.shape, request.width, request.height)
  const sizes = sizesFor(request)
  for (const allowHyphen of [false, true]) {
    if (allowHyphen && !request.breakPoints) break
    for (const size of sizes) {
      const result = attempt(request, frame, tokens, size, allowHyphen)
      if (result) return result
    }
  }
  // Sigmiyor: en kucuk boyutta, satir sinirsiz, bolme serbest; tasma isaretlenir.
  const size = sizes[sizes.length - 1]
  const lineHeightPx = size * request.lineHeight
  const width = frame.ellipse ? frame.halfW * 2 : frame.rectW
  const fits = (text: string, max: number) => request.measure(text, size) <= max
  const unbounded = Array.from({ length: 200 }, () => width)
  const result = wrap(tokens, unbounded, fits, Boolean(request.breakPoints), request.breakPoints, request.carry)
    ?? { lines: tokens.flatMap((token) => ('word' in token ? [token.word] : [])), hyphens: 0 }
  return {
    size,
    lineHeightPx,
    lines: result.lines.map((text) => ({ text, width: request.measure(text, size), maxWidth: width })),
    overflow: true,
    hyphenated: result.hyphens > 0,
  }
}
