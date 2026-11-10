import type { LayoutResult } from './layout'
import type { ResolvedStyle } from '@/lib/translationLettering'
import { BOLD_STROKE_EM, fontCss } from '@/lib/translationLettering'
import { segmentsOf, type RunStyle } from './rich'

/*
 * Text drawing (the editor, reader and published image share this function):
 * - shadow / glow: offset shadow, glow around the text when the offset is 0
 * - outline: color, with thickness as a percentage of text size
 * - fill: one color or a two-color top-to-bottom gradient
 * - arc: lines are laid out letter by letter on concentric arcs
 * - per-word style (rich.ts): the run's own font (italic), color and bold outline
 * Drawing happens around (0,0) = area center, without rotation; rotation belongs to the caller.
 * All measures scale with text size, so the look stays the same at any scale.
 */

type Ctx = CanvasRenderingContext2D

export interface LetteringEffects {
  strokeColor: string
  /** Kontur kalinligi, yazi boyutunun yuzdesi. */
  strokePx: number
  shadowBlurPx: number
  shadowXPx: number
  shadowYPx: number
}

export function effectsOf(style: ResolvedStyle, size: number): LetteringEffects {
  return {
    strokeColor: style.strokeColor,
    strokePx: style.stroke ? Math.max(1, (size * style.strokeWidth) / 100) : 0,
    shadowBlurPx: style.shadow ? (size * style.shadowBlur) / 100 : 0,
    shadowXPx: style.shadow ? (size * style.shadowX) / 100 : 0,
    shadowYPx: style.shadow ? (size * style.shadowY) / 100 : 0,
  }
}

/** The largest distance effects can extend outside the area (margin for the DOM canvas). */
export function paintBleed(style: ResolvedStyle, layout: LayoutResult) {
  const fx = effectsOf(style, layout.size)
  const shadow = style.shadow ? fx.shadowBlurPx * 2 + Math.max(Math.abs(fx.shadowXPx), Math.abs(fx.shadowYPx)) : 0
  const widest = layout.lines.reduce((max, line) => Math.max(max, line.maxWidth), 0)
  const bend = style.bend ? widest * 0.6 + layout.lines.length * layout.lineHeightPx : 0
  return Math.ceil(fx.strokePx * 2 + shadow + bend + layout.size * 0.5)
}

interface Glyph { text: string, x: number, y: number, angle: number, lineY: number, run?: RunStyle }

function glyphsOf(context: Ctx, style: ResolvedStyle, layout: LayoutResult): Glyph[][] {
  const spacing = style.letterSpacing * layout.size
  const blockHeight = layout.lines.length * layout.lineHeightPx
  const widest = layout.lines.reduce((max, line) => Math.max(max, line.width), 1)
  // Kavis: en genis satir |bend|% * 180 derecelik yay kaplar.
  const span = (Math.abs(style.bend) / 100) * Math.PI
  // Kisa kelimede (GUM!) yaricap harf boyuna yaklasip harfler ust uste binmesin.
  const radius = span > 0.001 ? Math.max(widest / span, layout.size * 2.5) : 0
  const up = style.bend > 0
  // Shifted by the arc's sag, so an arced block also stays centered in the area.
  const sag = radius ? radius * (1 - Math.cos(widest / 2 / radius)) : 0
  const shift = up ? -sag / 2 : sag / 2
  return layout.lines.map((line, index) => {
    const lineX = style.align === 'left' ? -line.maxWidth / 2 : style.align === 'right' ? line.maxWidth / 2 - line.width : -line.width / 2
    const lineY = -blockHeight / 2 + layout.lineHeightPx * index + layout.lineHeightPx / 2
    if (!layout.runStyles && !radius && !spacing) return [{ text: line.text, x: lineX, y: lineY, angle: 0, lineY }]
    const glyphs: Glyph[] = []
    let cursor = lineX
    const segments = layout.runStyles ? segmentsOf(line.text) : [{ text: line.text, style: 0 }]
    for (const segment of segments) {
      const run = layout.runStyles?.[segment.style]
      context.font = fontCss(style, layout.size, run)
      const boldPad = run?.bold ? layout.size * BOLD_STROKE_EM : 0
      if (!radius && !spacing) {
        glyphs.push({ text: segment.text, x: cursor + boldPad / 2, y: lineY, angle: 0, lineY, run })
        cursor += context.measureText(segment.text).width + boldPad
        continue
      }
      for (const char of segment.text) {
        const advance = context.measureText(char).width
        if (!radius) {
          glyphs.push({ text: char, x: cursor, y: lineY, angle: 0, lineY, run })
        } else {
        // Harf merkezinin yay uzerindeki yeri; satirlar ortak merkezli yaylar.
        const middle = cursor + advance / 2
        const centerY = (up ? radius : -radius) + shift
        const r = up ? centerY - (lineY + shift) : (lineY + shift) - centerY
        const theta = middle / Math.max(1, r)
        const px = r * Math.sin(theta)
        const py = up ? centerY - r * Math.cos(theta) : centerY + r * Math.cos(theta)
        const angle = up ? theta : -theta
        glyphs.push({ text: char, x: px - (advance / 2) * Math.cos(angle), y: py - (advance / 2) * Math.sin(angle), angle, lineY, run })
        }
        cursor += advance + spacing
      }
      cursor += boldPad
    }
    context.font = fontCss(style, layout.size)
    return glyphs
  })
}

