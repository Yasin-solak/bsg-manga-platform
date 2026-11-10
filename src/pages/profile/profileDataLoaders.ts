import { cloneStoreProfileEffectAssets } from '@/data/storeProducts'
import type { Badge, UserBadge } from '@/services/badgeService'
import { getUserBadges, getUserDisplayedBadges } from '@/services/badgeService'
import type { StoreItem } from '@/data/storeProducts'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import { resolveAssetMediaType } from '@/services/assetUrlService'
import { resolveOwnedBackgrounds, resolveOwnedFrames } from '@/services/inventoryResolver'
import { loadStoreItemsLiteByRefs, toStoreItemLiteTypeIdentifierKey } from '@/services/storeItemLiteDirectory'
import { getStoreProfileEffectAssetMap } from '@/services/storeProfileEffectService'
import { listStoreProductsByIdentifiers } from '@/services/storeService'
import { listUserMangaListsByOwner, type MangaListSummary } from '@/services/mangaListService'
import { userService } from '@/services/userService'
import { createHiddenProfileStats } from './helpers'
import { KNOWN_PROFILE_FRAME_TYPES } from './helpers'
import type { ActivityFeedItem, OwnedBackground } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileStatsResult = Awaited<ReturnType<typeof userService.getUserStats>>
type ReadingHistoryResult = Awaited<ReturnType<typeof userService.getReadingHistory>>
type FollowedMangasResult = Awaited<ReturnType<typeof userService.getFollowedMangas>>
type FollowedFansubsResult = Awaited<ReturnType<typeof userService.getFollowedFansubs>>
type ActivityFeedResult = ActivityFeedItem[]

export type ProfileCollectionsLoadResult = {
  history: ReadingHistoryResult
  follows: FollowedMangasResult
  fansubFollows: FollowedFansubsResult
  activities: ActivityFeedResult
  calculatedStats: ProfileStatsResult
  lists: MangaListSummary[]
}

export type ProfileDecorationsLoadResult = {
  ownedBadges: (UserBadge & { badge?: Badge })[]
  selectedBadgeIds: string[]
  resolvedFrames: ResolvedInventoryItem[]
  backgroundItems: OwnedBackground[]
  profileEffectItems: StoreItem[]
}

export type VisibleProfileDecorationsLoadResult = {
  ownedBadges: (UserBadge & { badge?: Badge })[]
  selectedBadgeIds: string[]
  resolvedFrames: ResolvedInventoryItem[]
  equippedBackground: OwnedBackground | null
  equippedProfileEffect: StoreItem | null
}

function createDefaultStats(): ProfileStatsResult {
  return {
    ...createHiddenProfileStats(),
    favoriteGenres: [] as ProfileStatsResult['favoriteGenres'],
  }
}

function readOwnedItemIds(
  ownedItems: Record<string, unknown>,
  key: 'frames' | 'backgrounds' | 'profile_effects',
  fallback: string[] = [],
) {
  const rawValue = ownedItems[key]
  if (!Array.isArray(rawValue)) return [...fallback]

  const normalized = rawValue
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return normalized.length > 0 ? normalized : [...fallback]
}

function resolveSettledOrFallback<T>(
  section: string,
  result: PromiseSettledResult<T>,
  fallback: T,
): T {
  if (result.status === 'fulfilled') {
    return result.value
  }

  console.error(`[ProfilePage] ${section} load error`, result.reason)
  return fallback
}

function isDirectBackgroundReference(backgroundRef: string) {
  return /^(https?:|data:|blob:|\/)/i.test(backgroundRef) || backgroundRef.includes('://')
}

function buildMinimalProfileEffectItem(effectId: string, assets?: NonNullable<Awaited<ReturnType<typeof getStoreProfileEffectAssetMap>>['data']> extends Map<string, infer TValue> ? TValue : never): StoreItem {
  return {
    id: effectId,
    name: txa('Profil efekti'),
    description: '',
    price: 0,
    currency: 'Coin',
    type: 'profile_effect',
    posterAssetUrl: assets?.posterAssetUrl,
    profileEffectAssets: assets
      ? cloneStoreProfileEffectAssets(assets)
      : undefined,
  }
}

