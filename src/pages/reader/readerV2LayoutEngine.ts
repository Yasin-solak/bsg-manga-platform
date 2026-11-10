/**
 * Reader v2 layout engine (pure function).
 *
 * v1's root problem: vertical and horizontal modes were TWO SEPARATE JSX trees and TWO SEPARATE
 * scroll containers; each layout decision had to be written in both,
 * and the horizontal branch overflowed the stage by its own rules, swallowing the comment
 * panel's clicks.
 *
 * In v2 the decision is made in ONE place: this engine takes measures and returns a layout
 * decision. The component only applies it. Being pure the engine can be tested frame by frame
 * / measure by measure (rAF does not run in a hidden tab, a lesson from the auto
 * scroll engine).
 */

export type ReaderV2ModePreference = 'auto' | 'strip' | 'page'
export type ReaderV2ResolvedMode = 'strip' | 'page'
export type ReaderV2Axis = 'y' | 'x'
export type ReaderV2FitMode = 'width' | 'height' | 'original'

export interface ReaderV2Viewport {
  width: number
  height: number
}

export interface ReaderV2LayoutInput {
  /** Sayfa en-boy oranlari (yukseklik / genislik). Bilinmiyorsa bos dizi. */
  pageAspects: number[]
  viewport: ReaderV2Viewport
  modePreference: ReaderV2ModePreference
  fitMode: ReaderV2FitMode
  /** Kullanici serit modunda bosluk istemiyorsa (webtoon) true. */
  seamless: boolean
}

export interface ReaderV2Layout {
  mode: ReaderV2ResolvedMode
  /** Kaydirma ekseni — TEK kap, yalnizca eksen degisir. */
  axis: ReaderV2Axis
  /** Sayfa modunda snap zorunlu; seritte serbest akis. */
  snap: 'none' | 'mandatory'
  /** Pages shown per screen (double page layout). */
  perView: 1 | 2
  gapPx: number
  /** Serit modunda icerik genisligi siniri; 0 = sinirsiz. */
  contentMaxWidthPx: number
  /** Was the decision automatic (not a user preference)? */
  autoResolved: boolean
}

/** Pages longer than this ratio count as a webtoon strip. */
export const READER_V2_STRIP_ASPECT_THRESHOLD = 2

/** Minimum width needed for a double page layout. */
export const READER_V2_DOUBLE_PAGE_MIN_WIDTH = 1024

const STRIP_MAX_WIDTH_WEBTOON = 900
const STRIP_MAX_WIDTH_MANGA = 1100
const STRIP_GAP_DEFAULT = 16

function medianAspect(pageAspects: number[]): number | null {
  const usable = pageAspects.filter((value) => Number.isFinite(value) && value > 0)
  if (usable.length === 0) return null
  const sorted = [...usable].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * Resolves layout by content and screen.
 * The user's preference always beats the automatic decision.
 */
export function resolveReaderV2Layout(input: ReaderV2LayoutInput): ReaderV2Layout {
  const { pageAspects, viewport, modePreference, fitMode, seamless } = input

  const aspect = medianAspect(pageAspects)
  const looksLikeStrip = aspect !== null && aspect > READER_V2_STRIP_ASPECT_THRESHOLD

  const autoResolved = modePreference === 'auto'
  // Without measures strip is assumed: a long page fits a strip, a short page is also readable
  // in vertical flow. The reverse (a strip in page mode) is unreadable.
  const mode: ReaderV2ResolvedMode = autoResolved
    ? (aspect === null ? 'strip' : (looksLikeStrip ? 'strip' : 'page'))
    : modePreference

  if (mode === 'strip') {
    return {
      mode: 'strip',
      axis: 'y',
      snap: 'none',
      perView: 1,
      // A webtoon strip must flow continuously; we leave a gap only for the user or
      // classic page content.
      gapPx: seamless || looksLikeStrip ? 0 : STRIP_GAP_DEFAULT,
      contentMaxWidthPx: fitMode === 'original'
        ? 0
        : (looksLikeStrip ? STRIP_MAX_WIDTH_WEBTOON : STRIP_MAX_WIDTH_MANGA),
      autoResolved,
    }
  }

  const canDoublePage = viewport.width >= READER_V2_DOUBLE_PAGE_MIN_WIDTH
    && viewport.width > viewport.height
    && fitMode !== 'original'

  return {
    mode: 'page',
    axis: 'x',
    snap: 'mandatory',
    perView: canDoublePage ? 2 : 1,
    gapPx: 0,
    contentMaxWidthPx: 0,
    autoResolved,
  }
}

export interface ReaderV2ScrollMetrics {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
}

export interface ReaderV2Progress {
  /** 0-100 arasi ilerleme. */
  percent: number
  /** Current page index in page mode (0-based); an estimate in strip mode. */
  pageIndex: number
}

/**
 * Progress is calculated in ONE place: the caller uses the same function even if the axis
 * changes. In v1 this was written separately for two modes.
 */
export function computeReaderV2Progress(
  layout: ReaderV2Layout,
  metrics: ReaderV2ScrollMetrics,
  pageCount: number,
): ReaderV2Progress {
  if (pageCount <= 0) return { percent: 0, pageIndex: 0 }

  if (layout.axis === 'x') {
    const maxScroll = Math.max(metrics.scrollWidth - metrics.clientWidth, 0)
    const percent = maxScroll <= 0 ? 100 : (metrics.scrollLeft / maxScroll) * 100
    const step = Math.max(metrics.clientWidth, 1)
    const viewIndex = Math.round(metrics.scrollLeft / step)
    const pageIndex = Math.min(viewIndex * layout.perView, pageCount - 1)
    return {
      percent: clampPercent(percent),
      pageIndex: Math.max(pageIndex, 0),
    }
  }

  const maxScroll = Math.max(metrics.scrollHeight - metrics.clientHeight, 0)
  const percent = maxScroll <= 0 ? 100 : (metrics.scrollTop / maxScroll) * 100
  // An estimate in strip mode without knowing exact page boundaries: from the progress ratio.
  const pageIndex = Math.min(
    Math.floor((clampPercent(percent) / 100) * pageCount),
    pageCount - 1,
  )
  return { percent: clampPercent(percent), pageIndex: Math.max(pageIndex, 0) }
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

/** Converts the target page to a scroll position when moving to page mode. */
export function pageIndexToScrollOffset(
  layout: ReaderV2Layout,
  pageIndex: number,
  clientWidth: number,
): number {
  if (layout.axis !== 'x') return 0
  const viewIndex = Math.floor(Math.max(pageIndex, 0) / layout.perView)
  return viewIndex * Math.max(clientWidth, 1)
}
