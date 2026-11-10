import { useEffect, useState } from 'react'

import { resolveSafeAssetUrl } from '@/services/assetUrlService'
import {
  loadStoreItemsLiteByIdentifiers,
  toStoreItemLiteTypeIdentifierKey,
} from '@/services/storeItemLiteDirectory'

import {
  FRAME_ASSET_LOADERS,
  FRAME_IDLE_ASSET_LOADERS,
  FRAME_TYPES,
  type FrameType,
  type LazyFrameAsset,
} from './avatarFrameConstants'
import { useAvatarFrameIdleOverlay } from './useAvatarFrameIdleOverlay'

const customFrameLiveCache = new Map<string, string | null>()
const customFramePosterCache = new Map<string, string | null>()
const builtInFrameUrlCache = new Map<LazyFrameAsset, string>()
const builtInIdleFrameUrlCache = new Map<LazyFrameAsset, string>()
const builtInFrameInFlight = new Map<LazyFrameAsset, Promise<string | null>>()
const builtInIdleFrameInFlight = new Map<LazyFrameAsset, Promise<string | null>>()
const customFrameAssetInFlight = new Map<string, Promise<{ liveUrl: string | null; posterUrl: string | null }>>()

function normalizeCustomFrameKey(frameType: string | null | undefined) {
  return typeof frameType === 'string' ? frameType.trim().toLowerCase() : ''
}

function resolveFrameAssetUrl(value?: string | null): string | undefined {
  return resolveSafeAssetUrl(value)
}

export function primeAvatarFrameCustomAssets(params: {
  frameType?: string | null
  customOverlayUrl?: string | null
  posterOverlayUrl?: string | null
}) {
  const frameKey = normalizeCustomFrameKey(params.frameType)
  if (!frameKey || FRAME_TYPES.has(frameKey as FrameType)) return

  const normalizedLiveUrl = resolveFrameAssetUrl(params.customOverlayUrl) || null
  const normalizedPosterUrl = resolveFrameAssetUrl(params.posterOverlayUrl) || null
  if (!normalizedLiveUrl && !normalizedPosterUrl) return

  if (normalizedLiveUrl) {
    customFrameLiveCache.set(frameKey, normalizedLiveUrl)
  }
  if (normalizedPosterUrl) {
    customFramePosterCache.set(frameKey, normalizedPosterUrl)
  }
}

