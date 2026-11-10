import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listAnnouncements, type Announcement } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

export function useAnnouncements({ home = false, id, kind, offset = 0, limit = 20 }: { home?: boolean; id?: string; kind?: string; offset?: number; limit?: number } = {}) {
  const { currentUser, loading: authLoading } = useAuth()
  const [state, setState] = useState<{ key: string; items: Announcement[]; loading: boolean; error: string }>({ key: '', items: [], loading: true, error: '' })
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const key = `${currentUser?.id || 'guest'}:${home}:${id}:${kind}:${offset}:${limit}`
  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    setState(s => ({ key, items: s.key === key ? s.items : [], loading: true, error: '' }))
    void listAnnouncements({ home, id, kind, offset, limit, signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setState({ key, items, loading: false, error: '' }) })
      .catch(() => { if (!controller.signal.aborted) setState({ key, items: [], loading: false, error: txa('Duyurular alınamadı.') }) })
    return () => controller.abort()
  }, [key, home, id, kind, offset, limit, version, authLoading])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(onVisible, 60000)
    window.addEventListener('mz:announcements-changed', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); window.removeEventListener('mz:announcements-changed', refresh); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])
  // Even for one frame during an account change, the previous person's private announcement is not shown.
  return { items: !authLoading && state.key === key ? state.items : [], loading: authLoading || state.key !== key || state.loading, error: state.key === key ? state.error : '', refresh }
}
