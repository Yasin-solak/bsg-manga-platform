/**
 * Auto scroll step engine (pure function).
 *
 * Why a separate file: while logic was embedded in the rAF loop inside useEffect it could not be
 * verified: rAF runs only in a visible tab, so behavior could not be measured
 * in a headless test or a hidden panel. With decision logic in a pure
 * function it can be simulated frame by frame and tested;
 * the effect only does "measure -> calculate -> apply".
 *
 * Three real bugs it solves:
 * 1. Lazy pages grow scrollHeight, so the bottom keeps moving; one-frame bottom detection
 * turned scrolling off in the first second. Now there is no stop until
 * height settles.
 * 2. rAF stops while the tab is in the background; on return the accumulated delta (tens of
 * seconds) jumped to the chapter end in one frame. Delta is clipped.
 * 3. With no content to scroll (a short chapter fitting the screen) the switch stayed
 * on forever; it turns off once height settles.
 */

export interface AutoScrollFrameInput {
  /** Kabin anlik kaydirma konumu (px). */
  scrollTop: number
  /** Frame's total content height (px); can grow with lazy loading. */
  scrollHeight: number
  /** Kabin gorunur yuksekligi (px). */
  clientHeight: number
  /** Tercih edilen hiz (px/saniye). */
  speed: number
  /** Time since the previous frame (ms). */
  deltaMs: number
  /** Onceki karede olculen icerik yuksekligi. */
  lastScrollHeight: number
  /** Yukseklik kac ardisik karedir degismedi. */
  settledFrames: number
}

export interface AutoScrollFrameResult {
  /** Frame's new scroll position; null means no scrolling this frame. */
  nextScrollTop: number | null
  /** Bir sonraki kareye tasinacak sabitlenme sayaci. */
  settledFrames: number
  /** Bir sonraki kareye tasinacak yukseklik olcumu. */
  lastScrollHeight: number
  /** true ise otomatik kaydirma kapatilir. */
  shouldStop: boolean
}

/** Tek karede ilerlenebilecek en fazla sure (ms). Sekme donusu zipla korumasi. */
export const AUTO_SCROLL_MAX_FRAME_MS = 50

/**
 * At the bottom or on empty content, if height stays unchanged for this many consecutive frames it counts as
 * "really finished". About half a second at ~60fps; leaves enough margin for a lazy
 * next page to arrive.
 */
export const AUTO_SCROLL_SETTLE_FRAMES = 30

export function computeAutoScrollFrame(input: AutoScrollFrameInput): AutoScrollFrameResult {
  const {
    scrollTop,
    scrollHeight,
    clientHeight,
    speed,
    deltaMs,
    lastScrollHeight,
    settledFrames,
  } = input

  const heightIsStable = scrollHeight === lastScrollHeight
  const nextSettledFrames = heightIsStable ? settledFrames + 1 : 0
  const maxScroll = scrollHeight - clientHeight

  // No content to scroll: images may not have loaded yet, wait.
  // If height also settled there is really nothing to scroll.
  if (maxScroll <= 0) {
    return {
      nextScrollTop: null,
      settledFrames: nextSettledFrames,
      lastScrollHeight: scrollHeight,
      shouldStop: nextSettledFrames >= AUTO_SCROLL_SETTLE_FRAMES,
    }
  }

  // At the bottom: lazy pages may still be arriving, do not stop until
  // height settles.
  if (scrollTop >= maxScroll - 1) {
    return {
      nextScrollTop: null,
      settledFrames: nextSettledFrames,
      lastScrollHeight: scrollHeight,
      shouldStop: nextSettledFrames >= AUTO_SCROLL_SETTLE_FRAMES,
    }
  }

  const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), AUTO_SCROLL_MAX_FRAME_MS)
  const advance = (speed * clampedDeltaMs) / 1000

  return {
    nextScrollTop: Math.min(scrollTop + advance, maxScroll),
    settledFrames: 0,
    lastScrollHeight: scrollHeight,
    shouldStop: false,
  }
}
