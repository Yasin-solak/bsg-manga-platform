import { normalizeStoreAssetRef, resolveStoreAssetUrl } from '@/services/assetUrlService'
import {
  inferProfileEffectMediaMetaFromAssets,
  sanitizeStoreProfileEffectMediaMeta,
} from '@/services/profileEffectMediaMeta'
import { resolveProfileEffectManifest, sanitizeProfileEffectManifest } from '@/services/profileEffectManifest'
import type {
  StoreProfileEffectAssetRecord,
  StoreProfileEffectAssetRow,
  UpsertStoreProfileEffectAssetsInput,
} from './types'

const PROFILE_EFFECT_PREFIX = 'store-assets://profile-effects/'
const PROFILE_EFFECT_DEMO_PUBLIC_PREFIXES = ['/backgrounds/', '/profile-effects/demo/']

export function isAllowedProfileEffectAssetRef(value: string): boolean {
  if (value.startsWith(PROFILE_EFFECT_PREFIX)) return true
  return PROFILE_EFFECT_DEMO_PUBLIC_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function validateProfileEffectAssetRef(value: string, label: string) {
  if (!value.startsWith('store-assets://')) {
    if (isAllowedProfileEffectAssetRef(value)) return
    throw new Error(`${label} yalniz store-assets bucket veya demo public assetlerinden secilebilir.`)
  }

  if (!value.startsWith(PROFILE_EFFECT_PREFIX)) {
    throw new Error(`${label} profile-effects klasoru altindan secilmelidir.`)
  }
}

export function mapRowToStoreProfileEffectAsset(row: StoreProfileEffectAssetRow): StoreProfileEffectAssetRecord {
  const baseRecord: StoreProfileEffectAssetRecord = {
    itemId: row.item_id,
    posterAssetUrl: resolveStoreAssetUrl(row.poster_asset_url) || row.poster_asset_url,
    modalBackdropAssetUrl: resolveStoreAssetUrl(row.modal_backdrop_asset_url) || row.modal_backdrop_asset_url || undefined,
    cardIntroAssetUrl: resolveStoreAssetUrl(row.card_intro_asset_url) || row.card_intro_asset_url || undefined,
    cardLoopAssetUrl: resolveStoreAssetUrl(row.card_loop_asset_url) || row.card_loop_asset_url,
    profileAssetUrl: resolveStoreAssetUrl(row.profile_asset_url) || row.profile_asset_url,
    profileIntroAssetUrl: resolveStoreAssetUrl(row.profile_intro_asset_url) || row.profile_intro_asset_url || undefined,
    profileLoopAssetUrl: resolveStoreAssetUrl(row.profile_loop_asset_url) || row.profile_loop_asset_url,
    hoverAssetUrl: resolveStoreAssetUrl(row.hover_asset_url) || row.hover_asset_url,
    hoverIntroAssetUrl: resolveStoreAssetUrl(row.hover_intro_asset_url) || row.hover_intro_asset_url || undefined,
    hoverLoopAssetUrl: resolveStoreAssetUrl(row.hover_loop_asset_url) || row.hover_loop_asset_url,
    mediaMeta: undefined,
    effectManifest: sanitizeProfileEffectManifest(row.effect_manifest),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return {
    ...baseRecord,
    mediaMeta: sanitizeStoreProfileEffectMediaMeta(row.media_meta) || inferProfileEffectMediaMetaFromAssets(baseRecord),
  }
}

export function buildStoreProfileEffectAssetPayload(input: UpsertStoreProfileEffectAssetsInput) {
  const posterAssetUrl = normalizeStoreAssetRef(input.posterAssetUrl)
  const modalBackdropAssetUrl = normalizeStoreAssetRef(input.modalBackdropAssetUrl)
  const cardIntroAssetUrl = normalizeStoreAssetRef(input.cardIntroAssetUrl)
  const normalizedEffectManifest = resolveProfileEffectManifest(input)
  const firstManifestLayerAssetUrl = normalizedEffectManifest?.timeline
    .flatMap((block) => block.layers)
    .map((layer) => normalizeStoreAssetRef(layer.assetUrl))
    .find(Boolean)
  const fallbackLoopAssetUrl = normalizeStoreAssetRef(input.hoverLoopAssetUrl)
    || normalizeStoreAssetRef(input.profileLoopAssetUrl)
    || normalizeStoreAssetRef(input.cardLoopAssetUrl)
    || normalizeStoreAssetRef(firstManifestLayerAssetUrl)
    || posterAssetUrl
  const cardLoopAssetUrl = normalizeStoreAssetRef(input.cardLoopAssetUrl) || fallbackLoopAssetUrl
  const profileAssetUrl = normalizeStoreAssetRef(input.profileAssetUrl) || posterAssetUrl
  const profileIntroAssetUrl = normalizeStoreAssetRef(input.profileIntroAssetUrl)
  const profileLoopAssetUrl = normalizeStoreAssetRef(input.profileLoopAssetUrl) || fallbackLoopAssetUrl
  const hoverAssetUrl = normalizeStoreAssetRef(input.hoverAssetUrl) || posterAssetUrl
  const hoverIntroAssetUrl = normalizeStoreAssetRef(input.hoverIntroAssetUrl)
  const hoverLoopAssetUrl = normalizeStoreAssetRef(input.hoverLoopAssetUrl) || fallbackLoopAssetUrl
  const normalizedMediaMeta = sanitizeStoreProfileEffectMediaMeta(input.mediaMeta) || inferProfileEffectMediaMetaFromAssets(input)

  if (
    !posterAssetUrl
    || !normalizedEffectManifest
    || !cardLoopAssetUrl
    || !profileAssetUrl
    || !profileLoopAssetUrl
    || !hoverAssetUrl
    || !hoverLoopAssetUrl
  ) {
    throw new Error('Profil effect paketi eksik. Kapak gorseli ve en az bir sekans katmani zorunludur.')
  }

  validateProfileEffectAssetRef(posterAssetUrl, 'Poster asset')
  if (modalBackdropAssetUrl) validateProfileEffectAssetRef(modalBackdropAssetUrl, 'Modal arka plan asset')
  if (cardIntroAssetUrl) validateProfileEffectAssetRef(cardIntroAssetUrl, 'Kart giris asset')
  validateProfileEffectAssetRef(cardLoopAssetUrl, 'Kart loop asset')
  validateProfileEffectAssetRef(profileAssetUrl, 'Profil asset')
  if (profileIntroAssetUrl) validateProfileEffectAssetRef(profileIntroAssetUrl, 'Profil intro asset')
  validateProfileEffectAssetRef(profileLoopAssetUrl, 'Profil loop asset')
  validateProfileEffectAssetRef(hoverAssetUrl, 'Hover asset')
  if (hoverIntroAssetUrl) validateProfileEffectAssetRef(hoverIntroAssetUrl, 'Hover intro asset')
  validateProfileEffectAssetRef(hoverLoopAssetUrl, 'Hover loop asset')
  normalizedEffectManifest.timeline
    .flatMap((block) => block.layers)
    .forEach((layer) => validateProfileEffectAssetRef(layer.assetUrl, `Manifest katmani ${layer.label || layer.id}`))

  return {
    item_id: input.itemId,
    poster_asset_url: posterAssetUrl,
    modal_backdrop_asset_url: modalBackdropAssetUrl ?? null,
    card_intro_asset_url: cardIntroAssetUrl ?? null,
    card_loop_asset_url: cardLoopAssetUrl,
    profile_asset_url: profileAssetUrl,
    profile_intro_asset_url: profileIntroAssetUrl ?? null,
    profile_loop_asset_url: profileLoopAssetUrl,
    hover_asset_url: hoverAssetUrl,
    hover_intro_asset_url: hoverIntroAssetUrl ?? null,
    hover_loop_asset_url: hoverLoopAssetUrl,
    media_meta: normalizedMediaMeta ?? {},
    effect_manifest: normalizedEffectManifest,
    is_active: input.isActive ?? true,
  }
}
