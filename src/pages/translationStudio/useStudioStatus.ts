import { useCallback, useEffect, useRef, useState } from 'react'
import { startVisiblePolling } from '@/lib/polling'
import { TL_AI_USAGE_EVENT, type TlStudioStatus } from '@/services/translationStudioService'

/**
 * Studio status for the limit bar: read on a slow poll, on tab return and shortly after AI work
 * (a scan fires the usage event once per tile, so those are folded into one read).
 */
export function useStudioStatus(load: (() => Promise<TlStudioStatus>) | null, initial: TlStudioStatus | null = null) {
  const [status, setStatus] = useState<TlStudioStatus | null>(initial)
  const loadRef = useRef(load)
  loadRef.current = load
  const refresh = useCallback(() => {
    const current = loadRef.current
    if (!current) return
    void current().then(setStatus).catch(() => { /* the bar keeps its last value */ })
  }, [])
  useEffect(() => { if (initial) setStatus(initial) }, [initial])
  useEffect(() => {
    if (!load) return undefined
    let timer: number | undefined
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(refresh, 1500) }
    const stop = startVisiblePolling(refresh, 60_000, { catchUp: true })
    window.addEventListener(TL_AI_USAGE_EVENT, soon)
    return () => { stop(); window.clearTimeout(timer); window.removeEventListener(TL_AI_USAGE_EVENT, soon) }
  }, [load, refresh])
  return { status, refresh }
}
