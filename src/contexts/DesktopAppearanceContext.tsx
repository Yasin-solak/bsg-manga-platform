import { defaults, normalizeDesktopAppearance, type Preferences } from '@/lib/desktopAppearancePreferences'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const KEY = 'bsgmanga-desktop-appearance:v1'
function read(): Preferences {
  try { return normalizeDesktopAppearance(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return defaults }
}
const Context = createContext({ preferences: defaults, framesEnabled: true, error: false, update: (_patch: Partial<Preferences>) => {} })
export function DesktopAppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(read)
  const [desktop, setDesktop] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(min-width:1024px)')
    const updateViewport = () => setDesktop(media.matches)
    const sync = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setPreferences(read()) }
    updateViewport(); media.addEventListener('change', updateViewport); window.addEventListener('storage', sync)
    return () => { media.removeEventListener('change', updateViewport); window.removeEventListener('storage', sync) }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.desktopReducedMotion = String(desktop && preferences.reduceMotion)
    return () => { delete document.documentElement.dataset.desktopReducedMotion }
  }, [desktop, preferences.reduceMotion])
  function update(patch: Partial<Preferences>) {
    const next = normalizeDesktopAppearance({ ...preferences, ...patch })
    try { localStorage.setItem(KEY, JSON.stringify(next)); setPreferences(next); setError(false) } catch { setError(true) }
  }
  return <Context.Provider value={{ preferences, update, error, framesEnabled: !desktop || (preferences.animateFrames && !preferences.reduceMotion) }}>{children}</Context.Provider>
}
export const useDesktopAppearance = () => useContext(Context)