function eachGlyph(
  context: Ctx, lines: Glyph[][], draw: (glyph: Glyph) => void,
  localFill?: (lineY: number) => CanvasGradient, font?: (run: RunStyle | undefined) => string,
) {
  for (const line of lines) {
    for (const glyph of line) {
      if (font) {
        const css = font(glyph.run)
        if (context.font !== css) context.font = css
      }
      if (!glyph.angle) { draw(glyph); continue }
      context.save()
      context.translate(glyph.x, glyph.y)
      context.rotate(glyph.angle)
      // The gradient is evaluated in the letter's own (rotated) frame: it shifts by the line's position in
      // the block, so it flows top to bottom on arced text too.
      if (localFill) context.fillStyle = localFill(glyph.lineY)
      draw({ ...glyph, x: 0, y: 0 })
      context.restore()
    }
  }
}

/** Yerlesmis satirlari (0,0) merkezli cizer. */
export function paintLettering(context: Ctx, style: ResolvedStyle, layout: LayoutResult, lang = 'tr') {
  context.save()
  context.font = fontCss(style, layout.size)
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  context.direction = lang === 'ar' ? 'rtl' : 'ltr'
  context.lineJoin = 'round'
  context.miterLimit = 2
  const fx = effectsOf(style, layout.size)
  const lines = glyphsOf(context, style, layout)
  const blockHeight = layout.lines.length * layout.lineHeightPx
  const color2 = style.color2
  const gradientAt = (offsetY: number) => {
    const gradient = context.createLinearGradient(0, -blockHeight / 2 - offsetY, 0, blockHeight / 2 - offsetY)
    gradient.addColorStop(0, style.color)
    gradient.addColorStop(1, color2 ?? style.color)
    return gradient
  }
  const fill: string | CanvasGradient = color2 ? gradientAt(0) : style.color
  // Per-word style: run font and color; a thin outline in the text color for bold runs.
  const font = layout.runStyles ? (run: RunStyle | undefined) => fontCss(style, layout.size, run) : undefined
  const boldPx = layout.size * BOLD_STROKE_EM
  // Shadow applies only to the outermost layer (outline if any, otherwise fill).
  // Canvas shadow offset is unaffected by transforms; a caller applying scale multiplies it.
  const matrix = context.getTransform()
  const scale = Math.hypot(matrix.a, matrix.b) || 1
  if (style.shadow) {
    context.shadowColor = style.shadowColor
    context.shadowBlur = fx.shadowBlurPx * scale
    context.shadowOffsetX = fx.shadowXPx * scale
    context.shadowOffsetY = fx.shadowYPx * scale
  }
  // Glow (offset 0) is faint on one layer; the outer layer is drawn twice to deepen it.
  const outerPasses = style.shadow && !fx.shadowXPx && !fx.shadowYPx ? 2 : 1
  if (fx.strokePx) {
    context.strokeStyle = fx.strokeColor
    for (let pass = 0; pass < outerPasses; pass += 1) {
      eachGlyph(context, lines, (glyph) => {
        context.lineWidth = fx.strokePx * 2 + (glyph.run?.bold ? boldPx : 0)
        context.strokeText(glyph.text, glyph.x, glyph.y)
      }, undefined, font)
    }
    context.shadowColor = 'transparent'
  }
  const localFill = color2 ? gradientAt : undefined
  const fillPasses = fx.strokePx ? 1 : outerPasses
  const paintFill = (glyph: Glyph) => {
    if (glyph.run?.color) context.fillStyle = glyph.run.color
    context.fillText(glyph.text, glyph.x, glyph.y)
    if (glyph.run?.bold) {
      context.save()
      context.shadowColor = 'transparent'
      context.strokeStyle = glyph.run.color ?? (typeof context.fillStyle === 'string' ? context.fillStyle : style.color)
      context.lineWidth = boldPx
      context.strokeText(glyph.text, glyph.x, glyph.y)
      context.restore()
    }
    if (glyph.run?.color) context.fillStyle = fill
  }
  for (let pass = 0; pass < fillPasses; pass += 1) {
    context.fillStyle = fill
    eachGlyph(context, lines, paintFill, localFill, font)
  }
  context.restore()
}
