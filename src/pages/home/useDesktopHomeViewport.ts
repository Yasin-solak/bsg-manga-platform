import { useSyncExternalStore } from 'react'

const query = '(min-width: 1024px)'
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const snapshot = () => window.matchMedia(query).matches
const serverSnapshot = () => true

// A second tree hidden with CSS also loads queries and images; build only the visible one.
export function useDesktopHomeViewport() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
