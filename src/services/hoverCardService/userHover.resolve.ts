import { cloneStoreProfileEffectAssets } from '@/data/storeProducts'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  resolveKnownNameTextColorId,
  resolveKnownNameTextEffectId,
  resolveKnownNameTextFontId,
} from '@/data/nameTextEffects'
import {
  normalizeUserNameTextStyle,
} from '@/data/userNameStyle'
import { parseHoverCardTheme } from '@/components/common/hoverCardTheme'
import { parseFansubIdentityTag } from '@/lib/fansubIdentityTags'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { resolveStoreAssetUrl } from '../assetUrlService'
import { isPremiumActive } from '../premiumPackagePublicService'
import { buildCommentAuthorCosmeticMap } from '../communityCosmeticService'
import { getStoreProfileEffectAssetMap } from '../storeProfileEffectService'
import { supabase } from '../supabase'
import {
  getUserFallbackAvatar,
  isAbortError,
  nowMs,
  takeFirstRelation,
  toDurationMs,
  withAbortSignal,
} from './shared'
import {
  addUserHoverNetworkDuration,
  markUserHoverNetworkError,
  markUserHoverNetworkRequest,
} from './userHover.metrics'
import {
  normalizeUserHoverInput,
  writeUserHoverCacheEntries,
} from './userHover.state'
import type {
  ResolvedUserHoverData,
  UserDisplayedBadgeRow,
  UserFansubMembershipRow,
  UserHoverFetchInput,
  UserHoverResolveResult,
  UserRow,
} from './types'

const userHoverResolveLogger = createScopedLogger('hoverCardService.userHoverResolve')

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function resolvePublicNameTextStyle(user: UserRow) {
  const premiumActive = user.is_premium_active === true || isPremiumActive(user.premium_expires_at)
  if (!premiumActive) {
    return {
      activeNameEffectId: undefined,
      activeNameFontId: undefined,
      activeNameColorId: undefined,
      activeNameSecondaryColorId: undefined,
      activeUserNameStyle: null,
      isPremiumActive: false,
    }
  }

  const style = readRecord(user.active_name_style)
  return {
    activeNameEffectId: resolveKnownNameTextEffectId(
      readString(style?.effectId) || user.active_name_effect,
    ) || DEFAULT_NAME_TEXT_EFFECT_ID,
    activeNameFontId: resolveKnownNameTextFontId(readString(style?.fontId)) || DEFAULT_NAME_TEXT_FONT_ID,
    activeNameColorId: resolveKnownNameTextColorId(readString(style?.colorId)) || DEFAULT_NAME_TEXT_COLOR_ID,
    activeNameSecondaryColorId: resolveKnownNameTextColorId(readString(style?.secondaryColorId))
      || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
    // Full user style (fill, effect color, motion; old CSS effects become a plain style).
    activeUserNameStyle: normalizeUserNameTextStyle(style, user.active_name_effect),
    isPremiumActive: true,
  }
}

