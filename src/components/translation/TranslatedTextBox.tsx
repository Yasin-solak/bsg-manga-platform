import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ensureCustomFont, isCustomFontKey } from '@/lib/customFonts'
import { ensureHyphenation } from '@/lib/lettering/hyphenation'
import type { TlItemType } from '@/services/translationStudioService'
import type { TlFontSuggestion, TlShape, TlStyle } from '@/services/translationEditorService'
import { paintBleed, paintLettering } from '@/lib/lettering/paint'
import { fontCss, layoutLettering, resolveStyle } from '@/lib/translationLettering'
import './letteringFonts.css'

export interface TranslatedBox {
  type: TlItemType
  shape: TlShape
  x: number
  y: number
  w: number
  h: number
  rotation: number
  style: TlStyle | null
  fontSuggestion: TlFontSuggestion | null
}

// A single box's canvas does not exceed this many pixels (so memory does not blow up at high zoom).
const MAX_CANVAS_PIXELS = 6_000_000

/**
 * Text of one area on the clean page. Coordinates are the page's natural pixels;
 * the parent scales with `scale()`. Lines come from the same engine as the publish render (finalRender)
 * (layoutLettering) and are drawn with the same function (paintLettering),
 * so outline, shadow, gradient and arc are identical in the editor, reader and published page.
 * `resolution`: how many device pixels one natural pixel covers on screen (zoom x dpr).
 */
export function TranslatedTextBox({ box, text, pageWidth, lang = 'tr', resolution }: { box: TranslatedBox, text: string, pageWidth: number, lang?: string, resolution?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const style = resolveStyle(box, pageWidth)
  const [ready, setReady] = useState(0)
  // A team-specific font (custom:<id>) downloads on first use; a fallback font shows meanwhile.
  useEffect(() => { if (isCustomFontKey(style.font)) void ensureCustomFont(style.font).then(() => setReady((value) => value + 1)) }, [style.font])
  // Measuring must use the right font and the language's hyphenation patterns; relaid out once loaded.
  const spec = fontCss(style)
  useEffect(() => {
    let alive = true
    // Yuklenemeyen font yedek fontla cizilir; sonuc ne olursa olsun olcum yenilenir.
    void Promise.allSettled([document.fonts.load(spec), ensureHyphenation(lang)]).then(() => { if (alive) setReady((value) => value + 1) })
    return () => { alive = false }
  }, [spec, lang])
  const trimmed = text.trim()
  const result = useMemo(
    () => (trimmed ? layoutLettering(box, trimmed, pageWidth, lang) : null),
    // ready: refresh the measurement once font/hyphenation load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box.type, box.shape, box.w, box.h, box.style, box.fontSuggestion, trimmed, pageWidth, lang, ready],
  )
  const bleed = result ? paintBleed(result.style, result.layout) : 0
  const outerW = box.w + bleed * 2
  const outerH = box.h + bleed * 2
  const wanted = Math.max(1, (resolution ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio)) || 1)
  const density = Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, outerW * outerH)))
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !result) return
    canvas.width = Math.max(1, Math.round(outerW * density))
    canvas.height = Math.max(1, Math.round(outerH * density))
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(density, 0, 0, density, 0, 0)
    context.clearRect(0, 0, outerW, outerH)
    context.translate(outerW / 2, outerH / 2)
    paintLettering(context, result.style, result.layout, lang)
  }, [result, outerW, outerH, density, lang])
  if (!result) return null
  const { layout } = result
  return (
    <div className='pointer-events-none absolute' style={{ left: box.x, top: box.y, width: box.w, height: box.h }} data-overflow={layout.overflow || undefined}>
      <canvas
        ref={canvasRef}
        role='img'
        aria-label={layout.lines.map((line) => line.text).join(' ')}
        className='absolute'
        style={{ left: -bleed, top: -bleed, width: outerW, height: outerH, transform: `rotate(${box.rotation}deg)` }}
        data-testid='tl-lettering'
      />
    </div>
  )
}
