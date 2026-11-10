/**
 * Chapter page dimensions (pure model).
 *
 * **Why keyed by REF, not index:** if dimensions were kept as an array in the same order
 * as `pages`, adding/deleting/reordering pages or the report fix
 * flow would shift the array and dimensions would land on the WRONG pages, which is worse
 * than having none (wrong space reservation = permanent jumps). In a ref-keyed
 * dictionary an unknown page is simply "unknown"; stale
 * records are harmless.
 *
 * Dimensions are only for RESERVING SPACE (aspect-ratio). Missing ones are not an
 * error: the reader measures the real ratio when the image loads anyway.
 */

export interface ChapterPageDimension {
  w: number
  h: number
}

export type ChapterPageDimensionMap = Record<string, ChapterPageDimension>

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Produces a safe dictionary, dropping broken or missing entries. */
export function sanitizeChapterPageDimensionMap(value: unknown): ChapterPageDimensionMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const result: ChapterPageDimensionMap = {}
  for (const [ref, dimension] of Object.entries(value as Record<string, unknown>)) {
    if (!ref.trim()) continue
    if (typeof dimension !== 'object' || dimension === null) continue
    const { w, h } = dimension as { w?: unknown; h?: unknown }
    if (!isPositiveFinite(w) || !isPositiveFinite(h)) continue
    result[ref] = { w, h }
  }
  return result
}

/**
 * Produces `width / height` ratios in the same order as the page refs.
 * Returns null for an unknown page (the reader falls back to the median).
 */
export function buildChapterPageRatios(
  refs: string[],
  map: ChapterPageDimensionMap,
): Array<number | null> {
  return refs.map((ref) => {
    const dimension = map[ref]
    return dimension ? dimension.w / dimension.h : null
  })
}

/**
 * Adds newly measured dimensions to the existing dictionary. Existing records are kept:
 * a page that was not re-uploaded should not lose its info.
 */
export function mergeChapterPageDimensionMap(
  existing: unknown,
  entries: Array<{ ref: string; width: number; height: number }>,
): ChapterPageDimensionMap {
  const merged = sanitizeChapterPageDimensionMap(existing)
  for (const entry of entries) {
    if (!entry.ref?.trim()) continue
    if (!isPositiveFinite(entry.width) || !isPositiveFinite(entry.height)) continue
    merged[entry.ref] = { w: entry.width, h: entry.height }
  }
  return merged
}

/**
 * Keeps records only for pages still in use, so dimensions of deleted pages
 * do not pile up in the row.
 */
export function pruneChapterPageDimensionMap(
  map: ChapterPageDimensionMap,
  refsInUse: string[],
): ChapterPageDimensionMap {
  const inUse = new Set(refsInUse)
  const result: ChapterPageDimensionMap = {}
  for (const [ref, dimension] of Object.entries(map)) {
    if (inUse.has(ref)) result[ref] = dimension
  }
  return result
}

/** Writes null instead of an empty dictionary, so rows do not carry a needless `{}`. */
export function toStorableChapterPageDimensions(
  map: ChapterPageDimensionMap,
): ChapterPageDimensionMap | null {
  return Object.keys(map).length > 0 ? map : null
}