export async function loadProfileCollections(params: {
  profileId: string
  canViewActivity: boolean
  canViewStats: boolean
  includePrivateLists: boolean
}): Promise<ProfileCollectionsLoadResult> {
  const {
    profileId,
    canViewActivity,
    canViewStats,
    includePrivateLists,
  } = params

  const [
    historyResult,
    followsResult,
    fansubFollowsResult,
    listsResult,
  ] = await Promise.allSettled([
    canViewActivity ? userService.getReadingHistory(profileId) : Promise.resolve([] as ReadingHistoryResult),
    canViewActivity ? userService.getFollowedMangas(profileId) : Promise.resolve([] as FollowedMangasResult),
    canViewActivity
      ? userService.getFollowedFansubs(profileId, { includeCosmetics: false })
      : Promise.resolve([] as FollowedFansubsResult),
    canViewActivity
      ? listUserMangaListsByOwner(profileId, {
        includePrivate: includePrivateLists,
        limit: 4,
      })
      : Promise.resolve([] as MangaListSummary[]),
  ])
  const history = resolveSettledOrFallback('reading history', historyResult, [])
  const [activitiesResult, statsResult] = await Promise.allSettled([
    canViewActivity
      ? userService.getActivityFeed(profileId, {
        recentHistory: historyResult.status === 'fulfilled' ? history : null,
      })
      : Promise.resolve([] as ActivityFeedResult),
    canViewStats
      ? userService.getUserStats(profileId)
      : Promise.resolve(createDefaultStats()),
  ])

  return {
    history,
    follows: resolveSettledOrFallback('followed mangas', followsResult, []),
    fansubFollows: resolveSettledOrFallback('followed fansubs', fansubFollowsResult, []),
    activities: resolveSettledOrFallback('activity feed', activitiesResult, []),
    calculatedStats: resolveSettledOrFallback('profile stats', statsResult, createDefaultStats()),
    lists: resolveSettledOrFallback('profile lists', listsResult, []),
  }
}

