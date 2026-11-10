import { useEffect, useState } from 'react'

/** Desk layout (list + details side by side) starts at this width; below it details open in a panel. */
export const ADMIN_DESK_QUERY = '(min-width: 1280px)'

/**
 * xl breakpoint for admin desk pages (Pending approval, Support, Legal requests).
 * At desk width AdminPageShell `fill` fixes content to screen height.
 */
export function useDeskLayout() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(ADMIN_DESK_QUERY).matches)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(ADMIN_DESK_QUERY)
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

/**
 * When the detail drawer opens on a narrow screen, focus goes to the drawer itself.
 * Default auto focus went to the first item (the info card trigger on the author name),
 * and the card opened by itself covering the content.
 */
export function focusSheetContainer(event: Event) {
  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
}
