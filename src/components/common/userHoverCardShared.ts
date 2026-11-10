import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import type { ScopedLogger } from '@/services/logger'
import type { RequestContext } from '@/services/requestContext'
import { toRequestContextLogContext } from '@/services/requestContext'
import { isAbortError } from '@/services/supabaseError'
import type { HoverCardThemeColors } from './hoverCardTheme'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const HOVER_OPEN_DELAY_MS = 400
export const HOVER_CLOSE_DELAY_MS = 220
export const UNIFIED_PROFILE_HOVER_CARD_WIDTH = 320
export const UNIFIED_PROFILE_HOVER_CARD_HEIGHT = 640
const HOVER_CARD_VIEWPORT_MARGIN_PX = 16
const HOVER_CARD_BOUNDARY_MARGIN_PX = 8

type SetState<T> = Dispatch<SetStateAction<T>>

const activeHoverClosers = new Map<string, () => void>()
let activeHoverInstanceId: string | null = null

export function registerActiveHoverCloser(instanceId: string, closeFn: () => void) {
  activeHoverClosers.set(instanceId, closeFn)
}

export function unregisterActiveHoverCloser(instanceId: string) {
  activeHoverClosers.delete(instanceId)
  if (activeHoverInstanceId === instanceId) {
    activeHoverInstanceId = null
  }
}

export function activateHoverInstance(instanceId: string) {
  if (activeHoverInstanceId && activeHoverInstanceId !== instanceId) {
    activeHoverClosers.get(activeHoverInstanceId)?.()
  }
  activeHoverInstanceId = instanceId
}

export function deactivateHoverInstance(instanceId: string) {
  if (activeHoverInstanceId === instanceId) {
    activeHoverInstanceId = null
  }
}

export function clearHoverDelay(timeoutRef: MutableRefObject<number | null>) {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
}

export function cleanupHoverLifecycle({
  hydrationAbortRef,
  openTimeoutRef,
  closeTimeoutRef,
}: {
  hydrationAbortRef: MutableRefObject<AbortController | null>
  openTimeoutRef: MutableRefObject<number | null>
  closeTimeoutRef: MutableRefObject<number | null>
}) {
  hydrationAbortRef.current?.abort()
  hydrationAbortRef.current = null
  clearHoverDelay(openTimeoutRef)
  clearHoverDelay(closeTimeoutRef)
}

export function scheduleHoverClose({
  openTimeoutRef,
  closeTimeoutRef,
  hydrationAbortRef,
  actionMenuOpenRef,
  hoverInstanceId,
  setIsOpen,
}: {
  openTimeoutRef: MutableRefObject<number | null>
  closeTimeoutRef: MutableRefObject<number | null>
  hydrationAbortRef: MutableRefObject<AbortController | null>
  actionMenuOpenRef: MutableRefObject<boolean>
  hoverInstanceId: string
  setIsOpen: SetState<boolean>
}) {
  clearHoverDelay(openTimeoutRef)
  clearHoverDelay(closeTimeoutRef)
  closeTimeoutRef.current = window.setTimeout(() => {
    if (actionMenuOpenRef.current) return
    hydrationAbortRef.current?.abort()
    hydrationAbortRef.current = null
    setIsOpen(false)
    deactivateHoverInstance(hoverInstanceId)
  }, HOVER_CLOSE_DELAY_MS)
}

export function resetHoverHydrationState<T>({
  hydrationAbortRef,
  hydrationRequestedRef,
  setHydrated,
  setHydrationError,
  setIsHydrationLoading,
  setIsActionMenuOpen,
}: {
  hydrationAbortRef: MutableRefObject<AbortController | null>
  hydrationRequestedRef: MutableRefObject<boolean>
  setHydrated: SetState<T | null>
  setHydrationError: SetState<string | null>
  setIsHydrationLoading: SetState<boolean>
  setIsActionMenuOpen: SetState<boolean>
}) {
  hydrationAbortRef.current?.abort()
  hydrationAbortRef.current = null
  hydrationRequestedRef.current = false
  setHydrated(null)
  setHydrationError(null)
  setIsHydrationLoading(false)
  setIsActionMenuOpen(false)
}

