import type { FrameType } from '@components/common/AvatarFrame'
import { NAME_TEXT_EFFECT_OPTIONS } from '@/data/nameTextEffects'

export type StoreItemType = 'frame' | 'badge' | 'premium' | 'pattern' | 'background' | 'profile_effect'
export type PublicStoreItemType = 'frame' | 'premium' | 'background' | 'profile_effect'

export type ProfileEffectMediaKind = 'static-image' | 'animated-image' | 'video'
export type ProfileEffectPlaybackLoopMode = 'once' | 'infinite'
export type StoreProfileEffectMediaSlot =
  | 'modalBackdrop'
  | 'cardAsset'
  | 'cardIntro'
  | 'cardLoop'
  | 'profileAsset'
  | 'profileIntro'
  | 'profileLoop'
  | 'hoverAsset'
  | 'hoverIntro'
  | 'hoverLoop'

export interface StoreProfileEffectMediaMetaEntry {
  kind: ProfileEffectMediaKind
  mimeType: string
  extension: string
  durationMs?: number | null
  loopMode?: ProfileEffectPlaybackLoopMode | null
}

export type StoreProfileEffectMediaMeta = Partial<Record<StoreProfileEffectMediaSlot, StoreProfileEffectMediaMetaEntry>>

export type ProfileEffectTimelineBlockMode = 'once' | 'loop'
export type ProfileEffectLayerBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'lighten'
  | 'darken'
  | 'color-dodge'
  | 'plus-lighter'

export interface ProfileEffectTimelineLayer {
  id: string
  label?: string
  assetUrl: string
  startMs: number
  durationMs?: number | null
  zIndex: number
  opacity: number
  blendMode?: ProfileEffectLayerBlendMode
}

export interface ProfileEffectTimelineBlock {
  id: string
  label: string
  mode: ProfileEffectTimelineBlockMode
  layers: ProfileEffectTimelineLayer[]
}

export interface ProfileEffectManifest {
  version: 1
  skeletonScene: 'profile-hover-v1' | (string & {})
  timeline: ProfileEffectTimelineBlock[]
}

export interface StoreProfileEffectAssets {
  posterAssetUrl?: string
  modalBackdropAssetUrl?: string
  cardIntroAssetUrl?: string
  cardLoopAssetUrl?: string
  profileAssetUrl?: string
  profileIntroAssetUrl?: string
  profileLoopAssetUrl?: string
  hoverAssetUrl?: string
  hoverIntroAssetUrl?: string
  hoverLoopAssetUrl?: string
  mediaMeta?: StoreProfileEffectMediaMeta
  effectManifest?: ProfileEffectManifest
  isActive?: boolean
}

