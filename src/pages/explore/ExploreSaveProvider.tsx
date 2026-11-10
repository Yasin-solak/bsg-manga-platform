import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ExploreSaveContext } from './exploreSaveContext'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import { toast } from '@/services/toastService'
import { useAuth } from '@/contexts/AuthContext'
import { getExploreFollowedIds } from '@/services/exploreMobileService'
import { followManga, unfollowManga } from '@/services/userService'
import { txa } from '@/i18n/activeLocale'


export function ExploreSaveProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [saved, setSaved] = useState(new Set<string>())
  const [pending, setPending] = useState(new Set<string>())
  const [ready, setReady] = useState(false)
  const mutations = useRef(new Map<string, boolean>())
  const owner = useRef(currentUser?.id)
  const busy = useRef(new Set<string>())
  const userRef = useRef(currentUser?.id)
  userRef.current = currentUser?.id
  const key = [...new Set(ids)].sort().join(',')
  useEffect(() => {
    const controller = new AbortController()
    if (owner.current !== currentUser?.id) { mutations.current.clear(); owner.current = currentUser?.id }
    setReady(false)
    setSaved(new Set())
    if (!currentUser?.id) { setReady(true); return () => controller.abort() }
    const userId = currentUser.id
    async function loadAllVisible() {
      const visible = key ? key.split(',') : []
      const result: string[] = []
      for (let offset = 0; offset < visible.length; offset += 60) {
        if (controller.signal.aborted) return []
        result.push(...await getExploreFollowedIds(userId, visible.slice(offset, offset + 60), controller.signal))
      }
      return result
    }
    void loadAllVisible()
      .then(rows => { if (!controller.signal.aborted) { const next = new Set(rows); mutations.current.forEach((on, id) => { if (on) next.add(id); else next.delete(id) }); setSaved(next); setReady(true) } })
      .catch(() => { if (!controller.signal.aborted) toast.error(txa('Kütüphane durumu yüklenemedi. Sayfayı yenileyip tekrar dene.')) })
    return () => controller.abort()
  }, [currentUser?.id, key])
  const toggle = useCallback(async (id: string) => {
    if (!currentUser) { navigate('/giris', { state: { from: location.pathname + location.search } }); return }
    if (!ready || busy.current.has(id)) return
    const userId = currentUser.id
    const removing = saved.has(id)
    busy.current.add(id)
    setPending(new Set(busy.current))
    try {
      await (removing ? unfollowManga(userId, id) : followManga(userId, id))
      if (userRef.current !== userId) return
      mutations.current.set(id, !removing)
      setSaved(previous => { const next = new Set(previous); if (removing) next.delete(id); else next.add(id); return next })
      toast.success(removing ? txa('Seri takipten çıkarıldı.') : txa('Seri takibe alındı, kütüphanene eklendi.'))
    } catch { toast.error(txa('İşlem tamamlanamadı. Tekrar dene.')) }
    finally { busy.current.delete(id); setPending(new Set(busy.current)) }
  }, [currentUser, location.pathname, location.search, navigate, ready, saved])
  return <ExploreSaveContext.Provider value={{ saved, pending, ready, toggle }}>{children}</ExploreSaveContext.Provider>
}
