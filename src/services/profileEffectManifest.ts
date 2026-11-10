import type {
  ProfileEffectLayerBlendMode,
  ProfileEffectManifest,
  ProfileEffectTimelineBlock,
  ProfileEffectTimelineBlockMode,
  ProfileEffectTimelineLayer,
  StoreProfileEffectAssets,
  StoreProfileEffectMediaMetaEntry,
} from '@/data/storeProducts'

const DEFAULT_LAYER_DURATION_MS = 1_200
const DEFAULT_SKELETON_SCENE = 'profile-hover-v1'
const VALID_BLOCK_MODES = new Set<ProfileEffectTimelineBlockMode>(['once', 'loop'])
const VALID_BLEND_MODES = new Set<ProfileEffectLayerBlendMode>([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'lighten',
  'darken',
  'color-dodge',
  'plus-lighter',
])

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumber(value: unknown, fallback: number, options: { min?: number; max?: number } = {}) {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  const min = options.min ?? Number.NEGATIVE_INFINITY
  const max = options.max ?? Number.POSITIVE_INFINITY
  return Math.min(max, Math.max(min, numberValue))
}

function normalizeBlockMode(value: unknown): ProfileEffectTimelineBlockMode {
  return VALID_BLOCK_MODES.has(value as ProfileEffectTimelineBlockMode) ? value as ProfileEffectTimelineBlockMode : 'once'
}

function normalizeBlendMode(value: unknown): ProfileEffectLayerBlendMode {
  return VALID_BLEND_MODES.has(value as ProfileEffectLayerBlendMode) ? value as ProfileEffectLayerBlendMode : 'normal'
}

function normalizeLayer(rawLayer: unknown, index: number): ProfileEffectTimelineLayer | null {
  if (!rawLayer || typeof rawLayer !== 'object' || Array.isArray(rawLayer)) return null

  const layer = rawLayer as Record<string, unknown>
  const assetUrl = normalizeString(layer.assetUrl)
  if (!assetUrl) return null

  const id = normalizeString(layer.id) || `layer-${index + 1}`
  const label = normalizeString(layer.label)
  const durationValue = layer.durationMs
  const durationMs = durationValue === null || durationValue === undefined
    ? null
    : normalizeNumber(durationValue, DEFAULT_LAYER_DURATION_MS, { min: 20, max: 120_000 })

  return {
    id,
    label: label || undefined,
    assetUrl,
    startMs: Math.round(normalizeNumber(layer.startMs, 0, { min: 0, max: 120_000 })),
    durationMs,
    zIndex: Math.round(normalizeNumber(layer.zIndex, 10 + index, { min: 0, max: 999 })),
    opacity: normalizeNumber(layer.opacity, 1, { min: 0, max: 1 }),
    blendMode: normalizeBlendMode(layer.blendMode),
  }
}

function normalizeBlock(rawBlock: unknown, index: number): ProfileEffectTimelineBlock | null {
  if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null

  const block = rawBlock as Record<string, unknown>
  const layers = Array.isArray(block.layers)
    ? block.layers.map(normalizeLayer).filter((layer): layer is ProfileEffectTimelineLayer => Boolean(layer))
    : []
  if (layers.length === 0) return null

  const id = normalizeString(block.id) || `block-${index + 1}`
  const label = normalizeString(block.label) || (index === 0 ? 'Giris' : `Sekans ${index + 1}`)

  return {
    id,
    label,
    mode: normalizeBlockMode(block.mode),
    layers,
  }
}

export function sanitizeProfileEffectManifest(input?: unknown): ProfileEffectManifest | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined

  const rawManifest = input as Record<string, unknown>
  const timeline = Array.isArray(rawManifest.timeline)
    ? rawManifest.timeline.map(normalizeBlock).filter((block): block is ProfileEffectTimelineBlock => Boolean(block))
    : []

  if (timeline.length === 0) return undefined

  const skeletonScene = normalizeString(rawManifest.skeletonScene) || DEFAULT_SKELETON_SCENE

  return {
    version: 1,
    skeletonScene,
    timeline,
  }
}

export function getProfileEffectLayerDurationMs(layer: ProfileEffectTimelineLayer) {
  return typeof layer.durationMs === 'number' && layer.durationMs > 0 ? layer.durationMs : DEFAULT_LAYER_DURATION_MS
}

export function getProfileEffectBlockDurationMs(block: ProfileEffectTimelineBlock) {
  return Math.max(
    DEFAULT_LAYER_DURATION_MS,
    ...block.layers.map((layer) => layer.startMs + getProfileEffectLayerDurationMs(layer)),
  )
}