async function fetchUserRow(input: UserHoverFetchInput, signal?: AbortSignal): Promise<UserRow | null> {
  const normalizedInput = normalizeUserHoverInput(input)
  const userId = normalizedInput.userId
  const username = normalizedInput.username

  if (!userId && !username) return null

  const identityColumns = 'id, username, avatar_url, active_fansub_identity_tag'
  const queryById = async () => {
    if (!userId) return null
    const requestContext = createRequestContext('hoverCardService.userHoverResolve', 'fetch-user-row-by-id', {
      userId,
    })
    const query = withAbortSignal(
      supabase
        .from('public_user_directory')
        .select(identityColumns)
        .eq('id', userId)
        .maybeSingle(),
      signal,
    )
    const { data, error } = await query

    if (error && !isAbortError(error)) {
      userHoverResolveLogger.error({
        event: requestContext.event,
        message: 'kullanici satiri id ile alinamadi.',
        context: toRequestContextLogContext(requestContext),
        error,
      })
    }
    if (error) return null
    return (data || null) as UserRow | null
  }

  const queryByUsername = async () => {
    if (!username) return null
    const requestContext = createRequestContext('hoverCardService.userHoverResolve', 'fetch-user-row-by-username', {
      username,
    })
    const query = withAbortSignal(
      supabase
        .from('public_user_directory')
        .select(identityColumns)
        .eq('username', username)
        .maybeSingle(),
      signal,
    )
    const { data, error } = await query

    if (error && !isAbortError(error)) {
      userHoverResolveLogger.error({
        event: requestContext.event,
        message: 'kullanici satiri username ile alinamadi.',
        context: toRequestContextLogContext(requestContext),
        error,
      })
    }
    if (error) return null
    return (data || null) as UserRow | null
  }

  const identity = await queryById() || await queryByUsername()
  if (!identity) return null

  const requestContext = createRequestContext('hoverCardService.userHoverResolve', 'fetch-user-row-public-profile', {
    userId: identity.id,
    username: identity.username,
  })
  const { data, error } = await withAbortSignal(
    supabase.rpc('get_public_user_profile_by_id', {
      p_user_id: identity.id,
      p_include_social_links: false,
    }),
    signal,
  )

  if (error && !isAbortError(error)) {
    userHoverResolveLogger.error({
      event: requestContext.event,
      message: 'kullanici hover public profili alinamadi.',
      context: toRequestContextLogContext(requestContext),
      error,
    })
  }

  const publicProfile = takeFirstRelation(data) as Partial<UserRow> | null
  const publicProfileNameStyle = readRecord(publicProfile?.active_name_style)

  return {
    id: identity.id,
    username: identity.username,
    avatar_url: identity.avatar_url ?? null,
    bio: typeof publicProfile?.bio === 'string' ? publicProfile.bio : null,
    premium_expires_at: typeof publicProfile?.premium_expires_at === 'string' ? publicProfile.premium_expires_at : null,
    is_premium_active: publicProfile?.is_premium_active === true,
    active_name_style: publicProfileNameStyle,
    active_name_effect: readString(publicProfile?.active_name_effect),
    active_profile_effect_id: typeof publicProfile?.active_profile_effect_id === 'string'
      ? publicProfile.active_profile_effect_id
      : null,
    active_fansub_identity_tag: parseFansubIdentityTag(
      publicProfile?.active_fansub_identity_tag ?? identity.active_fansub_identity_tag ?? null,
    ),
    active_hover_theme: readRecord(publicProfile?.active_hover_theme),
  }
}

