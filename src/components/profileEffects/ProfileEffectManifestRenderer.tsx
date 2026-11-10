import { useEffect, useMemo, useState } from 'react'

import type { ProfileEffectManifest, ProfileEffectTimelineBlock, ProfileEffectTimelineLayer } from '@/data/storeProducts'
import { getProfileEffectBlockDurationMs, getProfileEffectLayerDurationMs } from '@/services/profileEffectManifest'
import { resolveAssetMediaType, resolveSafeAssetUrl } from '@/services/assetUrlService'
import { cn } from '@/lib/utils'

interface ProfileEffectManifestRendererProps {
  manifest?: ProfileEffectManifest | null
  active?: boolean
  className?: string
  layerClassName?: string
}

interface ProfileEffectTimelineLayerNodeProps {
  block: ProfileEffectTimelineBlock
  layer: ProfileEffectTimelineLayer
  blockIndex: number
  cycleKey: number
  active: boolean
  className?: string
  onReady?: () => void
  /** Next block's layer: preloaded invisibly, ready at transition time. */
  preload?: boolean
}

// A play-once layer hides with a small margin so it does not hide itself and leave an empty frame
// before the renderer's block transition (the transition removes the layer anyway).
const ONCE_LAYER_GRACE_MS = 200

function ProfileEffectTimelineLayerNode({
  block,
  layer,
  blockIndex,
  cycleKey,
  active,
  className,
  onReady,
  preload = false,
}: ProfileEffectTimelineLayerNodeProps) {
  const [visible, setVisible] = useState(layer.startMs <= 0)
  // A play-once layer's hide timer starts when media loads (the intro is not cut on slow networks).
  const [loaded, setLoaded] = useState(false)
  const resolvedAssetUrl = useMemo(() => resolveSafeAssetUrl(layer.assetUrl) || '', [layer.assetUrl])
  const mediaType = resolveAssetMediaType(resolvedAssetUrl)

  useEffect(() => {
    setLoaded(false)
    if (!active) {
      setVisible(false)
      return undefined
    }

    if (layer.startMs <= 0) {
      setVisible(true)
      return undefined
    }

    setVisible(false)
    const timer = window.setTimeout(() => setVisible(true), layer.startMs)
    return () => window.clearTimeout(timer)
  }, [active, block.id, blockIndex, cycleKey, layer])

  useEffect(() => {
    if (!active || !visible || !loaded || preload || block.mode === 'loop') return undefined
    const timer = window.setTimeout(() => setVisible(false), getProfileEffectLayerDurationMs(layer) + ONCE_LAYER_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [active, visible, loaded, preload, block.mode, layer])

  const handleReady = () => {
    setLoaded(true)
    onReady?.()
  }

  if (!active || !visible || !resolvedAssetUrl) return null

  const mediaKey = `${block.id}-${layer.id}-${blockIndex}-${cycleKey}-${resolvedAssetUrl}`
  const style = {
    zIndex: layer.zIndex,
    opacity: preload ? 0 : layer.opacity,
    mixBlendMode: layer.blendMode || 'normal',
  } as const

  if (mediaType === 'video') {
    return (
      <video
        key={mediaKey}
        src={resolvedAssetUrl}
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        style={style}
        autoPlay
        loop={block.mode === 'loop'}
        muted
        playsInline
        preload='metadata'
        onLoadedData={handleReady}
        onError={handleReady}
        aria-hidden
      />
    )
  }

  return (
    <img
      key={mediaKey}
      src={resolvedAssetUrl}
      alt=''
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
      style={style}
      draggable={false}
      loading={block.mode === 'loop' && !preload ? 'lazy' : 'eager'}
      decoding='async'
      onLoad={handleReady}
      onError={handleReady}
      aria-hidden
    />
  )
}

export function ProfileEffectManifestRenderer({
  manifest,
  active = true,
  className,
  layerClassName,
}: ProfileEffectManifestRendererProps) {
  const timeline = manifest?.timeline ?? []
  const [blockIndex, setBlockIndex] = useState(0)
  const [cycleKey, setCycleKey] = useState(0)
  // A play-once (intro) block's duration starts when media loads: if a large APNG / video arrives slowly
  // the intro is not cut halfway into the loop. The timer starts when the first layer loads.
  const [readyKey, setReadyKey] = useState<string | null>(null)

  const currentBlock = timeline[blockIndex] ?? null
  // While the intro (once) plays, the next block loads invisibly.
  const nextBlock = currentBlock?.mode === 'once' ? timeline[blockIndex + 1] ?? null : null
  const currentBlockDurationMs = useMemo(
    () => currentBlock ? getProfileEffectBlockDurationMs(currentBlock) : 0,
    [currentBlock],
  )

  useEffect(() => {
    if (!active || timeline.length === 0) {
      setBlockIndex(0)
      setCycleKey((current) => current + 1)
      return undefined
    }

    setBlockIndex(0)
    setCycleKey((current) => current + 1)
    return undefined
  }, [active, timeline.length, manifest])

  useEffect(() => {
    if (!active || !currentBlock || currentBlockDurationMs <= 0) return undefined
    if (currentBlock.mode === 'loop') return undefined
    if (readyKey !== `${blockIndex}:${cycleKey}`) return undefined

    const timer = window.setTimeout(() => {
      const nextBlockIndex = blockIndex + 1
      if (nextBlockIndex >= timeline.length) return
      // cycleKey does not change: the preloaded next block becomes visible with the same element (no
      // reload / empty frame).
      setBlockIndex(nextBlockIndex)
    }, currentBlockDurationMs)

    return () => window.clearTimeout(timer)
  }, [active, blockIndex, currentBlock, currentBlockDurationMs, timeline.length, cycleKey, readyKey])

  if (!active || !currentBlock) return null

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      data-profile-effect-manifest-scene={manifest?.skeletonScene || 'profile-hover-v1'}
      data-profile-effect-manifest-block={currentBlock.id}
      aria-hidden
    >
      {/* Tek liste: siradaki blogun onceden yuklenen katmani gecis aninda ayni anahtarla bu
          listede kalir, React ogeyi yeniden olusturmaz (yeniden yukleme / bos kare olmaz). */}
      {[
        ...currentBlock.layers.map((layer) => (
          <ProfileEffectTimelineLayerNode
            key={`${currentBlock.id}-${layer.id}-${cycleKey}`}
            block={currentBlock}
            layer={layer}
            blockIndex={blockIndex}
            cycleKey={cycleKey}
            active={active}
            className={layerClassName}
            onReady={() => setReadyKey(`${blockIndex}:${cycleKey}`)}
          />
        )),
        ...(nextBlock ? nextBlock.layers.map((layer) => (
          <ProfileEffectTimelineLayerNode
            key={`${nextBlock.id}-${layer.id}-${cycleKey}`}
            block={nextBlock}
            layer={layer}
            blockIndex={blockIndex + 1}
            cycleKey={cycleKey}
            active={active}
            className={layerClassName}
            preload
          />
        )) : []),
      ]}
    </div>
  )
}

export default ProfileEffectManifestRenderer
