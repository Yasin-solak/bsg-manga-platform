import type { FrameType } from '@components/common/AvatarFrame'
import { primeAvatarFrameCustomAssets } from '@components/common/AvatarFrame/useAvatarFrameResolvedAssets'
import { isPremiumPerkEnabled } from '@/lib/premiumPerks'
import { parseProfileTheme } from '@/lib/profileTheme'
import type { StoreItem } from '@/data/storeProducts'
import { parseFansubIdentityTag } from '@/lib/fansubIdentityTags'
import type { MangaListSummary } from '@/services/mangaListService'
import { userService, type UserProfileViewAccess } from '@/services/userService'
import { type Badge as BadgeData, type UserBadge } from '@/services/badgeService'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import { isPremiumActive } from '@/services/premiumPackagePublicService'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
} from '@/data/nameTextEffects'
import {
  pickNameTextFxSelection,
  resolveNameTextStyleFromOwnedItems,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import {
  buildFansubCardCosmeticMapFromLookups,
  collectFansubCardStoreRefs,
} from '@/services/fansubCosmeticService'
import type { FansubCosmeticSource } from '@/services/fansubCosmeticService'
import { loadStoreItemsLiteByRefs, toStoreItemLiteTypeIdentifierKey } from '@/services/storeItemLiteDirectory'
import { loadProfileCollections, loadVisibleProfileDecorations } from './profileDataLoaders'
import {
  extractUploadedBackgroundSlotIndex,
  resolveUploadedBackgroundsFromOwnedItems,
} from './profileBackgroundUploads'
import { createHiddenProfileStats, KNOWN_PROFILE_FRAME_TYPES } from './helpers'
import { normalizeIsoTimestamp, toOwnedItemsRecord } from './profilePageUtils'
import { getE2EMockProfilePageSnapshot } from './profileE2eSnapshot'
import type { MockUser, OwnedBackground } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeProfileStoreRef(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function primeProfileFrameFromLookups(
  frameRef: string | null,
  lookups: Awaited<ReturnType<typeof loadStoreItemsLiteByRefs>>,
) {
  const normalizedFrameRef = typeof frameRef === 'string' ? frameRef.trim() : ''
  if (!normalizedFrameRef || KNOWN_PROFILE_FRAME_TYPES.includes(normalizedFrameRef as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])) {
    return
  }

  const frameRow = isUuid(normalizedFrameRef)
    ? lookups.byId.get(normalizedFrameRef)
    : lookups.byTypeIdentifier.get(toStoreItemLiteTypeIdentifierKey('frame', normalizedFrameRef))
  if (!frameRow) return

  const liveSource = frameRow.custom_asset_url || frameRow.image_key
  const liveUrl = resolveStoreAssetUrl(liveSource) || liveSource || undefined
  const posterUrl = resolveStoreAssetUrl(frameRow.poster_asset_url) || frameRow.poster_asset_url || undefined
  primeAvatarFrameCustomAssets({
    frameType: normalizedFrameRef,
    customOverlayUrl: liveUrl,
    posterOverlayUrl: posterUrl,
  })
}

function buildDirectBackgroundSelection(backgroundRef: string): OwnedBackground {
  const isUploadedBackground = backgroundRef.includes('user-backgrounds/')
  const slotIndex = isUploadedBackground ? extractUploadedBackgroundSlotIndex(backgroundRef) : undefined

  return {
    id: backgroundRef,
    label: isUploadedBackground ? txa('Kişisel arka plan') : txa('Seçili arka plan'),
    background: backgroundRef,
    mediaType: resolveAssetMediaType(backgroundRef) || undefined,
    origin: isUploadedBackground ? 'upload' : 'store',
    slotIndex,
  }
}

function isUploadedProfileBackgroundRef(backgroundRef?: string | null) {
  return typeof backgroundRef === 'string' && backgroundRef.includes('user-backgrounds/')
}

interface LoadProfilePageSnapshotOptions {
  currentUserId: string | null
  username: string
}

async function loadVisibleProfile(params: {
  canViewProfile: boolean
  canViewSocialLinks: boolean
  currentUserId: string | null
  isProfileOwner: boolean
  profileIdentity: { id: string }
}) {
  const { canViewProfile, canViewSocialLinks, currentUserId, isProfileOwner, profileIdentity } = params
  if (isProfileOwner && currentUserId) return await userService.getOwnProfileById(currentUserId)
  if (canViewProfile) {
    return await userService.getProfileById(profileIdentity.id, { includeSocialLinks: canViewSocialLinks })
  }
  return null
}

export interface ProfilePageSnapshot {
  editResourcesHydrated: boolean
  equippedBackground: OwnedBackground | null
  equippedProfileEffect: StoreItem | null
  hasNameTextAccess: boolean
  ownedBadges: (UserBadge & { badge?: BadgeData })[]
  ownedProfileEffects: StoreItem[]
  profileLists: MangaListSummary[]
  profileOwnedItems: Record<string, unknown>
  profilePremiumExpiresAt: string | null
  profileViewAccess: UserProfileViewAccess
  resolvedFrames: ResolvedInventoryItem[]
  selectedBadgeIds: string[]
  selectedNameColorId: NameTextColorId
  selectedNameEffectId: NameTextEffectId
  selectedNameFontId: NameTextFontId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
  user: MockUser
}

function buildReadingHistoryItems(history: any[]): MockUser['readingHistory'] {
  return history.reduce<MockUser['readingHistory']>((acc, historyItem) => {
    const mangaId = String(historyItem?.manga_id || historyItem?.manga?.id || '').trim()
    if (!mangaId) return acc
    const title = String(historyItem?.manga?.title || txa('Silinmiş manga')).trim()
    const chapterNumber = Number(historyItem?.chapter_number || 0)
    acc.push({
      mangaId,
      mangaSlug: typeof historyItem?.manga?.slug === 'string' ? historyItem.manga.slug : undefined,
      title: title || txa('Silinmiş manga'),
      coverImage: historyItem?.manga?.cover_image_url || '',
      chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : 0,
      lastChapterNumber: Number(historyItem?.manga?.last_chapter_number) > 0 ? Number(historyItem.manga.last_chapter_number) : undefined,
    })
    return acc
  }, [])
}

function resolveLastChapterLabel(value: unknown) {
  const chapterNumber = Number(value)
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return undefined
  return String(Math.floor(chapterNumber))
}

function buildFollowingItems(follows: any[]): MockUser['following'] {
  return follows.reduce<MockUser['following']>((acc, followedManga) => {
    const mangaId = String(followedManga?.manga_id || followedManga?.manga?.id || '').trim()
    if (!mangaId) return acc
    const title = String(followedManga?.manga?.title || txa('Silinmiş manga')).trim()
    const lastChapter = resolveLastChapterLabel(followedManga?.manga?.last_chapter_number)
    acc.push({
      id: mangaId,
      slug: typeof followedManga?.manga?.slug === 'string' ? followedManga.manga.slug : undefined,
      title: title || txa('Silinmiş manga'),
      coverImage: followedManga?.manga?.cover_image_url || '',
      lastChapter,
      isNew: false,
    })
    return acc
  }, [])
}

function resolveFollowingFansubFrameType(frameType: unknown): FrameType {
  const normalized = typeof frameType === 'string' ? frameType.trim().toLowerCase() : ''
  if (KNOWN_PROFILE_FRAME_TYPES.includes(normalized as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])) {
    return normalized as FrameType
  }
  return 'default'
}

