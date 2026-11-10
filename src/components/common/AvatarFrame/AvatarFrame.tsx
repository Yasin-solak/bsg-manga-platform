import { useDesktopAppearance } from '@/contexts/DesktopAppearanceContext'
import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'

import './AvatarFrame.css'

import { animateAvatarFrameScene, initAvatarFrameScene, type SceneParticle, type SnowPile } from './avatarFrameScene'
import { type AvatarFrameProps } from './avatarFrameConstants'
import { useAvatarFrameResolvedAssets } from './useAvatarFrameResolvedAssets'
import { txa } from '@/i18n/activeLocale'

function resolveAvatarImageSrc(src: string | null | undefined, alt: string) {
  const normalizedSrc = typeof src === 'string' ? src.trim() : ''
  if (normalizedSrc) return normalizedSrc
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(alt || 'avatar')}`
}

function AvatarFrame({
  src,
  alt = txa('Avatar'),
  frameType,
  size = 100,
  animated = true,
  customOverlayUrl,
  posterOverlayUrl,
  disableStoreLookup = false,
  hoverPlayback: requestedPlayback = 'auto',
  hoverActive,
  hoverDelayMs = 0,
}: AvatarFrameProps) {
  const { framesEnabled } = useDesktopAppearance()
  const hoverPlayback = framesEnabled ? requestedPlayback : 'never'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const hoverDelayTimeoutRef = useRef<number | null>(null)
  const particlesRef = useRef<SceneParticle[]>([])
  const snowPilesRef = useRef<SnowPile[]>([])

  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isHoverPlaybackActive, setIsHoverPlaybackActive] = useState(false)

  const requestedHoverPlayback = hoverActive ?? isHovered

  useEffect(() => {
    if (hoverDelayTimeoutRef.current !== null) {
      window.clearTimeout(hoverDelayTimeoutRef.current)
      hoverDelayTimeoutRef.current = null
    }

    if (hoverPlayback !== 'auto') {
      setIsHoverPlaybackActive(false)
      return
    }

    if (!requestedHoverPlayback) {
      setIsHoverPlaybackActive(false)
      return
    }

    if (hoverDelayMs <= 0) {
      setIsHoverPlaybackActive(true)
      return
    }

    hoverDelayTimeoutRef.current = window.setTimeout(() => {
      setIsHoverPlaybackActive(true)
      hoverDelayTimeoutRef.current = null
    }, hoverDelayMs)

    return () => {
      if (hoverDelayTimeoutRef.current !== null) {
        window.clearTimeout(hoverDelayTimeoutRef.current)
        hoverDelayTimeoutRef.current = null
      }
    }
  }, [hoverDelayMs, hoverPlayback, requestedHoverPlayback])

  const effectiveHoverPlaybackActive = hoverPlayback === 'always'
    ? true
    : hoverPlayback === 'never'
      ? false
      : isHoverPlaybackActive

  const { hasParticleFrame, frameImage } = useAvatarFrameResolvedAssets({
    frameType,
    customOverlayUrl,
    posterOverlayUrl,
    disableStoreLookup,
    hoverPlayback,
    hoverActive: effectiveHoverPlaybackActive,
    isHovered,
    isVisible,
  })

  const shouldAnimateParticleFrame = animated
    && isVisible
    && hasParticleFrame
    && (
      hoverPlayback === 'always'
      || (hoverPlayback !== 'never' && effectiveHoverPlaybackActive)
    )
  const shouldPauseFrameMotion = hoverPlayback === 'never' || (hoverPlayback === 'auto' && !effectiveHoverPlaybackActive)
  const avatarImageSrc = resolveAvatarImageSrc(src, alt)

  const animate = useCallback((time: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    snowPilesRef.current = animateAvatarFrameScene({
      canvas,
      frameType,
      particles: particlesRef.current,
      snowPiles: snowPilesRef.current,
      time,
    })

    if (shouldAnimateParticleFrame) {
      animationRef.current = requestAnimationFrame(animate)
    }
  }, [frameType, shouldAnimateParticleFrame])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1, rootMargin: '200px 0px' },
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const frameSize = size * 1.5
    canvas.width = frameSize
    canvas.height = frameSize
    particlesRef.current = initAvatarFrameScene(frameType, frameSize, frameSize)
    snowPilesRef.current = []

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [frameType, size])

  useEffect(() => {
    if (shouldAnimateParticleFrame) {
      animationRef.current = requestAnimationFrame(animate)
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [animate, shouldAnimateParticleFrame])

  const blockAssetContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const blockAssetDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      ref={containerRef}
      className={`avatar-frame avatar-frame--${frameType}${shouldPauseFrameMotion ? ' avatar-frame--motion-paused' : ''}`}
      data-protect-assets='true'
      style={{ width: size * 1.5, height: size * 1.5 }}
      onContextMenu={blockAssetContextMenu}
      onDragStart={blockAssetDrag}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {hasParticleFrame && !customOverlayUrl && animated ? (
        <canvas ref={canvasRef} className='avatar-frame__particles' />
      ) : null}

      <img
        loading='lazy'
        decoding='async'
        src={avatarImageSrc}
        alt={alt}
        data-protect-assets='true'
        className='avatar-frame__image'
        style={{ width: size, height: size }}
        draggable={false}
        onContextMenu={blockAssetContextMenu}
        onDragStart={blockAssetDrag}
      />

      {frameImage ? (
        <img
          loading='lazy'
          decoding='async'
          src={frameImage}
          alt={customOverlayUrl ? txa('Özel çerçeve') : `${frameType} frame`}
          data-protect-assets='true'
          className='avatar-frame__border'
          draggable={false}
          onContextMenu={blockAssetContextMenu}
          onDragStart={blockAssetDrag}
        />
      ) : null}
    </div>
  )
}

export default AvatarFrame