export function syncHoverActionMenuState({
  isActionMenuOpen,
  actionMenuOpenRef,
  closeTimeoutRef,
  hoverInstanceId,
  setIsOpen,
}: {
  isActionMenuOpen: boolean
  actionMenuOpenRef: MutableRefObject<boolean>
  closeTimeoutRef: MutableRefObject<number | null>
  hoverInstanceId: string
  setIsOpen: SetState<boolean>
}) {
  actionMenuOpenRef.current = isActionMenuOpen
  if (!isActionMenuOpen) return
  clearHoverDelay(closeTimeoutRef)
  activateHoverInstance(hoverInstanceId)
  setIsOpen(true)
}

export function createHoverCloseHandler({
  openTimeoutRef,
  closeTimeoutRef,
  hoverInstanceId,
  setIsOpen,
}: {
  openTimeoutRef: MutableRefObject<number | null>
  closeTimeoutRef: MutableRefObject<number | null>
  hoverInstanceId: string
  setIsOpen: SetState<boolean>
}) {
  return () => {
    clearHoverDelay(openTimeoutRef)
    clearHoverDelay(closeTimeoutRef)
    setIsOpen(false)
    deactivateHoverInstance(hoverInstanceId)
  }
}

export function bindHoverCardPosition({
  triggerRef,
  hoverInstanceId,
  sideOffset,
  setHoverPosition,
  setIsOpen,
}: {
  triggerRef: MutableRefObject<HTMLDivElement | null>
  hoverInstanceId: string
  sideOffset: number
  setHoverPosition: SetState<{ left: number; top: number }>
  setIsOpen: SetState<boolean>
}) {
  const updateHoverPosition = () => {
    if (!triggerRef.current) return

    const boundary = triggerRef.current.closest('[data-hover-card-boundary]') as HTMLElement | null
    setHoverPosition(
      resolveHoverCardPosition({
        triggerRect: triggerRef.current.getBoundingClientRect(),
        boundaryRect: boundary?.getBoundingClientRect() ?? null,
        cardHeight: UNIFIED_PROFILE_HOVER_CARD_HEIGHT,
        cardWidth: UNIFIED_PROFILE_HOVER_CARD_WIDTH,
        sideOffset,
      }),
    )
  }

  updateHoverPosition()

  const handleScroll = () => {
    setIsOpen(false)
    deactivateHoverInstance(hoverInstanceId)
  }
  const handleResize = () => {
    updateHoverPosition()
  }
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)

  return () => {
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('resize', handleResize)
  }
}

export function scheduleHoverOpen({
  openTimeoutRef,
  closeTimeoutRef,
  triggerRef,
  hoverInstanceId,
  sideOffset,
  setHoverPosition,
  setIsOpen,
}: {
  openTimeoutRef: MutableRefObject<number | null>
  closeTimeoutRef: MutableRefObject<number | null>
  triggerRef: MutableRefObject<HTMLDivElement | null>
  hoverInstanceId: string
  sideOffset: number
  setHoverPosition: SetState<{ left: number; top: number }>
  setIsOpen: SetState<boolean>
}) {
  clearHoverDelay(closeTimeoutRef)
  clearHoverDelay(openTimeoutRef)
  openTimeoutRef.current = window.setTimeout(() => {
    if (triggerRef.current) {
      const boundary = triggerRef.current.closest('[data-hover-card-boundary]') as HTMLElement | null
      setHoverPosition(
        resolveHoverCardPosition({
          triggerRect: triggerRef.current.getBoundingClientRect(),
          boundaryRect: boundary?.getBoundingClientRect() ?? null,
          cardHeight: UNIFIED_PROFILE_HOVER_CARD_HEIGHT,
          cardWidth: UNIFIED_PROFILE_HOVER_CARD_WIDTH,
          sideOffset,
        }),
      )
    }
    activateHoverInstance(hoverInstanceId)
    setIsOpen(true)
  }, HOVER_OPEN_DELAY_MS)
}

export function triggerHoverOpen({
  hydrateOnDemand,
  openTimeoutRef,
  closeTimeoutRef,
  triggerRef,
  hoverInstanceId,
  sideOffset,
  setHoverPosition,
  setIsOpen,
}: {
  hydrateOnDemand?: () => void
  openTimeoutRef: MutableRefObject<number | null>
  closeTimeoutRef: MutableRefObject<number | null>
  triggerRef: MutableRefObject<HTMLDivElement | null>
  hoverInstanceId: string
  sideOffset: number
  setHoverPosition: SetState<{ left: number; top: number }>
  setIsOpen: SetState<boolean>
}) {
  hydrateOnDemand?.()
  scheduleHoverOpen({
    openTimeoutRef,
    closeTimeoutRef,
    triggerRef,
    hoverInstanceId,
    sideOffset,
    setHoverPosition,
    setIsOpen,
  })
}

