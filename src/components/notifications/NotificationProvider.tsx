import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { getNotificationUnreadCounts, markNotificationRead, markNotificationCenterRead } from '@/services/notificationService/center'
import { toast } from '@/services/toastService'
import type { Notification } from '@/services/notificationService'
import { NotificationContext, type UnreadCounts } from './notificationContext'
import { txa } from '@/i18n/activeLocale'

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  // On account change the previous account's content and pending requests are dropped together.
  return <AccountNotifications key={currentUser?.id || 'guest'} userId={currentUser?.id || null}>{children}</AccountNotifications>
}
function AccountNotifications({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [flagsLoading, setFlagsLoading] = useState(true)
  const [counts, setCounts] = useState<UnreadCounts | null>(null)
  const [countError, setCountError] = useState(false)
  const [readIds, setReadIds] = useState(new Map<string, number>())
  const [readAllRevision, setReadAllRevision] = useState(0)
  const [busy, setBusy] = useState(new Set<string>())
  const locks = useRef(new Set<string>())
  const life = useRef(new AbortController())
  const countRequest = useRef<AbortController | null>(null)
  const countVersion = useRef(0)
  useEffect(() => {
    life.current = new AbortController()
    return () => { life.current.abort(); countRequest.current?.abort() }
  }, [])
  useEffect(() => {
    let cancelled = false
    async function load(force = false) {
      const flags = await getRuntimeFeatureFlags(['notifications.center'], false, force)
      if (!cancelled) { setEnabled(flags['notifications.center'] === true); setFlagsLoading(false) }
    }
    void load()
    const stop = listenFeatureFlagUpdates(p => { if (p.key === 'notifications.center') void load(true) })
    return () => { cancelled = true; stop() }
  }, [])
  const refreshCounts = useCallback(async () => {
    if (!userId || !enabled || life.current.signal.aborted) return
    countRequest.current?.abort()
    const request = new AbortController(); countRequest.current = request
    const version = ++countVersion.current
    try {
      const result = await getNotificationUnreadCounts(userId, { signal: request.signal })
      if (!request.signal.aborted && !life.current.signal.aborted && version === countVersion.current) { setCounts(result); setCountError(false) }
    } catch { if (!request.signal.aborted && !life.current.signal.aborted) setCountError(true) }
  }, [userId, enabled])
  useEffect(() => {
    if (!enabled || !userId) { setCounts(null); return }
    void refreshCounts()
    // Mobile/desktop bells share the same counter; no background queries.
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refreshCounts() }
    const timer = window.setInterval(visibleRefresh, 60000)
    document.addEventListener('visibilitychange', visibleRefresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh); countRequest.current?.abort() }
  }, [enabled, userId, refreshCounts])
  const markRead = useCallback(async (item: Notification) => {
    if (!userId || !enabled || locks.current.has(item.id) || locks.current.has('all')) return false
    if (item.is_read) return true
    locks.current.add(item.id); setBusy(new Set(locks.current))
    try {
      await markNotificationRead(userId, item.id, { signal: life.current.signal })
      if (life.current.signal.aborted) return false
      setReadIds(prev => new Map(prev).set(item.id, (prev.get(item.id) ?? 0) + 1)); void refreshCounts()
      return true
    } catch { if (!life.current.signal.aborted) toast.error(txa('Bildirim okundu olarak kaydedilemedi. Tekrar dene.')); return false }
    finally { locks.current.delete(item.id); if (!life.current.signal.aborted) setBusy(new Set(locks.current)) }
  }, [userId, enabled, refreshCounts])
  const markAll = useCallback(async (snapshotAt: string) => {
    if (!userId || !enabled || locks.current.size > 0) return false
    locks.current.add('all'); setBusy(new Set(locks.current))
    try {
      await markNotificationCenterRead(userId, { snapshotAt, signal: life.current.signal })
      if (life.current.signal.aborted) return false
      // Blocked actors are outside the update scope; the DB is re-read rather than building a wide date layer.
      setReadAllRevision(prev => prev + 1)
      void refreshCounts(); toast.success(txa('Tüm bildirimler okundu olarak işaretlendi.'))
      return true
    } catch { if (!life.current.signal.aborted) toast.error(txa('Bildirimler güncellenemedi. Tekrar dene.')); return false }
    finally { locks.current.delete('all'); if (!life.current.signal.aborted) setBusy(new Set(locks.current)) }
  }, [userId, enabled, refreshCounts])
  return <NotificationContext.Provider value={{ enabled, flagsLoading, userId, counts, countError, readIds, readAllRevision, busy, refreshCounts, markRead, markAll }}>{children}</NotificationContext.Provider>
}
