import type {
  StoreProfileEffectAssets,
  StoreProfileEffectMediaMetaEntry,
  StoreProfileEffectMediaSlot,
} from '@/data/storeProducts'
import { resolveAssetMediaType, resolveSafeAssetUrl } from '@/services/assetUrlService'
import { resolveProfileEffectManifest } from '@/services/profileEffectManifest'

export type ProfileEffectMediaSurface = 'card' | 'profile' | 'hover'

export interface ResolvedProfileEffectSurfaceMedia {
  assetUrl: string
  assetType: 'image' | 'video' | null
  assetMeta?: StoreProfileEffectMediaMetaEntry
  introUrl: string
  introType: 'image' | 'video' | null
  introMeta?: StoreProfileEffectMediaMetaEntry
  loopUrl: string
  loopType: 'image' | 'video' | null
  loopMeta?: StoreProfileEffectMediaMetaEntry
}

function resolveMediaUrl(value?: string | null) {
  return resolveSafeAssetUrl(value) || ''
}

function resolveMediaType(value?: string | null) {
  return resolveAssetMediaType(value) || null
}

function coalesceMediaCandidate(
  ...candidates: Array<{ url?: string | null; meta?: StoreProfileEffectMediaMetaEntry; slot?: StoreProfileEffectMediaSlot }>
) {
  const resolved = candidates.find((candidate) => typeof candidate.url === 'string' && candidate.url.trim())
  return {
    url: resolved?.url?.trim() || '',
    meta: resolved?.meta,
    slot: resolved?.slot,
  }
}

export function resolveProfileEffectSurfaceMedia(
  assets?: StoreProfileEffectAssets | null,
  surface: ProfileEffectMediaSurface = 'profile',
  options: { legacyLoopUrl?: string | null } = {},
): ResolvedProfileEffectSurfaceMedia {
  const posterUrl = resolveMediaUrl(assets?.posterAssetUrl)
  const cardIntroUrl = resolveMediaUrl(assets?.cardIntroAssetUrl)
  const cardLoopUrl = resolveMediaUrl(assets?.cardLoopAssetUrl)
  const profileAssetUrl = resolveMediaUrl(assets?.profileAssetUrl)
  const profileIntroUrl = resolveMediaUrl(assets?.profileIntroAssetUrl)
  const profileLoopUrl = resolveMediaUrl(assets?.profileLoopAssetUrl)
  const hoverAssetUrl = resolveMediaUrl(assets?.hoverAssetUrl)
  const hoverIntroUrl = resolveMediaUrl(assets?.hoverIntroAssetUrl)
  const hoverLoopUrl = resolveMediaUrl(assets?.hoverLoopAssetUrl)
  const legacyLoopUrl = resolveMediaUrl(options.legacyLoopUrl)
  const mediaMeta = assets?.mediaMeta

  if (surface === 'card') {
    const asset = coalesceMediaCandidate(
      { url: posterUrl, meta: mediaMeta?.cardAsset, slot: 'cardAsset' },
      { url: profileAssetUrl, meta: mediaMeta?.profileAsset, slot: 'profileAsset' },
      { url: hoverAssetUrl, meta: mediaMeta?.hoverAsset, slot: 'hoverAsset' },
      { url: legacyLoopUrl },
    )
    const intro = coalesceMediaCandidate(
      { url: cardIntroUrl, meta: mediaMeta?.cardIntro, slot: 'cardIntro' },
    )
    const loop = coalesceMediaCandidate(
      { url: cardLoopUrl, meta: mediaMeta?.cardLoop, slot: 'cardLoop' },
      { url: hoverLoopUrl, meta: mediaMeta?.hoverLoop, slot: 'hoverLoop' },
      { url: profileLoopUrl, meta: mediaMeta?.profileLoop, slot: 'profileLoop' },
      { url: legacyLoopUrl },
    )
    return {
      assetUrl: asset.url,
      assetType: resolveMediaType(asset.url),
      assetMeta: asset.meta,
      introUrl: intro.url,
      introType: resolveMediaType(intro.url),
      introMeta: intro.meta,
      loopUrl: loop.url,
      loopType: resolveMediaType(loop.url),
      loopMeta: loop.meta,
    }
  }

  if (surface === 'hover') {
    const asset = coalesceMediaCandidate()
    const intro = coalesceMediaCandidate(
      { url: hoverIntroUrl, meta: mediaMeta?.hoverIntro, slot: 'hoverIntro' },
    )
    const loop = coalesceMediaCandidate(
      { url: hoverLoopUrl, meta: mediaMeta?.hoverLoop, slot: 'hoverLoop' },
      { url: profileLoopUrl, meta: mediaMeta?.profileLoop, slot: 'profileLoop' },
      { url: cardLoopUrl, meta: mediaMeta?.cardLoop, slot: 'cardLoop' },
      { url: legacyLoopUrl },
    )
    return {
      assetUrl: asset.url,
      assetType: resolveMediaType(asset.url),
      assetMeta: asset.meta,
      introUrl: intro.url,
      introType: resolveMediaType(intro.url),
      introMeta: intro.meta,
      loopUrl: loop.url,
      loopType: resolveMediaType(loop.url),
      loopMeta: loop.meta,
    }
  }

  const asset = coalesceMediaCandidate()
  const intro = coalesceMediaCandidate(
    { url: profileIntroUrl, meta: mediaMeta?.profileIntro, slot: 'profileIntro' },
  )
  const loop = coalesceMediaCandidate(
    { url: profileLoopUrl, meta: mediaMeta?.profileLoop, slot: 'profileLoop' },
    { url: hoverLoopUrl, meta: mediaMeta?.hoverLoop, slot: 'hoverLoop' },
    { url: cardLoopUrl, meta: mediaMeta?.cardLoop, slot: 'cardLoop' },
    { url: legacyLoopUrl },
  )
  return {
    assetUrl: asset.url,
    assetType: resolveMediaType(asset.url),
    assetMeta: asset.meta,
    introUrl: intro.url,
    introType: resolveMediaType(intro.url),
    introMeta: intro.meta,
    loopUrl: loop.url,
    loopType: resolveMediaType(loop.url),
    loopMeta: loop.meta,
  }
}

export function hasResolvedProfileEffectMedia(
  assets?: StoreProfileEffectAssets | null,
  options?: { legacyLoopUrl?: string | null },
) {
  if (resolveProfileEffectManifest(assets)) return true

  const card = resolveProfileEffectSurfaceMedia(assets, 'card', options)
  const profile = resolveProfileEffectSurfaceMedia(assets, 'profile', options)
  const hover = resolveProfileEffectSurfaceMedia(assets, 'hover', options)

  return Boolean(card.assetUrl || card.loopUrl || profile.assetUrl || profile.loopUrl || hover.assetUrl || hover.loopUrl)
}
