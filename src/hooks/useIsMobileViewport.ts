import { useEffect, useState } from 'react'

/**
 * Is this a narrow screen? For SURFACE CHOICES such as bottom sheet vs dialog.
 *
 * Initial value is `false`: the viewport is unknown on the server and at first paint, and assuming
 * narrow would flash a bottom sheet on desktop for a moment.
 *
 * Threshold 639px: one below Tailwind's `sm` breakpoint, so the "sm and up is a
 * desktop surface" rule breaks at the same point as the CSS.
 */
const MOBILE_QUERY = '(max-width: 639px)'

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mediaQuery.matches)

    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return isMobile
}

export default useIsMobileViewport
