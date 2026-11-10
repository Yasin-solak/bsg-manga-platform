/**
 * Auto advance in page mode (pure function).
 *
 * Why a separate engine: auto reading in strip mode is "continuous scrolling"
 * (px/second), in page mode "timed page turning". The horizontal container
 * works with `scroll-snap-type: x mandatory`, so scrolling pixel by pixel fights
 * snap: the browser pulls back to the nearest page each frame, and the visible
 * result is jitter. So page mode accumulates TIME, not position, and
 * when time is up runs the normal page turn command (respecting snap).
 *
 * In v1 auto scroll did not work at all in horizontal mode (the loop returned early at the start);
 * this engine closes that gap.
 *
 * Kept pure because rAF runs only in a visible tab, so
 * the loop itself cannot be tested; with decision logic outside it can be
 * simulated frame by frame.
 */

import { AUTO_SCROLL_MAX_FRAME_MS } from '@/pages/mangaReader/readerAutoScrollEngine'

export interface ReaderV2PageAdvanceInput {
  /** Time accumulated since the last page turn (ms). */
  elapsedMs: number
  /** Time since the previous frame (ms). */
  deltaMs: number
  /** Sayfa cevirme araligi (ms). */
  intervalMs: number
  /** Kap yatayda sonuna geldi mi. */
  atEnd: boolean
}

export interface ReaderV2PageAdvanceResult {
  /** Bir sonraki kareye tasinacak birikmis sure. */
  elapsedMs: number
  /** If true, one page advances this frame. */
  shouldAdvance: boolean
  /** true ise otomatik okuma kapatilir. */
  shouldStop: boolean
}

/**
 * Deviation needed to count as manual scrolling (px).
 *
 * 2px only exceeded rounding margin; on touch rubber-banding and momentum
 * recoil easily passed it and needlessly stopped auto reading.
 * 12px is far below a deliberate finger motion but above noise.
 */
export const READER_V2_MANUAL_SCROLL_TOLERANCE_PX = 12

export type ReaderV2ManualScrollReaction = 'continue' | 'resync' | 'stop'

/**
 * Response to the user scrolling manually while auto reading is on.
 *
 * User rule (2026-07-30): **scrolling up stops, scrolling down
 * continues.** Going back means "I missed something, stop";
 * going forward means "I want to move faster", and turning auto
 * off would be needless.
 *
 * Auto reading never goes BACK, so any motion behind the expected position
 * came from the user.
 */
export function resolveReaderV2ManualScroll(input: {
  /** Motorun bekledigi konum (bizim yazdigimiz). */
  expectedPosition: number
  /** Kabin gercek konumu. */
  actualPosition: number
}): ReaderV2ManualScrollReaction {
  const delta = input.actualPosition - input.expectedPosition
  if (Math.abs(delta) <= READER_V2_MANUAL_SCROLL_TOLERANCE_PX) return 'continue'
  return delta < 0 ? 'stop' : 'resync'
}

/**
 * Detecting backward scrolling in page mode.
 *
 * The strip mode rule (comparing with the expected position) does not work here:
 * in page mode we do not write the position, we smooth scroll with `scrollBy`
 * and the position is uncertain in between frames. Instead the FURTHEST POINT REACHED
 * is remembered; since auto advance never goes back, a clear
 * backward motion is from the user.
 *
 * The threshold is proportional to viewport width: small wobbles during snap should not
 * stop it, but a real "previous page" motion should.
 */
export const READER_V2_PAGE_BACKWARD_STOP_RATIO = 0.25

export function shouldStopReaderV2PageAdvance(input: {
  position: number
  furthestPosition: number
  viewportSize: number
}): boolean {
  const { position, furthestPosition, viewportSize } = input
  if (!Number.isFinite(viewportSize) || viewportSize <= 0) return false
  return furthestPosition - position > viewportSize * READER_V2_PAGE_BACKWARD_STOP_RATIO
}

/**
 * Upper limit of WAITING on an unloaded page (ms).
 *
 * If the image never arrives (404, lost connection) auto reading should not look
 * frozen forever; it continues after this time.
 */
export const READER_V2_AUTO_SCROLL_MAX_HOLD_MS = 6000

export interface ReaderV2AutoScrollHoldInput {
  /** Is there an unloaded image in the region about to be read? */
  hasPendingImage: boolean
  /** Time waited so far (ms). */
  heldMs: number
  deltaMs: number
}

export interface ReaderV2AutoScrollHoldResult {
  hold: boolean
  heldMs: number
}

/**
 * Auto reading WAITS if the page to read has not arrived yet.
 *
 * Why needed: since page sizes are reserved up front (aspect-ratio), on a slow
 * connection the strip would flow over empty gray boxes; a user on high speed
 * could pass half the chapter unseen. Space reservation solved the jumping
 * problem but created this side effect.
 *
 * No infinite wait: it continues at the upper limit, otherwise a broken
 * image would lock reading entirely.
 */
export function resolveReaderV2AutoScrollHold(
  input: ReaderV2AutoScrollHoldInput,
): ReaderV2AutoScrollHoldResult {
  const { hasPendingImage, heldMs, deltaMs } = input
  if (!hasPendingImage) return { hold: false, heldMs: 0 }

  const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), AUTO_SCROLL_MAX_FRAME_MS)
  const nextHeldMs = heldMs + clampedDeltaMs
  if (nextHeldMs >= READER_V2_AUTO_SCROLL_MAX_HOLD_MS) {
    return { hold: false, heldMs: nextHeldMs }
  }
  return { hold: true, heldMs: nextHeldMs }
}

export function computeReaderV2PageAdvance(input: ReaderV2PageAdvanceInput): ReaderV2PageAdvanceResult {
  const { elapsedMs, deltaMs, intervalMs, atEnd } = input

  // rAF stops while the tab is in the background; on return the accumulated delta (tens of seconds)
  // would skip many pages in one frame. The SAME clipping as the strip engine is used.
  const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), AUTO_SCROLL_MAX_FRAME_MS)
  const nextElapsedMs = elapsedMs + clampedDeltaMs

  if (nextElapsedMs < Math.max(intervalMs, 0)) {
    return { elapsedMs: nextElapsedMs, shouldAdvance: false, shouldStop: false }
  }

  // Time is up. On the last page it closes instead of advancing, so the reader
  // sees the last page for the full time too (it does not close and skip instantly).
  if (atEnd) {
    return { elapsedMs: 0, shouldAdvance: false, shouldStop: true }
  }

  return { elapsedMs: 0, shouldAdvance: true, shouldStop: false }
}
