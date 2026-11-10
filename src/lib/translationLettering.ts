import type { TlItemType } from '@/services/translationStudioService'
import type { TlFontSuggestion, TlStyle } from '@/services/translationEditorService'
import { customFontFamily, customFontName, isCustomFontKey } from '@/lib/customFonts'
import { hyphenationPoints, supportsHyphenation } from '@/lib/lettering/hyphenation'
import { layoutText, type LayoutResult } from '@/lib/lettering/layout'
import {
  carryMark, encodeRich, hasRichMarkup, mapBreakPoints, segmentsOf, stripMarks, type RunStyle,
} from '@/lib/lettering/rich'
import { txa } from '@/i18n/activeLocale'

/*
 * Translation lettering rules: the editor, publish render and reader use the same
 * rules, so the layout seen in the editor stays the same for readers.
 */

export const FONTS = {
  diyalog: { name: 'Comic Neue', family: "'Comic Neue', cursive", weight: 700, get desc() { return txa('Diyalog') } },
  yumusak: { name: 'Shantell Sans', family: "'Shantell Sans', cursive", weight: 600, get desc() { return txa('Anlatım') } },
  el: { name: 'Patrick Hand', family: "'Patrick Hand', cursive", weight: 400, get desc() { return txa('Fısıltı · el yazısı') } },
  sfx: { name: 'Bangers', family: 'Bangers, cursive', weight: 400, get desc() { return txa('SFX · darbe') } },
  bagir: { name: 'Permanent Marker', family: "'Permanent Marker', cursive", weight: 400, get desc() { return txa('Bağırma') } },
  tabela: { name: 'Anton', family: 'Anton, sans-serif', weight: 400, get desc() { return txa('Tabela') } },
} as const

export type FontKey = keyof typeof FONTS

export interface LetteringFont { name: string, family: string, weight: number, desc: string }

/** One of the 6 built-in fonts or a custom font uploaded by the fansub (custom:<id>). */
export function fontOf(key: string | undefined): LetteringFont {
  if (key && isCustomFontKey(key)) return { name: customFontName(key), family: customFontFamily(key), weight: 400, desc: txa('Ekibin fontu') }
  return FONTS[(key as FontKey)] ?? FONTS.diyalog
}

export const DEFAULT_FONT_BY_TYPE: Record<TlItemType, FontKey> = {
  balon: 'diyalog', anlatim: 'yumusak', sfx: 'sfx', tabela: 'tabela',
}

const DEFAULT_SIZE_BY_TYPE: Record<TlItemType, number> = { balon: 15, anlatim: 15, sfx: 56, tabela: 14 }

export const BLACK = '#000000'
export const WHITE = '#ffffff'

export interface ResolvedStyle {
  font: FontKey
  size: number
  lineHeight: number
  letterSpacing: number
  align: 'left' | 'center' | 'right'
  color: string
  stroke: boolean
  strokeColor: string
  strokeWidth: number
  italic: boolean
  color2: string | null
  shadow: boolean
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
  bend: number
}

/** Kontur rengi secilmediyse yazi rengine zit (beyaza siyah, digerlerine beyaz). */
export function contrastOf(color: string) {
  return color.toLowerCase() === WHITE ? BLACK : WHITE
}

/** Without a saved style the font suggestion is used; otherwise the default for the type. */
export function resolveStyle(item: { type: TlItemType, style: TlStyle | null | undefined, fontSuggestion: TlFontSuggestion | null }, pageWidth: number): ResolvedStyle {
  const style: TlStyle = item.style ?? {}
  const suggestedFont = item.fontSuggestion?.font && item.fontSuggestion.font in FONTS ? item.fontSuggestion.font as FontKey : null
  const font = (style.font && (style.font in FONTS || isCustomFontKey(style.font))
    ? style.font : suggestedFont ?? DEFAULT_FONT_BY_TYPE[item.type]) as FontKey
  const color = style.color ?? BLACK
  const baseSize = item.fontSuggestion?.size
    ?? Math.round(DEFAULT_SIZE_BY_TYPE[item.type] * Math.max(1, pageWidth / 640))
  return {
    font,
    size: style.size ?? baseSize,
    lineHeight: style.lineHeight ?? 1.12,
    letterSpacing: style.letterSpacing ?? 0,
    align: style.align ?? 'center',
    color,
    stroke: style.stroke ?? item.type === 'sfx',
    strokeColor: style.strokeColor ?? contrastOf(color),
    strokeWidth: style.strokeWidth ?? 9,
    italic: style.italic ?? false,
    color2: style.color2 ?? null,
    shadow: style.shadow ?? false,
    shadowColor: style.shadowColor ?? BLACK,
    shadowBlur: style.shadowBlur ?? 20,
    shadowX: style.shadowX ?? 0,
    shadowY: style.shadowY ?? 0,
    bend: style.bend ?? 0,
  }
}


