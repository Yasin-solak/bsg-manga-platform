import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userService } from '@/services/userService'
import { toast } from '@/services/toastService'
import { subscribeFollowGraphMutations } from '@/services/followFeedService'
import { txa } from '@/i18n/activeLocale'

/** Prevents double clicks on the same card; a failed save does not count as following in the UI. */
export function useDesktopFollow(kind: 'manga' | 'fansub') {
  const { currentUser } = useAuth()
  const userId = currentUser?.id
  const owner = useRef(userId)
  owner.current = userId
  const locks = useRef(new Set<string>())
  const [ids, setIds] = useState(new Set<string>())
  const [busy, setBusy] = useState(new Set<string>())
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    setIds(new Set()); setReady(false); setError(false)
    const load = async () => {
      if (!userId) { setReady(true); return }
      try {
        const rows = kind === 'manga' ? await userService.getFollowedMangas(userId) : await userService.getFollowedFansubs(userId, { includeCosmetics: false })
        if (!cancelled) { setIds(new Set(rows.map((row: Record<string, unknown>) => String(row[kind === 'manga' ? 'manga_id' : 'fansub_id'] || '')).filter(Boolean))); setReady(true) }
      } catch { if (!cancelled) { setReady(false); setError(true) } }
    }
    void load()
    const unsubscribe = subscribeFollowGraphMutations(() => { void load() })
    return () => { cancelled = true; unsubscribe() }
  }, [userId, kind, attempt])
  const toggle = async (id: string) => {
    if (!userId) { toast.warning(txa('Takip etmek için giriş yapmalısın.')); return }
    if (!ready || locks.current.has(id)) return
    locks.current.add(id); setBusy(new Set(locks.current))
    const following = ids.has(id)
    try {
      if (kind === 'manga') await (following ? userService.unfollowManga(userId, id) : userService.followManga(userId, id))
      else await (following ? userService.unfollowFansub(userId, id) : userService.followFansub(userId, id))
      if (owner.current !== userId) return
      setIds(old => { const next = new Set(old); if (following) next.delete(id); else next.add(id); return next })
      toast.success(following ? txa('Takipten çıkarıldı.') : txa('Takibe alındı.'))
    } catch { toast.error(txa('Takip işlemi tamamlanamadı. Tekrar deneyebilirsin.')) }
    finally { locks.current.delete(id); setBusy(new Set(locks.current)) }
  }
  return { ids, busy, ready, error, retry: () => setAttempt(n => n + 1), toggle }
}
