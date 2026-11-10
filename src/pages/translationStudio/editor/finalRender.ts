import '@/components/translation/letteringFonts.css'
import type { TlItem, TlStroke } from '@/services/translationEditorService'
import { ensureCustomFont, isCustomFontKey } from '@/lib/customFonts'
import { ensureHyphenation } from '@/lib/lettering/hyphenation'
import { paintLettering } from '@/lib/lettering/paint'
import { fontCss, layoutLettering } from '@/lib/translationLettering'
import { renderCleanPage } from './cleanRender'
import { resolveStyle } from './editorModel'
import { txa } from '@/i18n/activeLocale'

/*
 * Published image: clean base + translated text written on one canvas. Lines come from the same engine as the
 * editor's DOM layer and reader (layoutLettering):
 * - shrinking until it fits the balloon, chord width per line in an ellipse
 * - word splitting as a last resort: only by the language's syllable rules with a hyphen
 * - vertical centering, rotating around the area center
 * - effects (outline, shadow/glow, gradient, arc): paintLettering; the editor and
 * reader use the same drawing
 */

type Ctx = CanvasRenderingContext2D

export function drawItemText(context: Ctx, item: TlItem, pageWidth: number, lang = 'tr') {
  const text = item.text.trim()
  if (!text) return
  const { style, layout } = layoutLettering(item, text, pageWidth, lang)
  context.save()
  context.translate(item.x + item.w / 2, item.y + item.h / 2)
  context.rotate((item.rotation * Math.PI) / 180)
  paintLettering(context, style, layout, lang)
  context.restore()
}

/**
 * Fonts used and the language's hyphenation patterns must be loaded before writing to the canvas;
 * otherwise it draws with a fallback font and measuring (line breaking) drifts.
 */
export async function ensureFonts(items: TlItem[], pageWidth: number, lang = 'tr') {
  const custom = new Set(items.filter((item) => item.text.trim()).map((item) => resolveStyle(item, pageWidth).font).filter((key) => isCustomFontKey(key)))
  await Promise.all([...custom].map((key) => ensureCustomFont(key)))
  const specs = new Set(items.filter((item) => item.text.trim()).map((item) => fontCss(resolveStyle(item, pageWidth))))
  await Promise.all([...specs].map((spec) => document.fonts.load(spec).catch(() => [])))
  await ensureHyphenation(lang)
}

/** Produces the clean base and published image together with one cleaning. */
export async function renderPagePair(input: {
  source: CanvasImageSource
  width: number
  height: number
  items: TlItem[]
  strokes: TlStroke[]
  signal?: AbortSignal
}): Promise<{ clean: HTMLCanvasElement, final: HTMLCanvasElement }> {
  const clean = await renderCleanPage(input)
  await ensureFonts(input.items, input.width)
  const final = document.createElement('canvas')
  final.width = input.width
  final.height = input.height
  const context = final.getContext('2d')
  if (!context) throw new Error(txa('Yayın tuvali açılamadı.'))
  context.drawImage(clean, 0, 0)
  for (const item of input.items) drawItemText(context, item, input.width)
  return { clean, final }
}

export async function renderFinalPage(input: {
  source: CanvasImageSource
  width: number
  height: number
  items: TlItem[]
  strokes: TlStroke[]
  signal?: AbortSignal
}): Promise<HTMLCanvasElement> {
  const canvas = await renderCleanPage(input)
  await ensureFonts(input.items, input.width)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(txa('Yayın tuvali açılamadı.'))
  for (const item of input.items) drawItemText(context, item, input.width)
  return canvas
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string, quality = 0.92): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error(txa('Sayfa görseli oluşturulamadı.'))); return }
      resolve(new File([blob], name, { type: 'image/webp' }))
    }, 'image/webp', quality)
  })
}
