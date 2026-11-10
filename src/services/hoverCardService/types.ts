import type { NameTextStyleSelection } from '@/data/nameTextEffects'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'

import type { HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'

export interface ResolvedUserHoverData {
  id: string
  username: string
  displayName: string
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
  avatar: string
  bio?: string
  followerCount: number
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  activeNameEffectId?: string
  activeNameFontId?: string
  activeNameColorId?: string
  activeNameSecondaryColorId?: string
  activeUserNameStyle?: NameTextStyleSelection | null
  isPremiumActive: boolean
  hoverTheme?: HoverCardThemeColors | null
  activeProfileEffectAssets?: StoreProfileEffectAssets
  fansubMemberships: Array<{
    fansubId: string
    fansubName: string
    fansubSlug?: string
    role: string
    teamTag?: string
  }>
  displayedBadges: Array<{
    id: string
    name: string
    imageUrl: string
    rarity?: string
  }>
}

export interface ResolvedFansubHoverData {
  id: string
  slug?: string
  name: string
  avatar: string
  description?: string
  mangaCount: number
  followerCount: number
  hasFullNameStyle?: boolean
  canUploadStaticBackground?: boolean
  canUploadVideoBackground?: boolean
  canUseHoverTheme?: boolean
  hoverTheme?: HoverCardThemeColors | null
  activeNameStyle?: {
    version?: number
    fontId?: string
    effectId?: string
    colorId?: string
    secondaryColorId?: string
  }
  frameType?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets
  latestContent?: {
    mangaId: string
    mangaSlug?: string
    mangaTitle: string
    chapterNumber?: number
    chapterTitle?: string
    createdAt: string
  }
  participationStatus: 'active' | 'passive'
  participationUpdatedAt?: string
  displayedBadges: Array<{
    id: string
    name: string
    imageUrl: string
    rarity?: string
  }>
}

export interface ResolvedMangaHoverData {
  id: string
  slug?: string
  title: string
  coverImage: string
  description?: string
  status?: string
  lastChapterNumber?: number | null
  genres?: string[]
  followerCount: number
  viewCount: number
}

export type UserHoverResolveSource = 'cache-hit' | 'cache-stale' | 'network' | 'inflight'
export type FansubHoverResolveSource = 'cache-hit' | 'network' | 'inflight'

export interface UserHoverResolveMeta {
  source: UserHoverResolveSource
  durationMs: number
}

export interface UserHoverResolveResult {
  data: ResolvedUserHoverData | null
  meta: UserHoverResolveMeta
}

export interface UserHoverResolveOptions {
  forceRefresh?: boolean
  allowStale?: boolean
  revalidateStale?: boolean
  signal?: AbortSignal
}

export interface FansubHoverResolveMeta {
  source: FansubHoverResolveSource
  durationMs: number
}

export interface FansubHoverResolveResult {
  data: ResolvedFansubHoverData | null
  meta: FansubHoverResolveMeta
}

export interface FansubHoverResolveOptions {
  forceRefresh?: boolean
  signal?: AbortSignal
}

export type UserHoverMetricsAccumulator = {
  cacheHitCount: number
  staleHitCount: number
  missCount: number
  inflightJoinCount: number
  networkRequestCount: number
  networkErrorCount: number
  networkTotalDurationMs: number
  openCount: number
  openTotalDurationMs: number
}

export type FansubHoverMetricsAccumulator = {
  cacheHitCount: number
  missCount: number
  inflightJoinCount: number
  networkRequestCount: number
  networkErrorCount: number
  networkTotalDurationMs: number
  openCount: number
  openTotalDurationMs: number
}

export interface UserHoverMetricsSnapshot {
  cacheHitCount: number
  staleHitCount: number
  missCount: number
  inflightJoinCount: number
  networkRequestCount: number
  networkErrorCount: number
  networkTotalDurationMs: number
  averageNetworkDurationMs: number
  openCount: number
  openTotalDurationMs: number
  averageOpenDurationMs: number
}

export interface FansubHoverMetricsSnapshot {
  cacheHitCount: number
  missCount: number
  inflightJoinCount: number
  networkRequestCount: number
  networkErrorCount: number
  networkTotalDurationMs: number
  averageNetworkDurationMs: number
  openCount: number
  openTotalDurationMs: number
  averageOpenDurationMs: number
}

export type CacheEntry<T> = {
  value: T | null
  expiresAt: number
}

export type UserHoverFetchInput = {
  userId?: string
  username?: string
}

export type FansubHoverFetchInput = {
  fansubId?: string
  slug?: string
}

export type MangaHoverFetchInput = {
  mangaId?: string
  slug?: string
}

export type UserRow = {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  premium_expires_at: string | null
  is_premium_active?: boolean | null
  active_name_style?: Record<string, unknown> | null
  active_name_effect?: string | null
  active_profile_effect_id?: string | null
  active_fansub_identity_tag?: FansubIdentityTagPresentation | null
  active_hover_theme?: Record<string, unknown> | null
}

export type FansubRow = {
  id: string
  slug: string | null
  name: string
  avatar_url: string | null
  description: string | null
  active_name_style?: Record<string, unknown> | null
  frame_type: string | null
  primary_color: string | null
  secondary_color: string | null
  custom_background_asset_url: string | null
  manga_count: number | null
  follower_count: number | null
  active_frame_id: string | null
  active_background_id: string | null
  active_pattern_id: string | null
  active_profile_effect_id: string | null
  hover_theme?: Record<string, unknown> | null
}

export type MangaRow = {
  id: string
  slug: string | null
  title: string
  cover_image_url: string | null
  description: string | null
  status: string | null
  last_chapter_number: number | null
  genres: string[] | null
  follower_count: number | null
  total_views: number | null
}

export type BadgeRow = {
  id: string
  name: string
  image_url: string | null
  rarity: string | null
}

export type UserDisplayedBadgeRow = {
  badge_id: string
  display_order: number | null
  badge: BadgeRow | BadgeRow[] | null
}

export type FansubDisplayedBadgeRow = {
  badge_id: string
  display_order: number | null
  badge: BadgeRow | BadgeRow[] | null
}

export type FansubLatestChapterRow = {
  id: string
  chapter_number: number | null
  title: string | null
  publish_at: string | null
  created_at: string
  manga_id: string | null
  manga: {
    id: string
    title: string
    slug?: string | null
  } | {
    id: string
    title: string
    slug?: string | null
  }[] | null
}

export type FansubLatestMangaRow = {
  id: string
  title: string
  slug?: string | null
  created_at: string
}

export type UserFansubMembershipRow = {
  fansub_id: string
  role: string
  team_tag: string | null
  created_at: string
  fansub: {
    id: string
    name: string
    slug: string | null
    is_active: boolean
  } | {
    id: string
    name: string
    slug: string | null
    is_active: boolean
  }[] | null
}




