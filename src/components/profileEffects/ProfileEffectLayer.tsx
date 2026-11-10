import { useEffect, useMemo, useRef, useState } from 'react'

import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { useProfileEffectPlaybackStage } from '@/hooks/useProfileEffectPlaybackStage'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { resolveProfileEffectSurfaceMedia, type ProfileEffectMediaSurface } from '@/services/profileEffectAssetResolver'
import { resolveProfileEffectManifest } from '@/services/profileEffectManifest'
import { ProfileEffectManifestRenderer } from './ProfileEffectManifestRenderer'

export type ProfileEffectSurface = Exclude<ProfileEffectMediaSurface, 'card'>

export interface ProfileEffectLayerProps {
  assets?: StoreProfileEffectAssets | null
  surface: ProfileEffectSurface
  active?: boolean
  className?: string
  posterClassName?: string
  mediaClassName?: string
}

export function ProfileEffectLayer({
  assets,
  surface,
  active = true,
  className,
  posterClassName,
  mediaClassName,
}: ProfileEffectLayerProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isIntersecting, setIsIntersecting] = useState(surface === 'hover')
  const [isPageVisible, setIsPageVisible] = useState(typeof document === 'undefined' ? true : document.visibilityState === 'visible')
  const [mediaReady, setMediaReady] = useState(false)

  const resolvedMedia = useMemo(() => resolveProfileEffectSurfaceMedia(assets, surface), [assets, surface])
  const manifest = useMemo(() => resolveProfileEffectManifest(assets), [assets])
  const canAnimate = !prefersReducedMotion
    && active
    && isPageVisible
    && (surface === 'hover' || isIntersecting)
  const {
    stage: phase,
    instanceKey: mediaKey,
    markIntroPlaybackReady,
    handleIntroPlaybackComplete,
    handleIntroPlaybackError,
  } = useProfileEffectPlaybackStage({
    active: Boolean(assets) && canAnimate,
    introUrl: resolvedMedia.introUrl,
    introType: resolvedMedia.introType,
    introKind: resolvedMedia.introMeta?.kind ?? null,
    introDurationMs: resolvedMedia.introMeta?.durationMs ?? null,
    loopUrl: resolvedMedia.loopUrl,
  })

  useEffect(() => {
    if (surface === 'hover' || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setIsIntersecting(true)
      return undefined
    }

    const node = containerRef.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        setIsIntersecting(entries.some((entry) => entry.isIntersecting))
      },
      { threshold: 0.32 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [surface])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const handleVisibilityChange = () => setIsPageVisible(document.visibilityState === 'visible')
    handleVisibilityChange()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    setMediaReady(false)
  }, [assets, canAnimate, mediaKey, phase, resolvedMedia.introUrl, resolvedMedia.loopUrl])

  if (!assets) return null

  if (manifest) {
    return (
      <div ref={containerRef} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
        <ProfileEffectManifestRenderer
          manifest={manifest}
          active={canAnimate}
          layerClassName={mediaClassName}
        />
      </div>
    )
  }

  const currentMediaUrl = phase === 'intro'
    ? resolvedMedia.introUrl
    : phase === 'intro-exit'
    ? resolvedMedia.introUrl
    : phase === 'loop'
      ? resolvedMedia.loopUrl
      : resolvedMedia.assetUrl
  const currentMediaType = phase === 'intro'
    ? resolvedMedia.introType
    : phase === 'intro-exit'
    ? resolvedMedia.introType
    : phase === 'loop'
      ? resolvedMedia.loopType
      : resolvedMedia.assetType

  const shouldRenderAssetBase = Boolean(resolvedMedia.assetUrl)
    && (phase === 'asset' || phase === 'intro-exit' || !mediaReady || resolvedMedia.assetUrl !== currentMediaUrl)

  return (
    <div ref={containerRef} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {shouldRenderAssetBase ? (
        <img
          loading='lazy'
          decoding='async'
          src={resolvedMedia.assetUrl}
          alt=''
          className={cn('absolute inset-0 h-full w-full object-cover', posterClassName)}
        />
      ) : null}

      {currentMediaUrl && currentMediaType ? (
        currentMediaType === 'video' ? (
          <video
            key={`${surface}-${phase}-${mediaKey}-${currentMediaUrl}`}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
              phase === 'intro-exit' ? 'opacity-0' : phase === 'asset' || mediaReady ? 'opacity-100' : 'opacity-0',
              mediaClassName,
            )}
            src={currentMediaUrl}
            autoPlay={phase !== 'asset' ? canAnimate : false}
            loop={phase === 'loop' || phase === 'asset'}
            muted
            playsInline
            preload='metadata'
            onCanPlay={() => {
              setMediaReady(true)
              if (phase === 'intro') {
                markIntroPlaybackReady()
              }
            }}
            onEnded={() => {
              if (phase !== 'intro') return
              setMediaReady(false)
              handleIntroPlaybackComplete()
            }}
            onError={() => {
              if (phase !== 'intro') return
              setMediaReady(false)
              handleIntroPlaybackError()
            }}
          />
        ) : (
          <img
            key={`${surface}-${phase}-${mediaKey}-${currentMediaUrl}`}
            loading='lazy'
            decoding='async'
            src={currentMediaUrl}
            alt=''
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
              phase === 'intro-exit' ? 'opacity-0' : phase === 'asset' || mediaReady ? 'opacity-100' : 'opacity-0',
              mediaClassName,
            )}
            onLoad={() => {
              setMediaReady(true)
              if (phase === 'intro') {
                markIntroPlaybackReady()
              }
            }}
          />
        )
      ) : null}
    </div>
  )
}

export default ProfileEffectLayer
