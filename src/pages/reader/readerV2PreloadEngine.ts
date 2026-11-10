/**
 * Page preload and space reservation engine (pure functions).
 *
 * Two real problems it solves:
 *
 * 1. **Crude loading priority**: v2 used `index < 2 ? eager : lazy` until now.
 * That does not help a reader continuing from mid-chapter:
 * the first two pages get needless priority while neighbors of the read spot
 * wait. Priority should be calculated from the read position.
 *
 * 2. **No space reservation (layout shift)**: images have height 0 until loaded, so the
 * strip keeps jumping. This is not only a visual annoyance:
 * during auto scroll content grows below, the read line shifts and
 * progress percent goes back. The solution is knowing the aspect ratio BEFORE loading
 * and reserving space with CSS `aspect-ratio`.
 *
 * Ratio sources in priority order: (a) dimensions written to the DB at upload,
 * (b) real dimensions measured when that page loads, (c) the MEDIAN of other known
 * pages. (c) matters: it gives an unknown page a reasonable height rather than 0,
 * so the scrollbar and auto scroll behave correctly.
 */

/** How many neighbors of the read page load ahead. */
export const READER_V2_PRELOAD_WINDOW = 2

/** Ratio used with no measurements at all (roughly an A4/manga page). */
export const READER_V2_FALLBACK_ASPECT_RATIO = 0.7

export interface ReaderV2PagePriority {
  loading: 'eager' | 'lazy'
  fetchPriority: 'high' | 'auto'
}

export function resolveReaderV2PagePriority(
  pageIndex: number,
  currentIndex: number,
  windowSize: number = READER_V2_PRELOAD_WINDOW,
): ReaderV2PagePriority {
  const distance = Math.abs(pageIndex - currentIndex)
  return {
    // The read page and its neighbors load without waiting.
    loading: distance <= windowSize ? 'eager' : 'lazy',
    // Only the read page is high priority: making all 'high' makes
    // prioritization meaningless.
    fetchPriority: distance === 0 ? 'high' : 'auto',
  }
}

/** Picks numeric, positive ratios in a reasonable range. */
function isUsableRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export interface ReaderV2AspectInput {
  pageCount: number
  /** Dimensions saved at upload (if any); index aligned. */
  knownRatios: Array<number | null | undefined>
  /** Tarayicida olculen gercek oranlar; index hizali. */
  measuredRatios: Array<number | null | undefined>
}

/**
 * Returns a `width / height` ratio per page (same direction as CSS aspect-ratio).
 * If no page is known a fixed fallback is used: reserving roughly right space
 * is always better than rendering at 0 height.
 */
export function resolveReaderV2AspectRatios(input: ReaderV2AspectInput): number[] {
  const { pageCount, knownRatios, measuredRatios } = input

  const resolvedPerPage: Array<number | null> = []
  for (let index = 0; index < pageCount; index += 1) {
    const measured = measuredRatios[index]
    if (isUsableRatio(measured)) {
      resolvedPerPage.push(measured)
      continue
    }
    const known = knownRatios[index]
    resolvedPerPage.push(isUsableRatio(known) ? known : null)
  }

  const fallback = medianOf(resolvedPerPage.filter(isUsableRatio))
    ?? READER_V2_FALLBACK_ASPECT_RATIO

  return resolvedPerPage.map((ratio) => ratio ?? fallback)
}