export async function loadVisibleProfileDecorations(params: {
  profileId: string
  activeFrameId: string | null
  activeBackgroundId: string | null
  activeProfileEffectId: string | null
  preloadedStoreRefs?: Awaited<ReturnType<typeof loadStoreItemsLiteByRefs>>
}): Promise<VisibleProfileDecorationsLoadResult> {
  const {
    profileId,
    activeFrameId,
    activeBackgroundId,
    activeProfileEffectId,
    preloadedStoreRefs,
  } = params

  const identifiersToResolve: string[] = []
  if (activeFrameId && !KNOWN_PROFILE_FRAME_TYPES.includes(activeFrameId as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])) {
    identifiersToResolve.push(activeFrameId)
  }
  if (activeBackgroundId && !isDirectBackgroundReference(activeBackgroundId)) {
    identifiersToResolve.push(activeBackgroundId)
  }

  const [displayedBadgesResult, resolvedRefsResult, profileEffectAssetMapResult] = await Promise.allSettled([
    getUserDisplayedBadges(profileId),
    preloadedStoreRefs
      ? Promise.resolve(preloadedStoreRefs)
      : identifiersToResolve.length > 0
      ? loadStoreItemsLiteByRefs({ identifiers: identifiersToResolve })
      : Promise.resolve({ byId: new Map(), byTypeIdentifier: new Map() }),
    activeProfileEffectId
      ? getStoreProfileEffectAssetMap([activeProfileEffectId])
      : Promise.resolve({ data: new Map(), error: null }),
  ])

  const ownedBadges = resolveSettledOrFallback('visible profile badges', displayedBadgesResult, [])
  const resolvedRefs = resolveSettledOrFallback('visible profile store refs', resolvedRefsResult, {
    byId: new Map(),
    byTypeIdentifier: new Map(),
  })
  const profileEffectAssetMap = resolveSettledOrFallback('visible profile effect assets', profileEffectAssetMapResult, {
    data: new Map(),
    error: null,
  }).data

  const resolvedFrames: ResolvedInventoryItem[] = []
  if (activeFrameId && !KNOWN_PROFILE_FRAME_TYPES.includes(activeFrameId as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])) {
    const frameRow = resolvedRefs.byTypeIdentifier.get(toStoreItemLiteTypeIdentifierKey('frame', activeFrameId))
    if (frameRow) {
      resolvedFrames.push({
        identifier: frameRow.identifier,
        name: frameRow.name || frameRow.identifier,
        customAssetUrl: frameRow.custom_asset_url || frameRow.image_key || undefined,
        posterAssetUrl: frameRow.poster_asset_url || undefined,
        type: 'frame',
      })
    }
  }

  let equippedBackground: OwnedBackground | null = null
  if (activeBackgroundId) {
    if (isDirectBackgroundReference(activeBackgroundId)) {
      equippedBackground = {
        id: activeBackgroundId,
        label: txa('Seçili arka plan'),
        background: activeBackgroundId,
        mediaType: resolveAssetMediaType(activeBackgroundId) || undefined,
        origin: activeBackgroundId.includes('user-backgrounds/') ? 'upload' : 'store',
      }
    } else {
      const backgroundRow = resolvedRefs.byTypeIdentifier.get(toStoreItemLiteTypeIdentifierKey('background', activeBackgroundId))
      if (backgroundRow) {
        const backgroundAsset = backgroundRow.custom_asset_url || backgroundRow.image_key || ''
        equippedBackground = {
          id: backgroundRow.identifier,
          label: backgroundRow.name || backgroundRow.identifier,
          background: backgroundAsset,
          mediaType: resolveAssetMediaType(backgroundAsset) || undefined,
          origin: 'store',
        }
      }
    }
  }

  const profileEffectAssets = activeProfileEffectId
    ? profileEffectAssetMap.get(activeProfileEffectId)
    : null

  return {
    ownedBadges,
    selectedBadgeIds: ownedBadges.map((badge) => badge.badge_id),
    resolvedFrames,
    equippedBackground,
    equippedProfileEffect: activeProfileEffectId
      ? buildMinimalProfileEffectItem(activeProfileEffectId, profileEffectAssets)
      : null,
  }
}

export async function loadProfileDecorations(
  profileId: string,
  ownedItems: Record<string, unknown>,
): Promise<ProfileDecorationsLoadResult> {
  const frameIds = readOwnedItemIds(ownedItems, 'frames', ['default'])
  const backgroundIds = readOwnedItemIds(ownedItems, 'backgrounds')
  const profileEffectIdentifiers = readOwnedItemIds(ownedItems, 'profile_effects')

  const [ownedBadgesResult, resolvedFramesResult, resolvedBackgroundsResult, profileEffectsResult] = await Promise.allSettled([
    getUserBadges(profileId),
    resolveOwnedFrames(frameIds),
    resolveOwnedBackgrounds(backgroundIds),
    listStoreProductsByIdentifiers(profileEffectIdentifiers, true),
  ])

  const ownedBadges = resolveSettledOrFallback('profile badges', ownedBadgesResult, [])
  const resolvedFrames = resolveSettledOrFallback('profile frames', resolvedFramesResult, [])
  const resolvedBackgrounds = resolveSettledOrFallback('profile backgrounds', resolvedBackgroundsResult, [])
  const backgroundItems: OwnedBackground[] = resolvedBackgrounds.map((backgroundItem) => ({
    id: backgroundItem.identifier,
    label: backgroundItem.name,
    background: backgroundItem.customAssetUrl || '',
    mediaType: resolveAssetMediaType(backgroundItem.customAssetUrl || '') || undefined,
    origin: 'store',
  }))

  const profileEffectItems = resolveSettledOrFallback('profile effects', profileEffectsResult, { data: [], error: null }).data

  return {
    ownedBadges,
    selectedBadgeIds: ownedBadges
      .filter((badge) => badge.is_displayed)
      .sort((a, b) => a.display_order - b.display_order)
      .map((badge) => badge.badge_id),
    resolvedFrames,
    backgroundItems,
    profileEffectItems,
  }
}