export function useAvatarFrameResolvedAssets({
  frameType,
  customOverlayUrl,
  posterOverlayUrl,
  disableStoreLookup = false,
  hoverPlayback,
  hoverActive,
  isHovered,
  isVisible,
}: {
  frameType: FrameType | string
  customOverlayUrl?: string
  posterOverlayUrl?: string
  disableStoreLookup?: boolean
  hoverPlayback: 'auto' | 'always' | 'never'
  hoverActive?: boolean
  isHovered: boolean
  isVisible: boolean
}) {
  const [resolvedCustomUrl, setResolvedCustomUrl] = useState<string | undefined>(undefined)
  const [resolvedPosterUrl, setResolvedPosterUrl] = useState<string | undefined>(undefined)
  const [resolvedBuiltInFrameUrl, setResolvedBuiltInFrameUrl] = useState<string | null>(null)
  const [resolvedBuiltInIdleFrameUrl, setResolvedBuiltInIdleFrameUrl] = useState<string | null>(null)
  const providedCustomOverlayUrl = resolveFrameAssetUrl(customOverlayUrl)
  const providedPosterOverlayUrl = resolveFrameAssetUrl(posterOverlayUrl)

  useEffect(() => {
    if (providedCustomOverlayUrl || resolvedCustomUrl) {
      setResolvedBuiltInFrameUrl(null)
      return
    }

    const loaderKey = frameType as LazyFrameAsset
    const loader = FRAME_ASSET_LOADERS[loaderKey]
    const idleLoader = FRAME_IDLE_ASSET_LOADERS[loaderKey]
    const shouldUseIdleOnly = hoverPlayback === 'never'
    const shouldDeferLiveOverlayResolution = hoverPlayback === 'auto'
      && Boolean(idleLoader)
      && hoverActive !== true
    if (!loader) {
      setResolvedBuiltInFrameUrl(null)
      return
    }
    if (shouldUseIdleOnly || shouldDeferLiveOverlayResolution) {
      setResolvedBuiltInFrameUrl(null)
      return
    }

    const cachedUrl = builtInFrameUrlCache.get(loaderKey)
    if (cachedUrl) {
      setResolvedBuiltInFrameUrl(cachedUrl)
      return
    }

    if (!isVisible) return

    let cancelled = false
    void (async () => {
      try {
        let inFlight = builtInFrameInFlight.get(loaderKey)
        if (!inFlight) {
          inFlight = loader()
            .then((module) => {
              builtInFrameUrlCache.set(loaderKey, module.default)
              return module.default
            })
            .catch(() => null)
            .finally(() => {
              builtInFrameInFlight.delete(loaderKey)
            })
          builtInFrameInFlight.set(loaderKey, inFlight)
        }

        const resolvedUrl = await inFlight
        if (cancelled) return
        setResolvedBuiltInFrameUrl(resolvedUrl)
      } catch {
        if (!cancelled) {
          setResolvedBuiltInFrameUrl(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [providedCustomOverlayUrl, frameType, hoverActive, hoverPlayback, isVisible, resolvedCustomUrl])

  useEffect(() => {
    const loaderKey = frameType as LazyFrameAsset
    const idleLoader = FRAME_IDLE_ASSET_LOADERS[loaderKey]
    const shouldUseBuiltInIdleFallback = Boolean(idleLoader)
      && !providedPosterOverlayUrl
      && !resolvedPosterUrl

    if ((providedCustomOverlayUrl || resolvedCustomUrl) && !shouldUseBuiltInIdleFallback) {
      setResolvedBuiltInIdleFrameUrl(null)
      return
    }

    if (!idleLoader) {
      setResolvedBuiltInIdleFrameUrl(null)
      return
    }

    const cachedUrl = builtInIdleFrameUrlCache.get(loaderKey)
    if (cachedUrl) {
      setResolvedBuiltInIdleFrameUrl(cachedUrl)
      return
    }

    if (!isVisible) return

    let cancelled = false
    void (async () => {
      try {
        let inFlight = builtInIdleFrameInFlight.get(loaderKey)
        if (!inFlight) {
          inFlight = idleLoader()
            .then((module) => {
              builtInIdleFrameUrlCache.set(loaderKey, module.default)
              return module.default
            })
            .catch(() => null)
            .finally(() => {
              builtInIdleFrameInFlight.delete(loaderKey)
            })
          builtInIdleFrameInFlight.set(loaderKey, inFlight)
        }

        const resolvedUrl = await inFlight
        if (cancelled) return
        setResolvedBuiltInIdleFrameUrl(resolvedUrl)
      } catch {
        if (!cancelled) {
          setResolvedBuiltInIdleFrameUrl(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [providedCustomOverlayUrl, frameType, isVisible, providedPosterOverlayUrl, resolvedCustomUrl, resolvedPosterUrl])

  useEffect(() => {
    primeAvatarFrameCustomAssets({
      frameType,
      customOverlayUrl: providedCustomOverlayUrl,
      posterOverlayUrl: providedPosterOverlayUrl,
    })
  }, [providedCustomOverlayUrl, frameType, providedPosterOverlayUrl])

  useEffect(() => {
    if (providedCustomOverlayUrl || providedPosterOverlayUrl) {
      setResolvedCustomUrl(undefined)
      setResolvedPosterUrl(undefined)
      return
    }

    const frameKey = frameType as string
    if (FRAME_TYPES.has(frameType as FrameType)) {
      setResolvedCustomUrl(undefined)
      setResolvedPosterUrl(undefined)
      return
    }

    if (disableStoreLookup) {
      setResolvedCustomUrl(undefined)
      setResolvedPosterUrl(undefined)
      return
    }

    if (customFrameLiveCache.has(frameKey) || customFramePosterCache.has(frameKey)) {
      const cachedLive = customFrameLiveCache.get(frameKey)
      const cachedPoster = customFramePosterCache.get(frameKey)
      setResolvedCustomUrl(cachedLive || undefined)
      setResolvedPosterUrl(cachedPoster || undefined)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        let inFlight = customFrameAssetInFlight.get(frameKey)
        if (!inFlight) {
          inFlight = (async () => {
            try {
              const rows = await loadStoreItemsLiteByIdentifiers([frameKey])
              const data = rows.get(toStoreItemLiteTypeIdentifierKey('frame', frameKey))

              return {
                liveUrl: resolveSafeAssetUrl(data?.custom_asset_url) || null,
                posterUrl: resolveSafeAssetUrl(data?.poster_asset_url) || null,
              }
            } finally {
              customFrameAssetInFlight.delete(frameKey)
            }
          })()
          customFrameAssetInFlight.set(frameKey, inFlight)
        }

        const { liveUrl, posterUrl } = await inFlight

        if (cancelled) return
        customFrameLiveCache.set(frameKey, liveUrl)
        customFramePosterCache.set(frameKey, posterUrl)
        setResolvedCustomUrl(liveUrl || undefined)
        setResolvedPosterUrl(posterUrl || undefined)
      } catch {
        customFrameAssetInFlight.delete(frameKey)
        customFrameLiveCache.set(frameKey, null)
        customFramePosterCache.set(frameKey, null)
        setResolvedCustomUrl(undefined)
        setResolvedPosterUrl(undefined)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [frameType, providedCustomOverlayUrl, disableStoreLookup, providedPosterOverlayUrl])

  const liveFrameImage = providedCustomOverlayUrl ?? resolvedCustomUrl ?? resolvedBuiltInFrameUrl
  const derivedPosterUrl = useAvatarFrameIdleOverlay(
    !providedPosterOverlayUrl && !resolvedBuiltInIdleFrameUrl ? liveFrameImage || undefined : undefined,
  )
  const allowLiveFrameAsIdleFallback = hoverPlayback !== 'never'
  // On no-hover, cost-sensitive surfaces, if there is no poster we prefer hiding the frame
  // rather than downloading a heavy live overlay.
  const idleFrameImage = providedPosterOverlayUrl
    ?? resolvedPosterUrl
    ?? resolvedBuiltInIdleFrameUrl
    ?? derivedPosterUrl
    ?? (allowLiveFrameAsIdleFallback ? liveFrameImage : undefined)
  const supportsHoverPlayback = hoverPlayback !== 'never'
    && Boolean(liveFrameImage)
    && Boolean(idleFrameImage)
    && liveFrameImage !== idleFrameImage
  const shouldRevealLiveFrame = hoverPlayback === 'always'
    ? Boolean(liveFrameImage)
    : hoverPlayback === 'never'
      ? false
      : supportsHoverPlayback
        ? (hoverActive ?? isHovered)
        : Boolean(liveFrameImage)

  return {
    hasParticleFrame: frameType === 'christmas' || frameType === 'halloween',
    frameImage: shouldRevealLiveFrame ? liveFrameImage : (idleFrameImage ?? liveFrameImage),
    idleFrameImage,
    liveFrameImage,
    supportsHoverPlayback,
  }
}
