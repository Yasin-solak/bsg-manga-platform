import { useEffect, useRef, useState } from 'react'

/**
 * A bar that hides on scroll down and comes back on scroll up.
 *
 * On phones vertical space is the scarcest resource: the fixed top bar is 56px, the bottom tab bar
 * ~69px, and together they constantly eat 15% of an 844px screen. When the user
 * scrolls down to read, the top bar has done its job.
 *
 * **It measures ACCUMULATED MOTION IN A DIRECTION, not direction changes.** The first version
 * treated every 6-pixel difference as a direction decision; a tiny finger movement made the bar
 * vanish instantly and felt abrupt. Now the bar needs uninterrupted
 * downward motion to accumulate before it hides.
 *
 * **Coming back is EASIER than leaving.** Hiding needs 64 pixels of accumulation, coming
 * back 12. When the user scrolls up, the intent is clear (reaching something above),
 * and making that intent wait is worse than never hiding the bar.
 */

interface HideOnScrollOptions {
  /** Does not hide below this threshold; the bar always stays at the top of the page. */
  threshold?: number
  /** Uninterrupted downward motion needed to hide. */
  hideAfter?: number
  /** Uninterrupted upward motion needed to come back. */
  showAfter?: number
}

export function useHideOnScroll({
  threshold = 80,
  hideAfter = 64,
  showAfter = 12,
}: HideOnScrollOptions = {}) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  /** Mevcut yonde biriken hareket; yon degisince sifirlanir. */
  const travel = useRef(0)

  useEffect(() => {
    // If the user chose reduced motion, the bar does not move: an element hiding and
    // returning is exactly what that setting wants to prevent.
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    lastY.current = window.scrollY

    let frame = 0
    const onScroll = () => {
      if (frame) return
      // The scroll event fires dozens of times a second; updating state
      // on each one causes needless renders.
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const delta = y - lastY.current
        lastY.current = y
        if (delta === 0) return

        // Reset the accumulation on direction change: turning up while going down is a new
        // intent and should not add to the old accumulation.
        travel.current =
          Math.sign(travel.current) === Math.sign(delta) ? travel.current + delta : delta

        // Always visible at the top: a hidden bar at the top of the page would be there at the one
        // moment the user is looking for the menu.
        if (y <= threshold) {
          travel.current = 0
          setHidden(false)
          return
        }

        if (travel.current >= hideAfter) setHidden(true)
        else if (travel.current <= -showAfter) setHidden(false)
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [hideAfter, showAfter, threshold])

  return hidden
}
