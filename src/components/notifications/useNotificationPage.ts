import { applyNotificationReadVersion } from '@/services/notificationService/centerModel'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getNotificationPage } from '@/services/notificationService/center'
import type { NotificationCategory } from '@/services/notificationService/centerModel'
import type { Notification } from '@/services/notificationService'
import { useNotificationCenter } from './notificationContext'

type Cursor = { createdAt: string; id: string }
type PageRow = { notification: Notification; baseline: ReadonlyMap<string, number> }
export function useNotificationPage(category: NotificationCategory, unreadOnly: boolean, limit = 30) {
  const center = useNotificationCenter()
  const [rows, setRows] = useState<PageRow[]>([])
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const moreRequest = useRef<AbortController | null>(null)
  const readBaseline = useRef(center.readIds)
  readBaseline.current = center.readIds
  useEffect(() => {
    const controller = new AbortController(); const version = ++generation.current
    moreRequest.current?.abort(); moreRequest.current = null
    setRows([]); setCursor(null); setSnapshotAt(null); setError(false); setMoreError(false); setLoadingMore(false)
    if (!center.userId || !center.enabled) { setLoading(false); return () => controller.abort() }
    setLoading(true)
    const baseline = readBaseline.current
    void getNotificationPage(center.userId, { category, unreadOnly, limit, signal: controller.signal })
      .then(page => { if (!controller.signal.aborted && version === generation.current) { setRows(page.items.map(notification => ({ notification, baseline }))); setCursor(page.nextCursor); setSnapshotAt(page.snapshotAt) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); moreRequest.current?.abort() }
  }, [center.userId, center.enabled, center.readAllRevision, category, unreadOnly, limit, revision])
  const loadMore = useCallback(async () => {
    if (!center.userId || !cursor || !snapshotAt || moreRequest.current || loading) return
    const request = new AbortController(); moreRequest.current = request; const version = generation.current
    setLoadingMore(true); setMoreError(false)
    const baseline = readBaseline.current
    try {
      const page = await getNotificationPage(center.userId, { category, unreadOnly, cursor, snapshotAt, limit, signal: request.signal })
      if (!request.signal.aborted && version === generation.current) {
        setRows(prev => { const seen = new Set(prev.map(n => n.notification.id)); return [...prev, ...page.items.filter(n => !seen.has(n.id)).map(notification => ({ notification, baseline }))] })
        setCursor(page.nextCursor)
      }
    } catch { if (!request.signal.aborted && version === generation.current) setMoreError(true) }
    finally { if (moreRequest.current === request) { moreRequest.current = null; setLoadingMore(false) } }
  }, [center.userId, cursor, snapshotAt, loading, category, unreadOnly, limit])
  const items = rows.map(row => applyNotificationReadVersion(row.notification, row.baseline, center.readIds))
    .filter(n => !unreadOnly || !n.is_read)
  return { items, cursor, snapshotAt, loading, loadingMore, error, moreError, loadMore, refresh: () => { setRevision(v => v + 1); void center.refreshCounts() } }
}
