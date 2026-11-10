import type {
  ProfileEffectMediaKind,
  ProfileEffectPlaybackLoopMode,
  StoreProfileEffectAssets,
  StoreProfileEffectMediaMeta,
  StoreProfileEffectMediaMetaEntry,
  StoreProfileEffectMediaSlot,
} from '@/data/storeProducts'
import { resolveAssetMediaType } from '@/services/assetUrlService'
import { normalizeUploadFile } from '@/services/storageService/mediaFileNormalization'

export type ProfileEffectMediaUploadVariant =
  | 'modal-backdrop'
  | 'card-asset'
  | 'card-intro'
  | 'card-loop'
  | 'profile-asset'
  | 'profile-intro'
  | 'profile-loop'
  | 'hover-asset'
  | 'hover-intro'
  | 'hover-loop'

export const PROFILE_EFFECT_MEDIA_SLOT_BY_VARIANT: Record<ProfileEffectMediaUploadVariant, StoreProfileEffectMediaSlot> = {
  'modal-backdrop': 'modalBackdrop',
  'card-asset': 'cardAsset',
  'card-intro': 'cardIntro',
  'card-loop': 'cardLoop',
  'profile-asset': 'profileAsset',
  'profile-intro': 'profileIntro',
  'profile-loop': 'profileLoop',
  'hover-asset': 'hoverAsset',
  'hover-intro': 'hoverIntro',
  'hover-loop': 'hoverLoop',
}

const PROFILE_EFFECT_MEDIA_SLOT_KEYS = Object.values(PROFILE_EFFECT_MEDIA_SLOT_BY_VARIANT)

function inferLoopModeFromSlot(slot: StoreProfileEffectMediaSlot): ProfileEffectPlaybackLoopMode | null {
  if (slot.endsWith('Intro')) return 'once'
  if (slot.endsWith('Loop')) return 'infinite'
  return null
}

function normalizeMediaKind(value: unknown): ProfileEffectMediaKind | null {
  if (value === 'static-image' || value === 'animated-image' || value === 'video') return value
  return null
}

function normalizeLoopMode(value: unknown): ProfileEffectPlaybackLoopMode | null {
  if (value === 'once' || value === 'infinite') return value
  return null
}

function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

function normalizeExtension(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase().replace(/^\./, '')
  return trimmed || null
}

function buildMediaMetaEntry(input: {
  kind: ProfileEffectMediaKind
  mimeType: string
  extension: string
  durationMs?: number | null
  loopMode?: ProfileEffectPlaybackLoopMode | null
}): StoreProfileEffectMediaMetaEntry {
  return {
    kind: input.kind,
    mimeType: input.mimeType,
    extension: input.extension,
    durationMs: typeof input.durationMs === 'number' ? input.durationMs : input.durationMs ?? undefined,
    loopMode: input.loopMode ?? undefined,
  }
}

export function mapProfileEffectVariantToMediaSlot(variant: ProfileEffectMediaUploadVariant): StoreProfileEffectMediaSlot {
  return PROFILE_EFFECT_MEDIA_SLOT_BY_VARIANT[variant]
}