// ---------------------------------------------------------------------------
// Layout: the editor (DOM), publish render (canvas) and reader produce the same lines.
// ---------------------------------------------------------------------------

export interface LetteringBox {
  type: TlItemType
  shape: 'elips' | 'kutu' | 'yok'
  w: number
  h: number
  style: TlStyle | null | undefined
  fontSuggestion: TlFontSuggestion | null
}

export function fontCss(style: ResolvedStyle, size = style.size, run?: RunStyle) {
  const font = fontOf(style.font)
  return `${style.italic || run?.italic ? 'italic ' : ''}${font.weight} ${size}px ${font.family}`
}

/**
 * Per-word bold: most fonts have no separate bold cut (Comic Neue is already 700);
 * boldness is drawn as a thin outline in the text color. Measuring adds a margin per run.
 */
export const BOLD_STROKE_EM = 0.05

let measureContext: CanvasRenderingContext2D | null = null

/** Canvas measurement, including letter spacing (em). Publish render and DOM see the same value. */
export function createMeasure(style: ResolvedStyle, runStyles?: RunStyle[]) {
  const cache = new Map<string, number>()
  return (text: string, size: number) => {
    const key = `${size}|${text}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    measureContext ??= document.createElement('canvas').getContext('2d')
    const visible = runStyles ? stripMarks(text) : text
    if (!measureContext) return visible.length * size * 0.6
    let width = Math.max(0, [...visible].length - 1) * style.letterSpacing * size
    // Kelime bazli stil: her parca kendi fontuyla olculur (italik genisligi farklidir).
    for (const segment of runStyles ? segmentsOf(text) : [{ text, style: 0 }]) {
      const run = runStyles?.[segment.style]
      measureContext.font = fontCss(style, size, run)
      width += measureContext.measureText(segment.text).width + (run?.bold ? size * BOLD_STROKE_EM : 0)
    }
    cache.set(key, width)
    return width
  }
}

/**
 * A single column of vertical Japanese text (when no balloon is found) is too narrow for horizontal languages: at 71 px
 * width Turkish dropped to the smallest size and became unreadable. In a very narrow, tall area
 * the layout width opens to 45% of the height (not exceeding 30% of the page width);
 * lines are still centered on the area.
 */
export function layoutWidth(box: { w: number, h: number, shape?: string }, pageWidth: number) {
  // An ellipse is a real balloon (tall thin balloons exist too): text does not overflow it.
  if (box.shape === 'elips' || box.h <= box.w * 2.5) return box.w
  return Math.max(box.w, Math.min(box.h * 0.45, pageWidth * 0.3))
}

export function layoutLettering(box: LetteringBox, text: string, pageWidth: number, lang: string): { style: ResolvedStyle, layout: LayoutResult } {
  const style = resolveStyle(box, pageWidth)
  const rich = hasRichMarkup(text) ? encodeRich(text) : null
  const hyphenate = supportsHyphenation(lang) ? (word: string) => hyphenationPoints(word, lang) : undefined
  const layout = layoutText({
    text: rich ? rich.encoded : text,
    width: layoutWidth(box, pageWidth),
    height: box.h,
    shape: box.shape,
    size: style.size,
    // A size the user chose by hand is kept; otherwise it shrinks until it fits the balloon.
    fixed: box.style?.size !== undefined,
    minSize: Math.max(8, style.size * 0.5),
    lineHeight: style.lineHeight,
    measure: createMeasure(style, rich?.styles),
    breakPoints: hyphenate && rich ? (word) => mapBreakPoints(word, hyphenate) : hyphenate,
    carry: rich ? carryMark : undefined,
  })
  return { style, layout: rich ? { ...layout, runStyles: rich.styles } : layout }
}
