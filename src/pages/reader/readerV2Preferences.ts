/**
 * Reader v2 preferences (pure model + storage).
 *
 * DOES NOT TOUCH v1's `reader-preferences:v1` key: settings do not leak so the two readers
 * can be compared side by side. v2 uses its own key and speaks its own preference language
 * (same as engine inputs):
 * the mode preference can be 'auto', a concept absent in v1, where mode always
 * had to be chosen by hand.
 *
 * Kept pure so sanitize/merge rules can be tested.
 */

import type { ReaderV2FitMode, ReaderV2ModePreference } from '@/pages/reader/readerV2LayoutEngine'

export const READER_V2_PREFERENCES_STORAGE_KEY = 'reader-preferences:v2'

export const READER_V2_ZOOM_LEVELS = [75, 90, 100, 115, 130, 150, 175, 200] as const
export type ReaderV2ZoomLevel = (typeof READER_V2_ZOOM_LEVELS)[number]

/**
 * Auto scroll speed range (px/second).
 *
 * The lower limit was 30 in v1, yet since v1 read position back from the DOM per frame
 * there was no motion at all at 60 px/s and below (the browser rounds to whole pixels,
 * losing sub-pixel per-frame progress). v2 accumulates position as a fraction so
 * slow speeds really work, hence the lower limit of 10.
 * The upper limit went from 400 to 600 at user request.
 */
export const READER_V2_AUTO_SCROLL_SPEED_MIN = 10
export const READER_V2_AUTO_SCROLL_SPEED_MAX = 600
export const READER_V2_AUTO_SCROLL_SPEED_STEP = 5

/** Automatic page turn interval in page mode (seconds). */
export const READER_V2_AUTO_ADVANCE_MIN_SECONDS = 2
export const READER_V2_AUTO_ADVANCE_MAX_SECONDS = 30

export interface ReaderV2Preferences {
  /** 'auto' = the engine decides by content (webtoon/page). */
  modePreference: ReaderV2ModePreference
  fitMode: ReaderV2FitMode
  /** Removes the page gap in strip mode (webtoon). */
  seamless: boolean
  zoomLevel: ReaderV2ZoomLevel
  /** Serit modunda otomatik kaydirma hizi (px/saniye). */
  autoScrollSpeed: number
  /** Automatic page turn interval in page mode (seconds). */
  autoAdvanceSeconds: number
}

export const DEFAULT_READER_V2_PREFERENCES: ReaderV2Preferences = {
  modePreference: 'auto',
  fitMode: 'width',
  seamless: false,
  zoomLevel: 100,
  autoScrollSpeed: 90,
  autoAdvanceSeconds: 6,
}

const MODE_PREFERENCES: ReaderV2ModePreference[] = ['auto', 'strip', 'page']
const FIT_MODES: ReaderV2FitMode[] = ['width', 'height', 'original']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Sayisal tercihleri kademeye oturtup sinirlar icinde tutar. */
function normalizeNumber(value: unknown, fallback: number, min: number, max: number, step: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.round(parsed / step) * step
  return Math.min(Math.max(rounded, min), max)
}

export function sanitizeReaderV2Preferences(value: unknown): ReaderV2Preferences {
  if (!isRecord(value)) return { ...DEFAULT_READER_V2_PREFERENCES }

  const modePreference = MODE_PREFERENCES.includes(value.modePreference as ReaderV2ModePreference)
    ? (value.modePreference as ReaderV2ModePreference)
    : DEFAULT_READER_V2_PREFERENCES.modePreference

  const fitMode = FIT_MODES.includes(value.fitMode as ReaderV2FitMode)
    ? (value.fitMode as ReaderV2FitMode)
    : DEFAULT_READER_V2_PREFERENCES.fitMode

  const zoomLevel = READER_V2_ZOOM_LEVELS.includes(value.zoomLevel as ReaderV2ZoomLevel)
    ? (value.zoomLevel as ReaderV2ZoomLevel)
    : DEFAULT_READER_V2_PREFERENCES.zoomLevel

  return {
    modePreference,
    fitMode,
    seamless: typeof value.seamless === 'boolean' ? value.seamless : DEFAULT_READER_V2_PREFERENCES.seamless,
    zoomLevel,
    autoScrollSpeed: normalizeNumber(
      value.autoScrollSpeed,
      DEFAULT_READER_V2_PREFERENCES.autoScrollSpeed,
      READER_V2_AUTO_SCROLL_SPEED_MIN,
      READER_V2_AUTO_SCROLL_SPEED_MAX,
      READER_V2_AUTO_SCROLL_SPEED_STEP,
    ),
    autoAdvanceSeconds: normalizeNumber(
      value.autoAdvanceSeconds,
      DEFAULT_READER_V2_PREFERENCES.autoAdvanceSeconds,
      READER_V2_AUTO_ADVANCE_MIN_SECONDS,
      READER_V2_AUTO_ADVANCE_MAX_SECONDS,
      1,
    ),
  }
}

export function mergeReaderV2Preferences(
  current: ReaderV2Preferences,
  patch: Partial<ReaderV2Preferences>,
): ReaderV2Preferences {
  return sanitizeReaderV2Preferences({ ...current, ...patch })
}

export function readStoredReaderV2Preferences(): ReaderV2Preferences {
  if (typeof window === 'undefined') return { ...DEFAULT_READER_V2_PREFERENCES }
  try {
    const raw = window.localStorage.getItem(READER_V2_PREFERENCES_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_READER_V2_PREFERENCES }
    return sanitizeReaderV2Preferences(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_READER_V2_PREFERENCES }
  }
}

export function writeStoredReaderV2Preferences(preferences: ReaderV2Preferences): ReaderV2Preferences {
  const sanitized = sanitizeReaderV2Preferences(preferences)
  if (typeof window === 'undefined') return sanitized
  try {
    window.localStorage.setItem(READER_V2_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitized))
  } catch {
    // localStorage kapali olsa bile okuyucu varsayilanlarla calismali.
  }
  return sanitized
}

/** Changes the zoom level by one step (returns the same at the limit). */
export function stepReaderV2Zoom(current: ReaderV2ZoomLevel, direction: 1 | -1): ReaderV2ZoomLevel {
  const index = READER_V2_ZOOM_LEVELS.indexOf(current)
  const nextIndex = Math.min(Math.max(index + direction, 0), READER_V2_ZOOM_LEVELS.length - 1)
  return READER_V2_ZOOM_LEVELS[nextIndex]
}