function buildFollowingFansubs(
  fansubFollows: any[],
  cosmeticMap = new Map<string, ReturnType<typeof buildFansubCardCosmeticMapFromLookups> extends Map<string, infer TValue> ? TValue : never>(),
): MockUser['followingFansubs'] {
  return fansubFollows.reduce<MockUser['followingFansubs']>((acc, followedFansub) => {
    const fansubId = String(followedFansub?.fansub?.id || followedFansub?.fansub_id || '').trim()
    if (!fansubId) return acc
    const fansubName = String(followedFansub?.fansub?.name || txa('Bilinmeyen Fansub')).trim() || txa('Bilinmeyen Fansub')
    const cosmetics = cosmeticMap.get(fansubId)
    primeAvatarFrameCustomAssets({
      frameType: followedFansub?.fansub?.frame_type,
      customOverlayUrl:
        cosmetics?.frameCustomOverlayUrl
        || followedFansub?.fansub?.frame_custom_overlay_url
        || undefined,
      posterOverlayUrl:
        cosmetics?.framePosterOverlayUrl
        || followedFansub?.fansub?.frame_poster_overlay_url
        || undefined,
    })
    acc.push({
      id: fansubId,
      slug: typeof followedFansub?.fansub?.slug === 'string' ? followedFansub.fansub.slug : undefined,
      name: fansubName,
      avatar: followedFansub?.fansub?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(fansubName)}`,
      mangaCount: followedFansub?.fansub?.manga_count,
      followerCount: followedFansub?.fansub?.follower_count,
      frameType: resolveFollowingFansubFrameType(
        cosmetics?.frameType || followedFansub?.fansub?.frame_type,
      ),
      frameCustomOverlayUrl:
        cosmetics?.frameCustomOverlayUrl
        || followedFansub?.fansub?.frame_custom_overlay_url
        || undefined,
      framePosterOverlayUrl:
        cosmetics?.framePosterOverlayUrl
        || followedFansub?.fansub?.frame_poster_overlay_url
        || undefined,
      primaryColor: followedFansub?.fansub?.primary_color,
      secondaryColor: followedFansub?.fansub?.secondary_color,
    })
    return acc
  }, [])
}

function collectProfileStoreRefs(params: {
  activeBackgroundId: string | null
  activeFrameId: string | null
  fansubFollows?: any[]
}) {
  const identifiers = new Set<string>()
  const ids = new Set<string>()
  if (params.activeFrameId && !KNOWN_PROFILE_FRAME_TYPES.includes(params.activeFrameId as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])) {
    identifiers.add(params.activeFrameId)
  }
  if (params.activeBackgroundId && !/^(https?:|data:|blob:|\/)/i.test(params.activeBackgroundId) && !params.activeBackgroundId.includes('://')) {
    identifiers.add(params.activeBackgroundId)
  }
  const fansubRows = (params.fansubFollows || [])
    .map((followedFansub) => followedFansub?.fansub)
    .filter((fansub): fansub is FansubCosmeticSource => Boolean(fansub?.id))
  const fansubRefs = collectFansubCardStoreRefs(fansubRows)
  fansubRefs.ids.forEach((id) => ids.add(id))
  fansubRefs.identifiers.forEach((identifier) => identifiers.add(identifier))

  return {
    identifiers: Array.from(identifiers),
    ids: Array.from(ids),
  }
}

export async function loadProfilePageSnapshot({ currentUserId, username }: LoadProfilePageSnapshotOptions): Promise<ProfilePageSnapshot> {
  const e2eSnapshot = getE2EMockProfilePageSnapshot({ currentUserId, username })
  if (e2eSnapshot) return e2eSnapshot

  const profileIdentity = await userService.getProfileIdentityByIdentifier(username)
  const access = await userService.getProfileViewAccess(profileIdentity.id)

  const isProfileOwner = Boolean(currentUserId && currentUserId === profileIdentity.id)
  const canViewStats = isProfileOwner || access.statsVisible
  const canViewSocialLinks = isProfileOwner || access.socialLinksVisible
  const canViewActivity = isProfileOwner || access.activityVisible
  const canViewProfile = isProfileOwner || access.profileVisible
  const [profile, progression] = await Promise.all([
    loadVisibleProfile({
      canViewProfile,
      canViewSocialLinks,
      currentUserId,
      isProfileOwner,
      profileIdentity,
    }),
    canViewProfile
      ? userService.getPublicUserProgression(profileIdentity.id)
      : Promise.resolve(null),
  ])
  const profileId = profile?.id || profileIdentity.id
  const includePrivateLists = Boolean(currentUserId && currentUserId === profileId)

  const ownedItemsRecord = toOwnedItemsRecord(profile?.owned_items)
  const premiumExpiresAt = normalizeIsoTimestamp(profile?.premium_expires_at)
  const resolvedNameTextStyle = resolveNameTextStyleFromOwnedItems(ownedItemsRecord, premiumExpiresAt)

  const snapshotBase = {
    hasNameTextAccess: resolvedNameTextStyle.hasPremiumAccess,
    profileOwnedItems: ownedItemsRecord,
    profilePremiumExpiresAt: premiumExpiresAt,
    profileViewAccess: access,
    selectedNameColorId: resolvedNameTextStyle.style?.colorId || DEFAULT_NAME_TEXT_COLOR_ID,
    selectedNameEffectId: resolvedNameTextStyle.style?.effectId || DEFAULT_NAME_TEXT_EFFECT_ID,
    selectedNameFontId: resolvedNameTextStyle.style?.fontId || DEFAULT_NAME_TEXT_FONT_ID,
    selectedNameSecondaryColorId: resolvedNameTextStyle.style?.secondaryColorId || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
    selectedNameMotionId: resolvedNameTextStyle.style?.motionId || DEFAULT_NAME_TEXT_MOTION_ID,
    selectedNameFx: pickNameTextFxSelection(resolvedNameTextStyle.style),
  }

  const baseProfileUser: MockUser = {
    id: profileId,
    username: profile?.username || profileIdentity.username,
    displayName: profile?.display_name || profileIdentity.display_name || profile?.username || profileIdentity.username,
    activeFansubIdentityTag: parseFansubIdentityTag(profile?.active_fansub_identity_tag ?? null),
    avatar: profile?.avatar_url || profileIdentity.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.username || profileIdentity.username}`,
    bio: canViewProfile ? (profile?.bio || '') : '',
    level: profile?.level || txa('Acemi'),
    progression: progression || undefined,
    isPremiumActive: isPremiumActive(premiumExpiresAt),
    // Profile theme: for the owner from owned_items (premium gated), for a visitor from the field the
    // get_public_user_profile RPC already returns premium-gated.
    // If the Premium "Profile theme" perk is off the owner does not see it either (the server does not give it to visitors anyway).
    hoverTheme: isPremiumActive(premiumExpiresAt) && isPremiumPerkEnabled('hover_theme')
      ? parseProfileTheme(
          ownedItemsRecord.active_hover_theme
          ?? (profile as { active_hover_theme?: unknown } | null)?.active_hover_theme,
        )
      : parseProfileTheme((profile as { active_hover_theme?: unknown } | null)?.active_hover_theme),
    activeProfileEffectId: profile?.active_profile_effect_id ?? null,
    frameType: ((profile?.frame_type || profileIdentity.frame_type) as FrameType) || 'default',
    joinDate: profile?.created_at
      ? new Date(profile.created_at).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
      : '',
    joinedAt: profile?.created_at || undefined,
    stats: createHiddenProfileStats(),
    socialLinks: canViewSocialLinks ? (profile?.social_links || []) : [],
    ownedFrames: (profile?.owned_items?.frames as string[]) || ['default'],
    ownedBackgrounds: [],
    readingHistory: [],
    following: [],
    badges: [],
    favoriteGenres: [],
    followingFansubs: [],
    activityFeed: [],
    followsCurrentUser: false,
    followersList: [],
    followingList: [],
  }

  if (!canViewProfile) {
    const lockedProfileFrameRef = typeof baseProfileUser.frameType === 'string' ? baseProfileUser.frameType.trim() : ''
    const lockedProfileFrameLookups = lockedProfileFrameRef && !KNOWN_PROFILE_FRAME_TYPES.includes(lockedProfileFrameRef as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])
      ? await loadStoreItemsLiteByRefs(
        isUuid(lockedProfileFrameRef)
          ? { ids: [lockedProfileFrameRef] }
          : { identifiers: [lockedProfileFrameRef] },
      )
      : { byId: new Map(), byTypeIdentifier: new Map() }
    primeProfileFrameFromLookups(
      baseProfileUser.frameType || null,
      lockedProfileFrameLookups,
    )
    return {
      ...snapshotBase,
      editResourcesHydrated: false,
      equippedBackground: null,
      equippedProfileEffect: null,
      ownedBadges: [],
      ownedProfileEffects: [],
      profileLists: [],
      resolvedFrames: [],
      selectedBadgeIds: [],
      user: baseProfileUser,
    }
  }

  if (!profile) {
    throw new Error('PROFILE_NOT_FOUND')
  }

  const {
    history,
    follows,
    fansubFollows,
    activities,
    calculatedStats,
    lists,
  } = await loadProfileCollections({
    profileId,
    canViewActivity,
    canViewStats,
    includePrivateLists,
  })

  const rawActiveBackgroundId = (profile?.background_type || null) as string | null
  const activeBackgroundId = isUploadedProfileBackgroundRef(rawActiveBackgroundId) && !baseProfileUser.isPremiumActive
    ? null
    : rawActiveBackgroundId
  const preloadedStoreRefsInput = collectProfileStoreRefs({
    activeBackgroundId,
    activeFrameId: baseProfileUser.frameType || null,
    fansubFollows,
  })
  const preloadedStoreRefs = (
    preloadedStoreRefsInput.ids.length > 0 || preloadedStoreRefsInput.identifiers.length > 0
  )
    ? await loadStoreItemsLiteByRefs({
      ids: preloadedStoreRefsInput.ids,
      identifiers: preloadedStoreRefsInput.identifiers,
    })
    : { byId: new Map(), byTypeIdentifier: new Map() }
  const followingFansubCosmetics = buildFansubCardCosmeticMapFromLookups(
    (fansubFollows || [])
      .map((followedFansub) => followedFansub?.fansub)
      .filter((fansub): fansub is FansubCosmeticSource => Boolean(fansub?.id)),
    {
      byId: preloadedStoreRefs.byId as Parameters<typeof buildFansubCardCosmeticMapFromLookups>[1]['byId'],
      byTypeIdentifier: preloadedStoreRefs.byTypeIdentifier as Parameters<typeof buildFansubCardCosmeticMapFromLookups>[1]['byTypeIdentifier'],
    },
  )

  const hydratedUser: MockUser = {
    ...baseProfileUser,
    bio: profile.bio || '',
    stats: {
      reading: calculatedStats.reading,
      followers: calculatedStats.followers,
      following: calculatedStats.following,
      totalChaptersRead: calculatedStats.reading,
      timeSpentMinutes: calculatedStats.timeSpentMinutes,
      comments: calculatedStats.comments,
    },
    socialLinks: canViewSocialLinks ? (profile.social_links || []) : [],
    ownedBackgrounds: [],
    readingHistory: buildReadingHistoryItems(history || []),
    following: buildFollowingItems(follows || []),
    badges: [],
    favoriteGenres: calculatedStats.favoriteGenres,
    followingFansubs: buildFollowingFansubs(fansubFollows || [], followingFansubCosmetics),
    activityFeed: activities,
    followsCurrentUser: false,
    followersList: [],
    followingList: [],
  }

  const {
    ownedBadges,
    selectedBadgeIds,
    resolvedFrames,
    equippedBackground,
    equippedProfileEffect,
  } = await loadVisibleProfileDecorations({
    profileId,
    activeFrameId: baseProfileUser.frameType || null,
    activeBackgroundId,
    activeProfileEffectId: profile?.active_profile_effect_id ?? null,
    preloadedStoreRefs,
  })

  const normalizedActiveFrame = normalizeProfileStoreRef(baseProfileUser.frameType)
  const resolvedActiveFrame = resolvedFrames.find(
    (frame) => normalizeProfileStoreRef(frame.identifier) === normalizedActiveFrame,
  )
  if (resolvedActiveFrame) {
    primeAvatarFrameCustomAssets({
      frameType: baseProfileUser.frameType,
      customOverlayUrl: resolvedActiveFrame.customAssetUrl,
      posterOverlayUrl: resolvedActiveFrame.posterAssetUrl,
    })
  }

  const uploadedBackgrounds = resolveUploadedBackgroundsFromOwnedItems(ownedItemsRecord)
  const knownBackgroundItems = equippedBackground
    ? [
      ...uploadedBackgrounds.filter((backgroundItem) => backgroundItem.id !== equippedBackground.id),
      equippedBackground,
    ]
    : uploadedBackgrounds
  const resolvedEquippedBackground = activeBackgroundId
    ? knownBackgroundItems.find((backgroundItem) => backgroundItem.id === activeBackgroundId)
      || equippedBackground
      || buildDirectBackgroundSelection(activeBackgroundId)
    : null
  const ownedBackgrounds = resolvedEquippedBackground
    ? [resolvedEquippedBackground, ...knownBackgroundItems.filter((backgroundItem) => backgroundItem.id !== resolvedEquippedBackground.id)]
    : knownBackgroundItems

  return {
    ...snapshotBase,
    editResourcesHydrated: false,
    equippedBackground: resolvedEquippedBackground,
    equippedProfileEffect,
    ownedBadges,
    ownedProfileEffects: [],
    profileLists: lists,
    resolvedFrames,
    selectedBadgeIds,
    user: {
      ...hydratedUser,
      activeProfileEffectId: profile?.active_profile_effect_id ?? null,
      ownedBackgrounds,
    },
  }
}
