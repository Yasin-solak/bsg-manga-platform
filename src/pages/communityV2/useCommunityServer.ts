import { useCallback, useEffect, useRef, useState } from 'react'
import { communityV2, CommunityApiError, type CommunityServer } from '@/services/communityV2Service'
import { createCommunityRefreshQueue } from '@/lib/communityRefreshQueue'
import { mergeCommunityServerActivity } from '@/lib/communityServerActivity'
import { createCommunityLiveRefresh } from '@/lib/communityLiveRefresh'
import { communityError } from './communityHelpers'

export function useCommunityServer(activeId: string) {
  const [server, setServer] = useState<CommunityServer | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [memberRevision, setMemberRevision] = useState(0)
  const queueRef = useRef<ReturnType<typeof createCommunityRefreshQueue> | null>(null)
  const refresh = useCallback(() => queueRef.current?.request('full') || Promise.resolve(), [])
  const refreshActivity = useCallback(() => queueRef.current?.request('activity') || Promise.resolve(), [])
  useEffect(() => {
    let currentServer: CommunityServer | null = null
    setServer(null); setLoading(true); setError('')
    const queue = createCommunityRefreshQueue(async (kind, current) => {
      try {
        if (kind === 'full' || !currentServer) {
          const data = await communityV2.server(activeId)
          if (!current()) return
          currentServer = data; setServer(data); setMemberRevision(v => v + 1)
        } else {
          const data = await communityV2.activity(activeId)
          if (!current()) return
          const merged = mergeCommunityServerActivity(currentServer, data)
          currentServer = merged.server; setServer(merged.server)
          if (merged.reload) void queue.request('full')
        }
        if (current()) { setError(''); setLoading(false) }
      } catch (e) {
        if (!current()) return
        setError(communityError(e)); setLoading(false)
        if (e instanceof CommunityApiError && e.code === '42501') { currentServer = null; setServer(null) }
      }
    })
    queueRef.current = queue
    const live = createCommunityLiveRefresh({ refresh: kind => { void queue.request(kind) }, visible: () => document.visibilityState === 'visible' })
    const unsub = communityV2.subscribe('server', activeId, live.invalidate, live.connection, { refreshOnSubscribe: false })
    document.addEventListener('visibilitychange', live.wake)
    window.addEventListener('online', live.wake)
    return () => { live.dispose(); queue.dispose(); queueRef.current = null; unsub(); document.removeEventListener('visibilitychange', live.wake); window.removeEventListener('online', live.wake) }
  }, [activeId])
  return { server, error, setError, loading, memberRevision, refresh, refreshActivity }
}
