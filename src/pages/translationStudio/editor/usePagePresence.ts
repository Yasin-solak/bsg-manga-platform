import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/services/supabase'

/*
 * "Who is on the same page": Supabase Realtime presence, private channel "tl-page:<page>".
 * Joining the channel and broadcasting state are open in the DB only to users who can see the page
 * (realtime.messages policies). Each user broadcasts their name and selected item;
 * an item selected by someone else is marked on the canvas. Conflicts are still prevented by version control;
 * this is only an early warning.
 */

export interface PresencePeer {
  userId: string
  username: string
  selectedItemId: string | null
  color: string
}

interface PresenceMeta { user_id: string, username: string, selected_item_id: string | null }

const PEER_COLORS = ['#f472b6', '#38bdf8', '#fbbf24', '#a78bfa', '#34d399', '#fb7185']

/** A fixed color from the user id (the same person has the same color on every client). */
export function peerColor(userId: string) {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PEER_COLORS[hash % PEER_COLORS.length]
}

export function usePagePresence(pageId: string | null, me: { userId: string, username: string } | null, selectedItemId: string | null, onJoin?: (username: string) => void) {
  const [peers, setPeers] = useState<PresencePeer[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const selectedRef = useRef(selectedItemId)
  selectedRef.current = selectedItemId
  const onJoinRef = useRef(onJoin)
  onJoinRef.current = onJoin

  useEffect(() => {
    if (!pageId || !me) { setPeers([]); return undefined }
    const channel = supabase.channel(`tl-page:${pageId}`, { config: { private: true, presence: { key: me.userId } } })
    channelRef.current = channel
    const known = new Set<string>()
    let first = true
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>()
        const next: PresencePeer[] = []
        for (const [key, metas] of Object.entries(state)) {
          if (key === me.userId || !metas.length) continue
          const meta = metas[metas.length - 1]
          next.push({ userId: key, username: meta.username, selectedItemId: meta.selected_item_id ?? null, color: peerColor(key) })
        }
        // No notification for those already on the page at the first sync.
        for (const peer of next) {
          if (!known.has(peer.userId) && !first) onJoinRef.current?.(peer.username)
          known.add(peer.userId)
        }
        for (const id of [...known]) if (!next.some((peer) => peer.userId === id)) known.delete(id)
        first = false
        setPeers(next)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ user_id: me.userId, username: me.username, selected_item_id: selectedRef.current })
      })
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
      setPeers([])
    }
  }, [me, pageId])

  // State rebroadcasts on selection change (with a short delay; one message on fast clicks).
  useEffect(() => {
    const channel = channelRef.current
    if (!channel || !me) return undefined
    const timer = setTimeout(() => {
      void channel.track({ user_id: me.userId, username: me.username, selected_item_id: selectedItemId })
    }, 400)
    return () => clearTimeout(timer)
  }, [me, selectedItemId])

  return peers
}
