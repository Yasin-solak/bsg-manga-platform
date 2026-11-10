export type ReaderLayoutMode = 'vertical' | 'horizontal-paged'

export type ReaderZoomLevel = 50 | 75 | 100 | 125 | 150 | 200
export type ReaderImageFitMode = 'fit-width' | 'fit-height' | 'original'

export interface ReaderPreferences {
  layoutMode: ReaderLayoutMode
  zoomLevel: ReaderZoomLevel
  autoScrollSpeed: number
  verticalImageFitMode: ReaderImageFitMode
  horizontalImageFitMode: ReaderImageFitMode
  /**
   * Webtoon mode: removes the gap between pages in vertical flow.
   * Manhwa/webtoon strips are drawn continuously; a gap splits a panel.
   * Off by default because Japanese manga reads page by page and the
   * gap marks the page boundary.
   */
  seamlessStrip: boolean
}

export const READER_PREFERENCES_STORAGE_KEY = 'reader-preferences:v1'
export const READER_ZOOM_LEVELS: ReaderZoomLevel[] = [50, 75, 100, 125, 150, 200]
export const READER_IMAGE_FIT_MODE_OPTIONS: ReaderImageFitMode[] = ['fit-width', 'fit-height', 'original']

const AUTO_SCROLL_SPEED_MIN = 30
// The upper limit went from 220 to 400: 220 was not enough for fast readers
// (especially on webtoon strips).
const AUTO_SCROLL_SPEED_MAX = 400
const AUTO_SCROLL_SPEED_STEP = 10

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  layoutMode: 'vertical',
  zoomLevel: 100,
  autoScrollSpeed: 90,
  verticalImageFitMode: 'fit-width',
  horizontalImageFitMode: 'fit-height',
  seamlessStrip: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReaderZoomLevel(value: unknown): value is ReaderZoomLevel {
  return typeof value === 'number' && READER_ZOOM_LEVELS.includes(value as ReaderZoomLevel)
}

function isReaderLayoutMode(value: unknown): value is ReaderLayoutMode {
  return value === 'vertical' || value === 'horizontal-paged'
}

function isReaderImageFitMode(value: unknown): value is ReaderImageFitMode {
  return typeof value === 'string' && READER_IMAGE_FIT_MODE_OPTIONS.includes(value as ReaderImageFitMode)
}

function normalizeAutoScrollSpeed(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_READER_PREFERENCES.autoScrollSpeed
  const rounded = Math.round(parsed / AUTO_SCROLL_SPEED_STEP) * AUTO_SCROLL_SPEED_STEP
  return Math.min(Math.max(rounded, AUTO_SCROLL_SPEED_MIN), AUTO_SCROLL_SPEED_MAX)
}

export function sanitizeReaderPreferences(value: unknown): ReaderPreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_READER_PREFERENCES }
  }

  return {
    layoutMode: isReaderLayoutMode(value.layoutMode) ? value.layoutMode : DEFAULT_READER_PREFERENCES.layoutMode,
    zoomLevel: isReaderZoomLevel(value.zoomLevel) ? value.zoomLevel : DEFAULT_READER_PREFERENCES.zoomLevel,
    autoScrollSpeed: normalizeAutoScrollSpeed(value.autoScrollSpeed),
    verticalImageFitMode: isReaderImageFitMode(value.verticalImageFitMode)
      ? value.verticalImageFitMode
      : DEFAULT_READER_PREFERENCES.verticalImageFitMode,
    horizontalImageFitMode: isReaderImageFitMode(value.horizontalImageFitMode)
      ? value.horizontalImageFitMode
      : DEFAULT_READER_PREFERENCES.horizontalImageFitMode,
    seamlessStrip: typeof value.seamlessStrip === 'boolean'
      ? value.seamlessStrip
      : DEFAULT_READER_PREFERENCES.seamlessStrip,
  }
}

export function mergeReaderPreferences(
  current: ReaderPreferences,
  patch: Partial<ReaderPreferences>,
): ReaderPreferences {
  return sanitizeReaderPreferences({
    ...current,
    ...patch,
  })
}

export function readStoredReaderPreferences(): ReaderPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_READER_PREFERENCES }
  }

  try {
    const raw = window.localStorage.getItem(READER_PREFERENCES_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_READER_PREFERENCES }
    return sanitizeReaderPreferences(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_READER_PREFERENCES }
  }
}

export function writeStoredReaderPreferences(preferences: ReaderPreferences): ReaderPreferences {
  const sanitized = sanitizeReaderPreferences(preferences)

  if (typeof window === 'undefined') {
    return sanitized
  }

  try {
    window.localStorage.setItem(READER_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitized))
  } catch {
    // localStorage kapali olsa bile reader varsayilanlarla calismaya devam etmeli.
  }

  return sanitized
}