function buildLayerFromAsset(input: {
  id: string
  label: string
  assetUrl?: string
  meta?: StoreProfileEffectMediaMetaEntry
  zIndex: number
  blendMode?: ProfileEffectLayerBlendMode
}): ProfileEffectTimelineLayer | null {
  if (!input.assetUrl) return null
  return {
    id: input.id,
    label: input.label,
    assetUrl: input.assetUrl,
    startMs: 0,
    durationMs: input.meta?.durationMs ?? null,
    zIndex: input.zIndex,
    opacity: 1,
    blendMode: input.blendMode ?? 'normal',
  }
}

export function buildLegacyProfileEffectManifest(assets?: StoreProfileEffectAssets | null): ProfileEffectManifest | undefined {
  if (!assets) return undefined

  const introLayers = [
    buildLayerFromAsset({
      id: 'legacy-hover-intro',
      label: 'Hover giris',
      assetUrl: assets.hoverIntroAssetUrl,
      meta: assets.mediaMeta?.hoverIntro,
      zIndex: 20,
    }),
  ].filter((layer): layer is ProfileEffectTimelineLayer => Boolean(layer))

  const loopLayers = [
    buildLayerFromAsset({
      id: 'legacy-hover-loop',
      label: 'Hover loop',
      assetUrl: assets.hoverLoopAssetUrl || assets.profileLoopAssetUrl || assets.cardLoopAssetUrl,
      meta: assets.mediaMeta?.hoverLoop || assets.mediaMeta?.profileLoop || assets.mediaMeta?.cardLoop,
      zIndex: 20,
      blendMode: 'screen',
    }),
  ].filter((layer): layer is ProfileEffectTimelineLayer => Boolean(layer))

  const developmentLayers = [
    buildLayerFromAsset({
      id: 'legacy-profile-development',
      label: 'Gelisme',
      assetUrl: assets.profileIntroAssetUrl,
      meta: assets.mediaMeta?.profileIntro,
      zIndex: 20,
    }),
  ].filter((layer): layer is ProfileEffectTimelineLayer => Boolean(layer))

  const timeline: ProfileEffectTimelineBlock[] = []
  if (introLayers.length > 0) {
    timeline.push({
      id: 'legacy-intro',
      label: 'Giris',
      mode: 'once',
      layers: introLayers,
    })
  }
  if (developmentLayers.length > 0) {
    timeline.push({
      id: 'legacy-development',
      label: 'Gelisme',
      mode: 'once',
      layers: developmentLayers,
    })
  }
  if (loopLayers.length > 0) {
    timeline.push({
      id: 'legacy-loop',
      label: 'Loop',
      mode: 'loop',
      layers: loopLayers,
    })
  }

  if (timeline.length === 0) return undefined

  return {
    version: 1,
    skeletonScene: DEFAULT_SKELETON_SCENE,
    timeline,
  }
}

export function resolveProfileEffectManifest(assets?: StoreProfileEffectAssets | null): ProfileEffectManifest | undefined {
  return sanitizeProfileEffectManifest(assets?.effectManifest) || buildLegacyProfileEffectManifest(assets)
}

/**
 * Shop Control effect manifest: an optional intro that plays once + an infinite loop (Discord
 * style). Same shape as the old effect tool produced; one layer per block.
 */
export function buildSingleLayerEffectManifest(input: {
  assetUrl: string
  label: string
  blendMode: ProfileEffectLayerBlendMode
  durationMs: number | null | undefined
  intro?: { assetUrl: string, durationMs: number | null | undefined } | null
}): ProfileEffectManifest {
  const stamp = Date.now().toString(36)
  const layer = (id: string, assetUrl: string, durationMs: number | null | undefined): ProfileEffectTimelineLayer => ({
    id: `${id}-${stamp}`,
    label: input.label,
    assetUrl,
    startMs: 0,
    durationMs: durationMs ?? null,
    zIndex: 21,
    opacity: 1,
    blendMode: input.blendMode,
  })
  const timeline: ProfileEffectTimelineBlock[] = []
  if (input.intro) {
    timeline.push({ id: 'intro', label: 'Giris', mode: 'once', layers: [layer('intro', input.intro.assetUrl, input.intro.durationMs)] })
  }
  timeline.push({ id: 'loop', label: 'Loop', mode: 'loop', layers: [layer('loop', input.assetUrl, input.durationMs)] })
  return { version: 1, skeletonScene: DEFAULT_SKELETON_SCENE, timeline }
}
