import { startVisiblePolling } from '@/lib/polling'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listAnnouncements, type Announcement } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

type AnnouncementState = { key: string; items: Announcement[]; loading: boolean; loaded: boolean; error: string }

/**
 * Last result per query (user + filters). Returning to a page shows it at once instead of a
 * skeleton; the fetch that follows updates it quietly.
 */
const lastResult = new Map<string, Announcement[]>()

const initialState = (key: string): AnnouncementState => {
  const cached = lastResult.get(key)
  return cached ? { key, items: cached, loading: false, loaded: true, error: '' } : { key, items: [], loading: true, loaded: false, error: '' }
}

export function useAnnouncements({ home = false, id, kind, offset = 0, limit = 20 }: { home?: boolean; id?: string; kind?: string; offset?: number; limit?: number } = {}) {
  const { currentUser, loading: authLoading } = useAuth()
  const key = `${currentUser?.id || 'guest'}:${home}:${id}:${kind}:${offset}:${limit}`
  const [state, setState] = useState<AnnouncementState>(() => initialState(key))
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    // A background refresh (tab return, polling) keeps what is on screen: no skeleton, so an
    // empty panel does not flash in and out and a list does not blink.
    setState(s => (s.key === key && s.loaded ? s : initialState(key)))
    void listAnnouncements({ home, id, kind, offset, limit, signal: controller.signal })
      .then(items => {
        if (controller.signal.aborted) return
        lastResult.set(key, items)
        setState({ key, items, loading: false, loaded: true, error: '' })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        // A failed background refresh keeps the last good list; only a first load shows the error.
        setState(s => (s.key === key && s.loaded ? s : { key, items: [], loading: false, loaded: false, error: txa('Duyurular alınamadı.') }))
      })
    return () => controller.abort()
  }, [key, home, id, kind, offset, limit, version, authLoading])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const stopPolling = startVisiblePolling(refresh, 60000, { catchUp: false })
    window.addEventListener('mz:announcements-changed', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => { stopPolling(); window.removeEventListener('mz:announcements-changed', refresh); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])
  // Even for one frame during an account change, the previous person's private announcement is not shown.
  const current = !authLoading && state.key === key
  return { items: current ? state.items : [], loading: !current || state.loading, error: current ? state.error : '', refresh }
}