export function cloneStoreProfileEffectMediaMeta(meta?: StoreProfileEffectMediaMeta | null): StoreProfileEffectMediaMeta | undefined {
  if (!meta) return undefined

  const cloned: StoreProfileEffectMediaMeta = {}
  for (const [slot, entry] of Object.entries(meta) as Array<[StoreProfileEffectMediaSlot, StoreProfileEffectMediaMetaEntry | undefined]>) {
    if (!entry) continue
    cloned[slot] = {
      kind: entry.kind,
      mimeType: entry.mimeType,
      extension: entry.extension,
      durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : entry.durationMs ?? undefined,
      loopMode: entry.loopMode ?? undefined,
    }
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined
}

export function cloneStoreProfileEffectAssets(assets?: StoreProfileEffectAssets | null): StoreProfileEffectAssets | undefined {
  if (!assets) return undefined

  const cloned: StoreProfileEffectAssets = {}

  if (assets.posterAssetUrl) cloned.posterAssetUrl = assets.posterAssetUrl
  if (assets.modalBackdropAssetUrl) cloned.modalBackdropAssetUrl = assets.modalBackdropAssetUrl
  if (assets.cardIntroAssetUrl) cloned.cardIntroAssetUrl = assets.cardIntroAssetUrl
  if (assets.cardLoopAssetUrl) cloned.cardLoopAssetUrl = assets.cardLoopAssetUrl
  if (assets.profileAssetUrl) cloned.profileAssetUrl = assets.profileAssetUrl
  if (assets.profileIntroAssetUrl) cloned.profileIntroAssetUrl = assets.profileIntroAssetUrl
  if (assets.profileLoopAssetUrl) cloned.profileLoopAssetUrl = assets.profileLoopAssetUrl
  if (assets.hoverAssetUrl) cloned.hoverAssetUrl = assets.hoverAssetUrl
  if (assets.hoverIntroAssetUrl) cloned.hoverIntroAssetUrl = assets.hoverIntroAssetUrl
  if (assets.hoverLoopAssetUrl) cloned.hoverLoopAssetUrl = assets.hoverLoopAssetUrl
  if (assets.mediaMeta) cloned.mediaMeta = cloneStoreProfileEffectMediaMeta(assets.mediaMeta)
  if (assets.effectManifest) cloned.effectManifest = JSON.parse(JSON.stringify(assets.effectManifest)) as ProfileEffectManifest
  if (typeof assets.isActive === 'boolean') cloned.isActive = assets.isActive

  return cloned
}

export interface StoreItem {
  id: string
  identifier?: string
  name: string
  description: string
  price: number
  originalPrice?: number
  currency: 'TL' | 'Coin'
  type: StoreItemType
  icon?: string
  color?: string
  frameType?: FrameType | (string & {})
  image?: string
  customAssetUrl?: string
  posterAssetUrl?: string
  themeName?: string
  profileEffectAssets?: StoreProfileEffectAssets
  isActive?: boolean
  isNew?: boolean
  isPopular?: boolean
  isOwned?: boolean
  purchaseCount?: number
}

export const FRAME_TYPES: { id: FrameType; name: string }[] = [
  { id: 'default', name: 'Klasik' },
  { id: 'christmas', name: 'Noel' },
  { id: 'halloween', name: 'Cadılar Bayramı' },
  { id: 'avatarframe1', name: 'Animasyonlu 1' },
  { id: 'avatarframe2', name: 'Animasyonlu 2' },
  { id: 'avatarframe3', name: 'Animasyonlu 3' },
  { id: 'avatarframe4', name: 'Animasyonlu 4' },
  { id: 'fire', name: 'Ateş' },
  { id: 'ice', name: 'Buz' },
  { id: 'neon', name: 'Neon' },
  { id: 'gold', name: 'Altın' },
  { id: 'rainbow', name: 'Gökkuşağı' },
]

export const PATTERN_KEYS: { id: string; name: string }[] = [
  { id: 'dots', name: 'Nokta' },
  { id: 'stripes', name: 'Çizgi' },
  { id: 'grid', name: 'Grid' },
  { id: 'halftone', name: 'Halftone' },
  { id: 'zigzag', name: 'Zigzag' },
  { id: 'waves', name: 'Dalga' },
]

export const BACKGROUND_KEYS: { id: string; name: string }[] = [
  { id: 'space', name: 'Uzay' },
  { id: 'city', name: 'Şehir' },
  { id: 'nature', name: 'Doğa' },
  { id: 'ocean', name: 'Okyanus' },
  { id: 'sunset', name: 'Gün Batımı' },
  { id: 'neon', name: 'Neon' },
]

export const NAME_TEXT_EFFECT_KEYS: { id: string; name: string }[] = [...NAME_TEXT_EFFECT_OPTIONS]

export const PREMIUM_PASS_KEYS: { id: string; name: string }[] = [
  { id: 'namefx-pass', name: 'Premium Aylık Üyelik' },
]

export const STORE_THEME_SUGGESTIONS = [
  'Anime',
  'Manga',
  'Fantastik',
  'Bilim Kurgu',
  'Korku',
  'Doğa',
  'Neon',
  'Retro',
] as const

export const PUBLIC_STORE_ITEM_TYPES: PublicStoreItemType[] = ['frame', 'premium', 'background', 'profile_effect']

export function isPublicStoreItemType(type: StoreItemType): type is PublicStoreItemType {
  return PUBLIC_STORE_ITEM_TYPES.includes(type as PublicStoreItemType)
}

export function sanitizeStoreItemThemeName(themeName?: string | null) {
  if (typeof themeName !== 'string') return undefined
  const normalized = themeName.trim().replace(/\s+/g, ' ')
  return normalized || undefined
}

export function normalizeStoreItemTheme(themeName?: string | null) {
  const sanitized = sanitizeStoreItemThemeName(themeName)
  if (!sanitized) return null

  return sanitized
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || null
}

export function formatStoreItemThemeLabel(themeName?: string | null) {
  const sanitized = sanitizeStoreItemThemeName(themeName)
  if (!sanitized) return null

  return sanitized
    .split(/\s+/)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr') + part.slice(1))
    .join(' ')
}

export const STORE_CATEGORIES = [
  { id: 'background', name: 'Arkaplanlar', icon: '🌌' },
  { id: 'all', name: 'Tümü', icon: '🛒' },
  { id: 'frame', name: 'Avatar Çerçeveleri', icon: '🖼️' },
  { id: 'profile_effect', name: 'Profil Efektleri', icon: '✨' },
  { id: 'packages', name: 'Paketler', icon: '📦' },
  { id: 'premium', name: 'Premium Üyelik', icon: '✨' },
] as const