export function sanitizeStoreProfileEffectMediaMeta(meta?: unknown): StoreProfileEffectMediaMeta | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined

  const normalized: StoreProfileEffectMediaMeta = {}

  for (const slot of PROFILE_EFFECT_MEDIA_SLOT_KEYS) {
    const rawEntry = (meta as Record<string, unknown>)[slot]
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue

    const kind = normalizeMediaKind((rawEntry as Record<string, unknown>).kind)
    const mimeType = normalizeMimeType((rawEntry as Record<string, unknown>).mimeType)
    const extension = normalizeExtension((rawEntry as Record<string, unknown>).extension)
    if (!kind || !mimeType || !extension) continue

    normalized[slot] = buildMediaMetaEntry({
      kind,
      mimeType,
      extension,
      durationMs: typeof (rawEntry as Record<string, unknown>).durationMs === 'number'
        ? Number((rawEntry as Record<string, unknown>).durationMs)
        : null,
      loopMode: normalizeLoopMode((rawEntry as Record<string, unknown>).loopMode) ?? inferLoopModeFromSlot(slot),
    })
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function inferMediaKindFromUrl(url?: string | null): ProfileEffectMediaKind | null {
  if (!url) return null
  const mediaType = resolveAssetMediaType(url)
  if (mediaType === 'video') return 'video'

  const normalized = url.trim().toLowerCase()
  if (/\.gif(?:$|[?#])/.test(normalized)) return 'animated-image'
  if (mediaType === 'image') return 'static-image'
  return null
}

function inferMimeTypeFromUrl(url?: string | null): string | null {
  if (!url) return null
  const normalized = url.trim().toLowerCase()
  if (/\.gif(?:$|[?#])/.test(normalized)) return 'image/gif'
  if (/\.png(?:$|[?#])/.test(normalized)) return 'image/png'
  if (/\.webp(?:$|[?#])/.test(normalized)) return 'image/webp'
  if (/\.jpe?g(?:$|[?#])/.test(normalized)) return 'image/jpeg'
  if (/\.webm(?:$|[?#])/.test(normalized)) return 'video/webm'
  if (/\.mp4(?:$|[?#])/.test(normalized)) return 'video/mp4'
  return null
}

function inferExtensionFromUrl(url?: string | null): string | null {
  const mimeType = inferMimeTypeFromUrl(url)
  if (!mimeType) return null
  switch (mimeType) {
    case 'image/gif':
      return 'gif'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/jpeg':
      return 'jpg'
    case 'video/webm':
      return 'webm'
    case 'video/mp4':
      return 'mp4'
    default:
      return null
  }
}

export function inferProfileEffectMediaMetaFromAssets(assets?: Partial<StoreProfileEffectAssets> | null): StoreProfileEffectMediaMeta | undefined {
  if (!assets) return undefined

  const slotToUrl: Array<[StoreProfileEffectMediaSlot, string | undefined]> = [
    ['modalBackdrop', assets.modalBackdropAssetUrl],
    ['cardAsset', assets.posterAssetUrl],
    ['cardIntro', assets.cardIntroAssetUrl],
    ['cardLoop', assets.cardLoopAssetUrl],
    ['profileAsset', assets.profileAssetUrl],
    ['profileIntro', assets.profileIntroAssetUrl],
    ['profileLoop', assets.profileLoopAssetUrl],
    ['hoverAsset', assets.hoverAssetUrl],
    ['hoverIntro', assets.hoverIntroAssetUrl],
    ['hoverLoop', assets.hoverLoopAssetUrl],
  ]

  const normalized: StoreProfileEffectMediaMeta = {}
  for (const [slot, url] of slotToUrl) {
    const kind = inferMediaKindFromUrl(url)
    const mimeType = inferMimeTypeFromUrl(url)
    const extension = inferExtensionFromUrl(url)
    if (!kind || !mimeType || !extension) continue

    normalized[slot] = buildMediaMetaEntry({
      kind,
      mimeType,
      extension,
      loopMode: inferLoopModeFromSlot(slot),
    })
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export async function inferProfileEffectMediaMetaEntryFromFile(
  file: File,
  variant: ProfileEffectMediaUploadVariant,
): Promise<StoreProfileEffectMediaMetaEntry> {
  const normalized = await normalizeUploadFile(file)
  const slot = mapProfileEffectVariantToMediaSlot(variant)

  return buildMediaMetaEntry({
    kind: normalized.mediaKind === 'unknown' ? 'static-image' : normalized.mediaKind,
    mimeType: normalized.mimeType,
    extension: normalized.extension,
    durationMs: normalized.durationMs,
    loopMode: inferLoopModeFromSlot(slot),
  })
}

export async function buildProfileEffectMediaMetaPatchFromFile(
  file: File,
  variant: ProfileEffectMediaUploadVariant,
): Promise<StoreProfileEffectMediaMeta> {
  const slot = mapProfileEffectVariantToMediaSlot(variant)
  return {
    [slot]: await inferProfileEffectMediaMetaEntryFromFile(file, variant),
  }
}
