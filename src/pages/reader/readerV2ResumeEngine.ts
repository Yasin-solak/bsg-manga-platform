/**
 * "Continue from your page" decision engine (pure functions).
 *
 * **Why `scrollTop` is not stored:** scroll position is meaningless across devices.
 * A chapter that is 8000px on a phone is 3000px on desktop, and it even shifts on the same
 * device when zoom changes. So position is kept in PAGES:
 * which page + where in that page (0..1). Both are device
 * independent.
 *
 * Space reservation (aspect-ratio, Phase 6a) makes this possible: page positions are
 * right before images arrive, so restoring works accurately without
 * waiting for loading.
 */

/** A page's place and size on the scroll axis (px). */
export interface ReaderV2PageMetric {
  start: number
  size: number
}

export interface ReaderV2ReadingPosition {
  pageIndex: number
  /** Sayfanin neresindeyiz: 0 = basi, 1 = sonu. */
  pageOffsetRatio: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Finds the read page from the scroll position.
 *
 * "Read page" = the page at the START of the view, not the middle: when you come back,
 * where you continue reading is the page at the top of the screen.
 */
export function resolveReaderV2PositionFromScroll(input: {
  scrollPosition: number
  pages: ReaderV2PageMetric[]
}): ReaderV2ReadingPosition | null {
  const { scrollPosition, pages } = input
  if (pages.length === 0) return null

  const position = Math.max(scrollPosition, 0)
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    if (page.size <= 0) continue
    const end = page.start + page.size
    if (position < end || index === pages.length - 1) {
      return {
        pageIndex: index,
        pageOffsetRatio: clamp((position - page.start) / page.size, 0, 1),
      }
    }
  }
  return { pageIndex: pages.length - 1, pageOffsetRatio: 0 }
}

/**
 * Produces a scroll value from the saved position.
 *
 * The page count may have changed (a fansub re-uploaded the chapter or another team's
 * version was chosen): the index is CLIPPED TO RANGE; if the target is not found,
 * null is returned and no restore happens: not jumping is better than jumping
 * to the wrong place.
 */
export function resolveReaderV2ScrollFromPosition(input: {
  position: ReaderV2ReadingPosition
  pages: ReaderV2PageMetric[]
}): number | null {
  const { position, pages } = input
  if (pages.length === 0) return null

  const index = clamp(Math.round(position.pageIndex), 0, pages.length - 1)
  const page = pages[index]
  if (!page || page.size <= 0) return null

  const ratio = clamp(position.pageOffsetRatio, 0, 1)
  return page.start + page.size * ratio
}

/**
 * Which of local and remote position is used (cross-device sync, Phase B).
 *
 * Rule: **the newer wins.** There is no device "ownership";
 * a reader continuing on a phone and returning to desktop should see where they stopped on the phone.
 *
 * The remote record does not keep the ratio INSIDE a page (only the page index is written
 * to the server); when remote wins it goes to the START of the page. This is deliberate: half-page
 * precision would need constant writes from every device.
 */
export function pickReaderV2Position(input: {
  local: { position: ReaderV2ReadingPosition; at: number } | null
  remote: { pageIndex: number; at: number } | null
}): { position: ReaderV2ReadingPosition; source: 'local' | 'remote' } | null {
  const { local, remote } = input
  if (!remote) return local ? { position: local.position, source: 'local' } : null
  if (!local) return { position: { pageIndex: remote.pageIndex, pageOffsetRatio: 0 }, source: 'remote' }

  if (remote.at > local.at) {
    return { position: { pageIndex: remote.pageIndex, pageOffsetRatio: 0 }, source: 'remote' }
  }
  return { position: local.position, source: 'local' }
}

/** Bu orandan once kaldiysan atlamaya degmez: zaten bastasin. */
export const READER_V2_RESUME_MIN_RATIO = 0.1
/** Past this ratio skipping is not worth it: you finished, and are probably rereading. */
export const READER_V2_RESUME_MAX_RATIO = 0.95

/**
 * Should a restore happen?
 *
 * Jumping blindly is a bad experience ("where am I?"). It jumps only with MEANINGFUL
 * progress; for positions at the start or end the chapter opens normally
 * from the top.
 */
export function shouldRestoreReaderV2Position(input: {
  position: ReaderV2ReadingPosition | null
  pageCount: number
}): boolean {
  const { position, pageCount } = input
  if (!position || pageCount <= 0) return false

  const index = clamp(position.pageIndex, 0, pageCount - 1)
  const progress = (index + position.pageOffsetRatio) / pageCount
  return progress >= READER_V2_RESUME_MIN_RATIO && progress <= READER_V2_RESUME_MAX_RATIO
}
