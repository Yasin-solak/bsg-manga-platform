import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent } from 'react'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { getStoreProfileEffectAssetMap } from '@/services/storeProfileEffectService'

/*
 * Shop live cards: ONE active card at a time. Hover-intent (120ms) or keyboard focus on desktop,
 * the card at screen center on touch (IntersectionObserver), only on tap with the reduced motion
 * preference (preview button). The live layer mounts only on the active card; released when the card leaves the screen
 * or the pointer / focus leaves (video stops, layer unmounts).
 */

export const SHOP_LIVE_HOVER_INTENT_MS = 120
// Dokunmatikte "ortadaki kart": viewport'un dikey ortasindaki ince serit.
export const SHOP_LIVE_CENTER_BAND = '-42% 0px -42% 0px'

type LiveState = { id: string | null, session: number }

let liveState: LiveState = { id: null, session: 0 }
const liveListeners = new Set<() => void>()

function emitLive() {
  liveListeners.forEach((listener) => listener())
}

function subscribeLive(listener: () => void) {
  liveListeners.add(listener)
  return () => { liveListeners.delete(listener) }
}

/** Makes a card active; the previously active card is released automatically (one active card). */
export function activateShopLive(id: string) {
  if (liveState.id === id) return
  // Each entry is a new session: the live layer key changes, animation / video starts over.
  liveState = { id, session: liveState.session + 1 }
  emitLive()
}

export function releaseShopLive(id: string) {
  if (liveState.id !== id) return
  liveState = { id: null, session: liveState.session }
  emitLive()
}

export function getActiveShopLiveId() {
  return liveState.id
}

/** Kartin oturum numarasi; aktif degilse 0. Yalniz etkilenen kartlar yeniden cizilir. */
function useShopLiveSession(id: string) {
  return useSyncExternalStore(
    subscribeLive,
    () => (liveState.id === id ? liveState.session : 0),
    () => 0,
  )
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const media = window.matchMedia(query)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}

export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Hover'i olmayan (dokunmatik) cihaz. */
export function useTouchOnly() {
  return useMediaQuery('(hover: none)')
}

export interface ShopLiveCardControl<T extends HTMLElement> {
  ref: (node: T | null) => void
  live: boolean
  playSession: number
  /** Dokunmatik ya da hareket azaltma: onizleme dugmesi gosterilir. */
  manual: boolean
  toggle: () => void
  handlers: {
    onPointerEnter: (event: PointerEvent<T>) => void
    onPointerLeave: (event: PointerEvent<T>) => void
    onFocus: (event: FocusEvent<T>) => void
    onBlur: (event: FocusEvent<T>) => void
  }
}

export function useShopLiveCard<T extends HTMLElement>(id: string, options: { disabled?: boolean } = {}): ShopLiveCardControl<T> {
  const [node, setNode] = useState<T | null>(null)
  const intentRef = useRef<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const touchOnly = useTouchOnly()
  const playSession = useShopLiveSession(id)
  const live = playSession > 0
  // No autoplay with the reduced motion preference (hover / focus / scroll), only on tap.
  const autoplay = !reducedMotion && !options.disabled

  const clearIntent = useCallback(() => {
    if (intentRef.current !== null) {
      window.clearTimeout(intentRef.current)
      intentRef.current = null
    }
  }, [])

  const activateWithIntent = useCallback(() => {
    clearIntent()
    intentRef.current = window.setTimeout(() => {
      intentRef.current = null
      activateShopLive(id)
    }, SHOP_LIVE_HOVER_INTENT_MS)
  }, [clearIntent, id])

  const release = useCallback(() => {
    clearIntent()
    releaseShopLive(id)
  }, [clearIntent, id])

  // Dokunmatik: ekranin ortasindaki serite giren kart kendiliginden oynar, cikinca durur.
  useEffect(() => {
    if (!node || !touchOnly || !autoplay || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) activateShopLive(id)
      else releaseShopLive(id)
    }, { rootMargin: SHOP_LIVE_CENTER_BAND, threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoplay, id, node, touchOnly])

  // Aktif kart ekrandan cikinca birakilir: canli katman unmount, video durur.
  useEffect(() => {
    if (!node || !live || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) releaseShopLive(id)
    }, { threshold: 0 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [id, live, node])

  useEffect(() => () => {
    clearIntent()
    releaseShopLive(id)
  }, [clearIntent, id])

  return {
    ref: setNode,
    live,
    playSession,
    manual: reducedMotion || touchOnly,
    toggle: () => (live ? release() : activateShopLive(id)),
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType === 'touch' || !autoplay) return
        activateWithIntent()
      },
      onPointerLeave: (event) => {
        if (event.pointerType === 'touch') return
        release()
      },
      // Keyboard focus behaves like hover (focus-within: any focus inside the card).
      onFocus: (event) => {
        // Portal (satin alma penceresi) icinden kabarcikla gelen odak karti canlandirmaz.
        if (!autoplay || !event.currentTarget.contains(event.target as Node)) return
        activateWithIntent()
      },
      onBlur: (event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        release()
      },
    },
  }
}

/** Becomes true near the screen (media src connects late). */
export function useNearViewport<T extends HTMLElement>(rootMargin = '300px 0px') {
  const [node, setNode] = useState<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!node || near) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setNear(true)
    }, { rootMargin })
    observer.observe(node)
    return () => observer.disconnect()
  }, [near, node, rootMargin])
  return [setNode, near] as const
}

/** The box's short edge (for components wanting px such as frame size). */
export function useStageSize<T extends HTMLElement>(fallback: number) {
  const [node, setNode] = useState<T | null>(null)
  const [size, setSize] = useState(fallback)
  useEffect(() => {
    if (!node) return undefined
    const measure = () => {
      const rect = node.getBoundingClientRect()
      const shortest = Math.min(rect.width, rect.height)
      if (shortest > 0) setSize(shortest)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, size] as const
}

// Profile effect assets: loaded once on first live display, then from cache.
const effectAssetCache = new Map<string, Promise<StoreProfileEffectAssets | null>>()

export function loadShopEffectAssets(itemId: string) {
  const cached = effectAssetCache.get(itemId)
  if (cached) return cached
  const request = getStoreProfileEffectAssetMap([itemId])
    .then(({ data, error }) => {
      if (error) effectAssetCache.delete(itemId)
      return data.get(itemId) ?? null
    })
    .catch(() => {
      effectAssetCache.delete(itemId)
      return null
    })
  effectAssetCache.set(itemId, request)
  return request
}

export function useShopEffectAssets(itemId: string | null | undefined, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ id: string, assets: StoreProfileEffectAssets | null } | null>(null)
  useEffect(() => {
    if (!enabled || !itemId) return undefined
    let cancelled = false
    void loadShopEffectAssets(itemId).then((assets) => {
      if (!cancelled) setLoaded({ id: itemId, assets })
    })
    return () => { cancelled = true }
  }, [enabled, itemId])
  return loaded && loaded.id === itemId ? loaded.assets : null
}