async function fetchResolvedUserHoverData(
  input: UserHoverFetchInput,
  signal?: AbortSignal,
): Promise<ResolvedUserHoverData | null> {
  const user = await fetchUserRow(input, signal)
  if (!user) return null

  const requestContext = createRequestContext('hoverCardService.userHoverResolve', 'fetch-user-hover-data', {
    userId: user.id,
    username: user.username,
  })

  const [followsRes, badgeRes, membershipsRes, cosmeticMap, profileEffectAssetMapResult] = await Promise.all([
    withAbortSignal(
      supabase
        .from('user_follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('following_id', user.id),
      signal,
    ),
    withAbortSignal(
      supabase
        .from('user_badges')
        .select(`
          badge_id,
          display_order,
          badge:badges (
            id,
            name,
            image_url,
            rarity
          )
        `)
        .eq('user_id', user.id)
        .eq('is_displayed', true)
        .order('display_order', { ascending: true })
        .limit(3),
      signal,
    ),
    withAbortSignal(
      supabase
        .from('fansub_members')
        .select(`
          fansub_id,
          role,
          team_tag,
          created_at,
          fansub:fansub_id (
            id,
            name,
            slug,
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('fansub.is_active', true)
        .order('created_at', { ascending: true })
        .limit(8),
      signal,
    ),
    buildCommentAuthorCosmeticMap([user.id]),
    user.active_profile_effect_id ? getStoreProfileEffectAssetMap([user.active_profile_effect_id]) : Promise.resolve({ data: new Map(), error: null }),
  ])

  if (followsRes.error && !isAbortError(followsRes.error)) {
    userHoverResolveLogger.error({
      event: requestContext.event,
      message: 'takipci sayisi alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'follows' }),
      error: followsRes.error,
    })
  }
  if (badgeRes.error && !isAbortError(badgeRes.error)) {
    userHoverResolveLogger.error({
      event: requestContext.event,
      message: 'rozetler alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'badges' }),
      error: badgeRes.error,
    })
  }
  if (membershipsRes.error && !isAbortError(membershipsRes.error)) {
    userHoverResolveLogger.error({
      event: requestContext.event,
      message: 'fansub uyelikleri alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'memberships' }),
      error: membershipsRes.error,
    })
  }

  const cosmetics = cosmeticMap.get(user.id)
  const publicNameTextStyle = resolvePublicNameTextStyle(user)
  const activeProfileEffectAssets = user.active_profile_effect_id ? profileEffectAssetMapResult.data.get(user.active_profile_effect_id) : null
  const displayedBadges = ((badgeRes.data || []) as UserDisplayedBadgeRow[])
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
    .reduce<ResolvedUserHoverData['displayedBadges']>((acc, row) => {
      const badge = takeFirstRelation(row.badge)
      if (!badge) return acc
      acc.push({
        id: badge.id || row.badge_id,
        name: badge.name || 'Rozet',
        imageUrl: resolveStoreAssetUrl(badge.image_url) || badge.image_url || '/badges/default.png',
        ...(badge.rarity ? { rarity: badge.rarity } : {}),
      })
      return acc
    }, [])
  const fansubMemberships = ((membershipsRes.data || []) as UserFansubMembershipRow[])
    .reduce<ResolvedUserHoverData['fansubMemberships']>((acc, row) => {
      const fansub = takeFirstRelation(row.fansub)
      if (!fansub) return acc
      acc.push({
        fansubId: row.fansub_id || fansub.id,
        fansubName: fansub.name || 'Bilinmeyen Fansub',
        ...(fansub.slug ? { fansubSlug: fansub.slug } : {}),
        role: row.role || 'member',
        ...(row.team_tag ? { teamTag: row.team_tag } : {}),
      })
      return acc
    }, [])
    .sort((a, b) => {
      const rank = { admin: 0, moderator: 1, member: 2 } as const
      const aRank = rank[a.role.trim().toLowerCase() as keyof typeof rank] ?? 99
      const bRank = rank[b.role.trim().toLowerCase() as keyof typeof rank] ?? 99
      if (aRank !== bRank) return aRank - bRank
      return a.fansubName.localeCompare(b.fansubName, 'tr')
    })

  return {
    id: user.id,
    username: user.username,
    displayName: user.username,
    activeFansubIdentityTag: user.active_fansub_identity_tag ?? null,
    avatar: user.avatar_url || getUserFallbackAvatar(user.username || user.id),
    bio: user.bio || undefined,
    followerCount: Number(followsRes.count || 0),
    frameType: cosmetics?.frameType,
    primaryColor: cosmetics?.primaryColor,
    secondaryColor: cosmetics?.secondaryColor,
    profileBackgroundStyle: cosmetics?.backgroundStyle,
    profileBackgroundVideoUrl: cosmetics?.backgroundVideoUrl,
    profilePatternStyle: cosmetics?.patternStyle,
    activeNameEffectId: publicNameTextStyle.activeNameEffectId,
    activeNameFontId: publicNameTextStyle.activeNameFontId,
    activeNameColorId: publicNameTextStyle.activeNameColorId,
    activeNameSecondaryColorId: publicNameTextStyle.activeNameSecondaryColorId,
    activeUserNameStyle: publicNameTextStyle.activeUserNameStyle,
    isPremiumActive: publicNameTextStyle.isPremiumActive,
    hoverTheme: publicNameTextStyle.isPremiumActive ? parseHoverCardTheme(user.active_hover_theme) : null,
    activeProfileEffectAssets: cloneStoreProfileEffectAssets(activeProfileEffectAssets),
    fansubMemberships,
    displayedBadges,
  }
}

export async function runUserHoverNetworkResolve(
  input: UserHoverFetchInput,
  cacheKey: string,
  signal?: AbortSignal,
): Promise<UserHoverResolveResult> {
  const requestContext = createRequestContext('hoverCardService.userHoverResolve', 'resolve-user-hover-network', {
    cacheKey,
    userId: input.userId || null,
    username: input.username || null,
  })
  const startedAt = nowMs()
  let durationMs = 0
  markUserHoverNetworkRequest()
  try {
    const data = await fetchResolvedUserHoverData(input, signal)
    durationMs = toDurationMs(startedAt)
    writeUserHoverCacheEntries(cacheKey, data)
    return {
      data,
      meta: {
        source: 'network',
        durationMs,
      },
    }
  } catch (error) {
    durationMs = toDurationMs(startedAt)
    if (!isAbortError(error)) {
      markUserHoverNetworkError()
      userHoverResolveLogger.error({
        event: requestContext.event,
        message: 'kullanici hover verisi ag uzerinden cozulemedi.',
        context: toRequestContextLogContext(requestContext, { durationMs }),
        error,
      })
    }
    throw error
  } finally {
    addUserHoverNetworkDuration(durationMs || toDurationMs(startedAt))
  }
}