export function keepHoverOpen({
  closeTimeoutRef,
  hoverInstanceId,
  setIsOpen,
}: {
  closeTimeoutRef: MutableRefObject<number | null>
  hoverInstanceId: string
  setIsOpen: SetState<boolean>
}) {
  clearHoverDelay(closeTimeoutRef)
  activateHoverInstance(hoverInstanceId)
  setIsOpen(true)
}

export function createHoverHydrationRetry(
  hydrateOnDemand: (options?: { forceRefresh?: boolean }) => void,
) {
  return () => {
    hydrateOnDemand({ forceRefresh: true })
  }
}

export function runHoverHydration<TData>({
  enableAutoHydration,
  canHydrate,
  forceRefresh = false,
  hydrationRequestedRef,
  hydrationAbortRef,
  setHydrationError,
  setIsHydrationLoading,
  setHydrated,
  logger,
  warningMessage,
  failureMessage,
  buildRequestContext,
  load,
}: {
  enableAutoHydration: boolean
  canHydrate: boolean
  forceRefresh?: boolean
  hydrationRequestedRef: MutableRefObject<boolean>
  hydrationAbortRef: MutableRefObject<AbortController | null>
  setHydrationError: SetState<string | null>
  setIsHydrationLoading: SetState<boolean>
  setHydrated: SetState<TData | null>
  logger: ScopedLogger
  warningMessage: string
  failureMessage: string
  buildRequestContext: () => RequestContext
  load: (context: { controller: AbortController; forceRefresh: boolean }) => Promise<TData | null>
}) {
  if (!enableAutoHydration || !canHydrate) return
  if (!forceRefresh && hydrationRequestedRef.current) return

  hydrationAbortRef.current?.abort()
  const controller = new AbortController()
  hydrationAbortRef.current = controller
  hydrationRequestedRef.current = true
  setHydrationError(null)
  setIsHydrationLoading(true)

  void (async () => {
    try {
      const data = await load({ controller, forceRefresh })
      if (controller.signal.aborted) return
      if (data) {
        setHydrated(data)
      } else {
        setHydrationError(failureMessage)
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      const requestContext = buildRequestContext()
      logger.warn({
        event: requestContext.event,
        message: warningMessage,
        context: toRequestContextLogContext(requestContext),
        error,
      })
      setHydrationError(failureMessage)
    } finally {
      setIsHydrationLoading(false)
      if (controller.signal.aborted) {
        hydrationRequestedRef.current = false
      }
      if (hydrationAbortRef.current === controller) {
        hydrationAbortRef.current = null
      }
    }
  })()
}

export function buildMangaFallbackCover(title: string) {
  const safeTitle = (title.trim() || txa('Manga')).slice(0, 48)
  const escapedTitle = safeTitle.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a1a2e" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#bg)" />
      <rect x="24" y="24" width="352" height="552" rx="22" fill="none" stroke="#8b5cf6" stroke-opacity="0.35" />
      <text x="200" y="300" text-anchor="middle" dominant-baseline="middle" fill="#e5e7eb" font-size="28" font-family="Arial, sans-serif">
        ${escapedTitle}
      </text>
    </svg>
  `.trim()
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function formatFansubRole(role: string) {
  const normalized = role.trim().toLowerCase()
  if (normalized === 'admin') return txa('Admin')
  if (normalized === 'moderator') return txa('Moderator')
  if (normalized === 'member') return txa('Üye')
  return role || txa('Üye')
}

export function isUuid(value?: string) {
  const normalized = (value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
}

export function normalizeBioText(value?: string) {
  return (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatHoverDateLabel(value?: string) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function clamp(value: number, min: number, max: number) {
  if (min > max) return min
  return Math.min(Math.max(value, min), max)
}

export function shouldRenderHoverPatternOverlay(hasCustomBackground: boolean, patternStyle?: string | null) {
  return Boolean(patternStyle) && !hasCustomBackground
}

export function resolveHoverCardPosition({
  triggerRect,
  cardHeight,
  boundaryRect,
  sideOffset = 8,
  cardWidth = UNIFIED_PROFILE_HOVER_CARD_WIDTH,
}: {
  triggerRect: DOMRect
  cardHeight: number
  boundaryRect?: DOMRect | null
  sideOffset?: number
  cardWidth?: number
}) {
  const safeSideOffset = Math.max(0, sideOffset)
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const minLeft = HOVER_CARD_VIEWPORT_MARGIN_PX
  const maxLeft = Math.max(minLeft, viewportWidth - HOVER_CARD_VIEWPORT_MARGIN_PX - cardWidth)
  const leftCandidate = triggerRect.left - cardWidth - safeSideOffset
  const rightCandidate = triggerRect.right + safeSideOffset
  const availableLeft = triggerRect.left - HOVER_CARD_VIEWPORT_MARGIN_PX
  const availableRight = viewportWidth - triggerRect.right - HOVER_CARD_VIEWPORT_MARGIN_PX

  const canFitLeft = availableLeft >= cardWidth + safeSideOffset
  const canFitRight = availableRight >= cardWidth + safeSideOffset

  let left = leftCandidate
  if (canFitLeft) {
    left = leftCandidate
  } else if (canFitRight) {
    left = rightCandidate
  } else {
    // Users expect a leftward opening, so we keep left first even in narrow areas.
    left = leftCandidate
  }
  left = clamp(left, minLeft, maxLeft)

  const viewportMinTop = HOVER_CARD_VIEWPORT_MARGIN_PX
  const viewportMaxTop = Math.max(viewportMinTop, viewportHeight - HOVER_CARD_VIEWPORT_MARGIN_PX - cardHeight)
  const verticalNudge = Math.min(20, Math.max(8, triggerRect.height * 0.18))
  const topAlignedCandidate = triggerRect.top - verticalNudge
  const bottomAlignedCandidate = triggerRect.bottom - cardHeight + verticalNudge
  const availableBelowFromTop = viewportHeight - HOVER_CARD_VIEWPORT_MARGIN_PX - triggerRect.top
  const availableAboveFromBottom = triggerRect.bottom - HOVER_CARD_VIEWPORT_MARGIN_PX

  let preferredTop = topAlignedCandidate
  if (availableBelowFromTop >= cardHeight) {
    preferredTop = topAlignedCandidate
  } else if (availableAboveFromBottom >= cardHeight) {
    preferredTop = bottomAlignedCandidate
  } else {
    preferredTop = triggerRect.top <= viewportHeight / 2
      ? topAlignedCandidate
      : bottomAlignedCandidate
  }

  let minTop = viewportMinTop
  let maxTop = viewportMaxTop

  if (boundaryRect) {
    const boundedMinTop = Math.max(
      viewportMinTop,
      boundaryRect.top + HOVER_CARD_BOUNDARY_MARGIN_PX,
    )
    const boundedMaxTop = Math.min(
      viewportMaxTop,
      boundaryRect.bottom - HOVER_CARD_BOUNDARY_MARGIN_PX - cardHeight,
    )

    if (boundedMaxTop >= boundedMinTop) {
      minTop = boundedMinTop
      maxTop = boundedMaxTop
    }
  }

  return {
    left,
    top: clamp(preferredTop, minTop, maxTop),
  }
}

export interface HoverCardProps {
  children: ReactNode
  id?: string
  slug?: string
  name: string
  avatar: string
  description?: string
  mangaCount?: number
  followerCount?: number
  activeNameStyle?: {
    version?: number
    fontId?: string
    effectId?: string
    colorId?: string
    secondaryColorId?: string
  }
  hasFullNameStyle?: boolean
  hasDiscoverBadge?: boolean
  hasGoldFrame?: boolean
  canUploadStaticBackground?: boolean
  canUploadVideoBackground?: boolean
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  themeColors?: HoverCardThemeColors | null
  activeNameEffectId?: string
  activeNameFontId?: string
  activeNameColorId?: string
  activeNameSecondaryColorId?: string
  displayedBadges?: Array<{
    id: string
    name: string
    imageUrl: string
    rarity?: string
  }>
  className?: string
  portalClassName?: string
  enableAutoHydration?: boolean
  sideOffset?: number
}
