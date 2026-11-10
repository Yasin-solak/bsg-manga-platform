import { Film, SmilePlus, Sticker, type LucideIcon } from 'lucide-react'
import type { CommunityExpressionFavoriteState } from '@/lib/communityExpressionFavorites'
import {
  buildFansubSupporterEmojiToken,
  buildFansubSupporterStickerToken,
} from '@/lib/fansubSupporterAssetTokens'
import type { CommunityExpressionFansubSource } from '@/services/communityExpressionPickerService'
import type { FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import type { CommunityGifSelection } from '@types'
import { txa } from '@/i18n/activeLocale'

export type CommunityExpressionPickerTab = 'gif' | 'emoji' | 'sticker'
export type CommunityExpressionSourceKey = 'favorites' | 'default' | `fansub:${string}`
export type CommunityExpressionPickerLauncherVariant = 'single' | 'inline-icons'

export interface CommunityExpressionPickerProps {
  disabled?: boolean
  contextFansubId?: string | null
  isGifEnabled?: boolean
  selectedGif?: CommunityGifSelection
  launcherVariant?: CommunityExpressionPickerLauncherVariant
  onInsertText: (text: string) => void
  onSelectGif?: (gif: CommunityGifSelection) => void
  onClearGif?: () => void
}

export interface CustomExpressionItem {
  id: string
  kind: 'emoji' | 'sticker'
  label: string
  searchText: string
  favoriteKey: string
  asset: FansubSupporterAssetCatalogItem
  locked: boolean
  token: string
}

export interface UnicodeExpressionItem {
  id: string
  kind: 'unicode'
  label: string
  searchText: string
  favoriteKey: string
  value: string
}

export interface GifExpressionItem {
  id: string
  kind: 'gif'
  label: string
  searchText: string
  favoriteKey: string
  gif: CommunityGifSelection
}

export type EmojiExpressionItem = CustomExpressionItem | UnicodeExpressionItem

export interface CommunityExpressionCustomSourceEntry {
  key: CommunityExpressionSourceKey
  source: CommunityExpressionFansubSource
}

export interface CommunityExpressionPickerTabDefinition {
  key: CommunityExpressionPickerTab
  label: string
  icon: LucideIcon
  visible: boolean
}

export const FAVORITES_SOURCE_KEY = 'favorites'
export const DEFAULT_SOURCE_KEY = 'default'
export const CUSTOM_ASSET_PICKER_VIEWPORT_CLASS = 'max-h-[220px] sm:max-h-[240px]'
export const CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS = 'min-h-[140px] sm:min-h-[156px]'

export function buildFansubSourceKey(fansubId: string): CommunityExpressionSourceKey {
  return `fansub:${fansubId}`
}

export function parseFavoriteCustomKey(
  key: string,
): { kind: 'emoji' | 'sticker'; fansubId: string; shortcode: string } | null {
  const match = /^fansub:(emoji|sticker):([^:]+):([a-z0-9_-]+)$/i.exec(key.trim())
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null
  return {
    kind: match[1] === 'sticker' ? 'sticker' : 'emoji',
    fansubId: match[2],
    shortcode: match[3],
  }
}

export function buildCustomFavoriteKey(asset: FansubSupporterAssetCatalogItem) {
  return `fansub:${asset.assetKind}:${asset.fansubId}:${asset.shortcode}`
}

export function buildUnicodeFavoriteKey(value: string) {
  return `unicode:${value}`
}

export function buildGifFavoriteKey(gif: CommunityGifSelection) {
  return `gif:${gif.provider}:${gif.providerAssetId}`
}

export function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase('tr')
}

export function matchesSearch(searchValue: string, query: string) {
  if (!query) return true
  return normalizeSearchText(searchValue).includes(query)
}

export function buildAssetToken(asset: FansubSupporterAssetCatalogItem) {
  return asset.assetKind === 'emoji'
    ? buildFansubSupporterEmojiToken(asset.shortcode, asset.currentRevisionId)
    : buildFansubSupporterStickerToken(asset.shortcode, asset.currentRevisionId)
}

export function buildSourceHint(source: CommunityExpressionFansubSource) {
  if (source.reasons.includes('context')) return txa('Bu alanın fansubu')
  if (source.reasons.includes('supporting')) return txa('Takviye verdiğin fansub')
  return txa('Takip ettiğin fansub')
}

export function buildExpressionTabs(isGifEnabled: boolean): CommunityExpressionPickerTabDefinition[] {
  return [
    { key: 'emoji', label: txa('Emoji'), icon: SmilePlus, visible: true },
    { key: 'sticker', label: txa('Çıkartmalar'), icon: Sticker, visible: true },
    { key: 'gif', label: txa('GIF\'ler'), icon: Film, visible: isGifEnabled },
  ]
}

export interface CommunityExpressionPickerPanelProps {
  launcherVariant: CommunityExpressionPickerLauncherVariant
  activeTab: CommunityExpressionPickerTab
  customSources: CommunityExpressionCustomSourceEntry[]
  currentAssetLoading: boolean
  disabled: boolean
  emojiSources: CommunityExpressionSourceKey[]
  expressionTabs: CommunityExpressionPickerTabDefinition[]
  favorites: CommunityExpressionFavoriteState
  gifLoading: boolean
  gifProviderConfigured: boolean
  hasLockedCustomContent: boolean
  onClearGif?: () => void
  onClose: () => void
  onInsertEmoji: (item: EmojiExpressionItem) => void
  onInsertSticker: (item: CustomExpressionItem) => void
  onPremiumUnlock: () => void
  onSearchQueryChange: (value: string) => void
  onSelectGif: (gif: CommunityGifSelection) => void
  onSelectSource: (tab: 'emoji' | 'sticker', sourceKey: CommunityExpressionSourceKey) => void
  onTabChange: (tab: CommunityExpressionPickerTab) => void
  onToggleFavorite: (tab: 'gif' | 'emoji' | 'sticker', key: string) => void
  premiumActive: boolean
  searchQuery: string
  selectedEmojiSource: CommunityExpressionSourceKey
  selectedGif?: CommunityGifSelection
  selectedStickerSource: CommunityExpressionSourceKey
  sourceHint: string
  sourceTitle: string
  sourcesLoading: boolean
  stickerSources: CommunityExpressionSourceKey[]
  visibleEmojiItems: EmojiExpressionItem[]
  visibleGifItems: GifExpressionItem[]
  visibleStickerItems: CustomExpressionItem[]
}
