/**
 * Storing reading position on the device (Phase A).
 *
 * Why localStorage: most readers may not be signed in; "continue where I
 * left off" should work for them too. Position is also frequently changing data:
 * writing to the server on each change needlessly burns Postgres CPU, the only
 * bottleneck in our scale notes. Cross-device sync comes in a separate phase
 * with SPARSE writes.
 *
 * The key is per CHAPTER: different chapters of a series have separate positions.
 * Record count is limited; the oldest are dropped so storage does not swell.
 */

import type { ReaderV2ReadingPosition } from '@/pages/reader/readerV2ResumeEngine'

export const READER_V2_POSITION_STORAGE_KEY = 'reader-position:v1'

/** Maximum stored chapter positions (old ones are dropped). */
export const READER_V2_POSITION_MAX_ENTRIES = 60

export interface StoredReaderV2Position extends ReaderV2ReadingPosition {
  /** Record time; to find the oldest during pruning. */
  at: number
}

type PositionMap = Record<string, StoredReaderV2Position>

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Produces a safe dictionary, dropping broken or missing records. */
export function sanitizeReaderV2PositionMap(value: unknown): PositionMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const result: PositionMap = {}
  for (const [chapterId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!chapterId.trim()) continue
    if (typeof entry !== 'object' || entry === null) continue
    const { pageIndex, pageOffsetRatio, at } = entry as Record<string, unknown>
    if (!isFiniteNumber(pageIndex) || pageIndex < 0) continue
    if (!isFiniteNumber(pageOffsetRatio) || pageOffsetRatio < 0 || pageOffsetRatio > 1) continue
    result[chapterId] = {
      pageIndex: Math.round(pageIndex),
      pageOffsetRatio,
      at: isFiniteNumber(at) ? at : 0,
    }
  }
  return result
}

/** Keeps the newest records; drops those over the limit. */
export function pruneReaderV2PositionMap(map: PositionMap): PositionMap {
  const entries = Object.entries(map)
  if (entries.length <= READER_V2_POSITION_MAX_ENTRIES) return map

  const kept = entries
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, READER_V2_POSITION_MAX_ENTRIES)
  return Object.fromEntries(kept)
}

function readMap(): PositionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(READER_V2_POSITION_STORAGE_KEY)
    return raw ? sanitizeReaderV2PositionMap(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function readStoredReaderV2Position(chapterId: string | null | undefined): StoredReaderV2Position | null {
  if (!chapterId) return null
  return readMap()[chapterId] ?? null
}

export function writeStoredReaderV2Position(
  chapterId: string | null | undefined,
  position: ReaderV2ReadingPosition,
) {
  if (!chapterId || typeof window === 'undefined') return
  try {
    const next = pruneReaderV2PositionMap({
      ...readMap(),
      [chapterId]: { ...position, at: Date.now() },
    })
    window.localStorage.setItem(READER_V2_POSITION_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Depolama kapali olsa bile okuma calismaya devam etmeli.
  }
}

export function clearStoredReaderV2Position(chapterId: string | null | undefined) {
  if (!chapterId || typeof window === 'undefined') return
  try {
    const map = readMap()
    delete map[chapterId]
    window.localStorage.setItem(READER_V2_POSITION_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // yoksay
  }
}
