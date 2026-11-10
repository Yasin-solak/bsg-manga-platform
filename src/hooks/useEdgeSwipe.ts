import { useEffect, useRef } from 'react'

/**
 * Opens the menu with an inward swipe from the left edge.
 *
 * On phones the only way to the menu was the hamburger in the top bar; since the top bar
 * hides on scroll, opening the menu became "scroll up first, then tap".
 * The edge gesture reduces this to one motion.
 *
 * **Only motion starting at the SCREEN'S LEFT EDGE counts.** If a rightward swipe from the
 * middle of the page opened the menu, every swipe on horizontal rails (Continue,
 * For You) would open it.
 *
 * **Cancelled if vertical motion dominates.** The finger's natural slight drift
 * to the right while scrolling down should not open the menu.
 */

interface EdgeSwipeOptions {
  /** Touches starting within this many pixels of the edge count. */
  edgeWidth?: number
  /** Horizontal distance needed to open the menu. */
  threshold?: number
  /** Kapali degilse jest calismaz; acikken tekrar acmaya calismak anlamsiz. */
  enabled?: boolean
  onOpen: () => void
}

export function useEdgeSwipe({
  edgeWidth = 24,
  threshold = 60,
  enabled = true,
  onOpen,
}: EdgeSwipeOptions) {
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!enabled) return

    // On a mouse-driven screen the edge gesture could fire by accident;
    // the gesture only makes sense for TOUCH input.
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      start.current = touch.clientX <= edgeWidth ? { x: touch.clientX, y: touch.clientY } : null
    }

    const onTouchMove = (event: TouchEvent) => {
      const origin = start.current
      const touch = event.touches[0]
      if (!origin || !touch) return

      const dx = touch.clientX - origin.x
      const dy = touch.clientY - origin.y

      // If vertical dominates, this is a page scroll; drop the gesture.
      if (Math.abs(dy) > Math.abs(dx)) {
        start.current = null
        return
      }

      if (dx >= threshold) {
        start.current = null
        onOpen()
      }
    }

    const clear = () => { start.current = null }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', clear, { passive: true })
    window.addEventListener('touchcancel', clear, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', clear)
      window.removeEventListener('touchcancel', clear)
    }
  }, [edgeWidth, enabled, onOpen, threshold])
}
