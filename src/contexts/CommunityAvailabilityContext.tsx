import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { supabase } from '@/services/supabase'
import { listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { txa } from '@/i18n/activeLocale'

const CommunityAvailabilityContext = createContext({ enabled: false, loading: true })
export const useCommunityAvailability = () => useContext(CommunityAvailabilityContext)

export function CommunityAvailabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ enabled: false, loading: true })
  const refreshRef = useRef<(force?: boolean) => void>(() => {})
  const { pathname } = useLocation()
  useEffect(() => {
    let disposed = false, checkedAt = 0, generation = 0
    let request: AbortController | null = null
    const refresh = (force = false) => {
      if (!force && (request || Date.now() - checkedAt < 30_000)) return
      const current = ++generation
      request?.abort()
      const controller = new AbortController()
      request = controller
      const timeout = setTimeout(() => controller.abort(), 8_000)
      // The main gate does not pick users by percentage; it uses the same definite result as the API.
      void Promise.resolve(supabase.rpc('community_v2_availability').abortSignal(controller.signal))
        .then(({ data, error }) => {
          if (!disposed && current === generation) setState({ enabled: !error && data === true, loading: false })
        })
        .catch(() => { if (!disposed && current === generation) setState({ enabled: false, loading: false }) })
        .finally(() => { clearTimeout(timeout); if (current === generation) { request = null; checkedAt = Date.now() } })
    }
    refreshRef.current = refresh
    refresh()
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const stop = listenFeatureFlagUpdates(({ key }) => {
      if (key !== 'community.enabled') return
      setState({ enabled: false, loading: true })
      refresh(true)
    })
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', visible)
    return () => { disposed = true; request?.abort(); stop(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible) }
  }, [])
  useEffect(() => { refreshRef.current() }, [pathname])
  // In closed mode no periodic query or Realtime connection is created.
  useEffect(() => {
    if (!state.enabled || !pathname.startsWith('/topluluk')) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshRef.current() }, 60_000)
    return () => clearInterval(timer)
  }, [state.enabled, pathname])
  return <CommunityAvailabilityContext.Provider value={state}>{children}</CommunityAvailabilityContext.Provider>
}

export function CommunityGate({ children }: { children: ReactNode }) {
  const { enabled, loading } = useCommunityAvailability()
  if (loading) return <div className="m-6 h-28 animate-pulse rounded-xl bg-muted" role="status" aria-label={txa('Topluluk durumu kontrol ediliyor')} />
  if (enabled) return <>{children}</>
  return <section className="mx-auto max-w-xl px-6 py-16">
    <h1 className="text-2xl font-bold">{txa('Topluluk henüz kullanıma açılmadı')}</h1>
    <p className="mt-3 text-muted-foreground">{txa('Hazır olduğunda burada buluşacağız. Şimdilik serileri keşfetmeye ve okumaya devam edebilirsin.')}</p>
    <Link className="mt-6 inline-block font-semibold text-primary underline" to="/">{txa('Ana sayfaya dön')}</Link>
  </section>
}
