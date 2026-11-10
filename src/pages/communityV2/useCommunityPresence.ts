import { useCallback, useEffect, useRef, useState } from 'react'
import { communityPersonal, type CommunityPresence } from '@/services/communityPersonalService'

type TimedPresence = CommunityPresence & { typingDeadline: number; presenceDeadline: number }

export function useCommunityPresence(channelId: string, visible: boolean) {
  const [rows, setRows] = useState<TimedPresence[]>([])
  const requestTyping = useRef<(() => void) | null>(null)
  useEffect(() => {
    let active = true, pending = false, lastInput = 0, lastTyping = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    setRows([])
    const read = async (heartbeat = false) => {
      if (!visible || document.visibilityState !== 'visible' || pending) return
      pending = true
      const started = performance.now()
      try {
        const value = await communityPersonal.presence(channelId, heartbeat ? 'heartbeat' : 'presence', heartbeat && lastInput > 0 && performance.now() - lastInput < 6000)
        // A response for an old channel or background is not applied. Network time does not extend the duration.
        if (active && document.visibilityState === 'visible') setRows(value.map(row => ({ ...row, typingDeadline: started + row.typing_seconds * 1000, presenceDeadline: started + row.presence_seconds * 1000 })))
      } catch { if (active) setRows([]) } finally { pending = false }
    }
    requestTyping.current = () => {
      lastInput = performance.now()
      if (lastTyping > 0 && lastInput - lastTyping < 4000) return
      lastTyping = lastInput
      void read(true)
    }
    const changed = () => { if (!timer) timer = setTimeout(() => { timer = undefined; void read() }, 1500) }
    // The chat's existing socket only signals refresh; no second subscription opens.
    window.addEventListener(`community-presence:${channelId}`, changed)
    void read(true)
    const interval = setInterval(() => { void read(true) }, 30000)
    const expire = setInterval(() => {
      const stamp = performance.now()
      setRows(previous => previous.filter(r => r.presenceDeadline > stamp).map(r => r.typing && r.typingDeadline <= stamp ? { ...r, typing: false } : r))
    }, 1000)
    const visibility = () => {
      if (document.visibilityState === 'visible') void read(true)
      else { setRows([]); void communityPersonal.presence(channelId, 'offline').catch(() => {}) }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      active = false; requestTyping.current = null
      clearTimeout(timer); clearInterval(interval); clearInterval(expire)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener(`community-presence:${channelId}`, changed)
      void communityPersonal.presence(channelId, 'offline').catch(() => {})
    }
  }, [channelId, visible])
  const typing = useCallback(() => { requestTyping.current?.() }, [])
  return { rows, typing }
}
