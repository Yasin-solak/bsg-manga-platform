import { parseHoverCardTheme } from '@/components/common/hoverCardTheme'
import { cloneStoreProfileEffectAssets } from '@/data/storeProducts'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { resolveStoreAssetUrl } from '../assetUrlService'
import { buildFansubCosmeticMap } from '../communityCosmeticService'
import { getPublicFansubBoostSnapshot } from '../fansubBoostService'
import { getStoreProfileEffectAssetMap } from '../storeProfileEffectService'
import { supabase } from '../supabase'
import {
  FANSUB_ACTIVE_WINDOW_DAYS,
  getFansubFallbackAvatar,
  isAbortError,
  parseIsoTimestamp,
  takeFirstRelation,
  withAbortSignal,
} from './shared'
import { fetchFansubRow } from './fansubHover.resolve.row'
import type {
  FansubDisplayedBadgeRow,
  FansubHoverFetchInput,
  FansubLatestChapterRow,
  ResolvedFansubHoverData,
} from './types'

const fansubHoverDataLogger = createScopedLogger('hoverCardService.fansubHoverData')

type FansubStatsRow = {
  manga_count?: number | string | null
  follower_count?: number | string | null
}

type FansubPublicChapterStatsRow = {
  manga_id?: string | null
}

function normalizePublicCount(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

export async function fetchResolvedFansubHoverData(
  input: FansubHoverFetchInput,
  signal?: AbortSignal,
): Promise<ResolvedFansubHoverData | null> {
  const fansub = await fetchFansubRow(input, signal)
  if (!fansub) return null

  const requestContext = createRequestContext('hoverCardService.fansubHoverData', 'fetch-fansub-hover-data', {
    fansubId: fansub.id,
    slug: fansub.slug || null,
  })
  const nowIso = new Date().toISOString()

  const [cosmeticMap, profileEffectAssetMapResult, snapshotResult, statsRes, chapterStatsRes, badgeRes, latestChapterRes] = await Promise.all([
    buildFansubCosmeticMap([
      {
        id: fansub.id,
        frame_type: fansub.frame_type,
        custom_background_asset_url: fansub.custom_background_asset_url,
        active_frame_id: fansub.active_frame_id,
        active_background_id: fansub.active_background_id,
        active_pattern_id: fansub.active_pattern_id,
        primary_color: fansub.primary_color,
        secondary_color: fansub.secondary_color,
      },
    ]),
    fansub.active_profile_effect_id
      ? getStoreProfileEffectAssetMap([fansub.active_profile_effect_id])
      : Promise.resolve({ data: new Map(), error: null }),
    getPublicFansubBoostSnapshot(fansub.id, signal).catch(() => null),
    withAbortSignal(
      supabase
        .rpc('get_fansubs_with_stats')
        .eq('id', fansub.id)
        .maybeSingle(),
      signal,
    ),
    withAbortSignal(
      supabase
        .from('chapters')
        .select('manga_id, manga:manga_id!inner(id)')
        .eq('fansub_id', fansub.id)
        .eq('is_active', true)
        .eq('is_approved', true)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .lte('publish_at', nowIso)
        .limit(5000),
      signal,
    ),
    withAbortSignal(
      supabase
        .from('fansub_badges')
        .select(`
          badge_id,
          display_order,
          badge:badges(
            id,
            name,
            image_url,
            rarity
          )
        `)
        .eq('fansub_id', fansub.id)
        .eq('is_displayed', true)
        .order('display_order', { ascending: true })
        .limit(3),
      signal,
    ),
    withAbortSignal(
      supabase
        .from('chapters')
        .select(`
          id,
          chapter_number,
          title,
          publish_at,
          created_at,
          manga_id,
          manga:manga_id!inner(
            id,
            title,
            slug,
            is_active,
            is_approved
          )
        `)
        .eq('fansub_id', fansub.id)
        .eq('is_active', true)
        .eq('is_approved', true)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .lte('publish_at', nowIso)
        .order('publish_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      signal,
    ),
  ])

  if (statsRes.error && !isAbortError(statsRes.error)) {
    fansubHoverDataLogger.error({
      event: requestContext.event,
      message: 'fansub hover istatistik verisi alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'stats' }),
      error: statsRes.error,
    })
  }
  if (chapterStatsRes.error && !isAbortError(chapterStatsRes.error)) {
    fansubHoverDataLogger.error({
      event: requestContext.event,
      message: 'fansub hover bolum istatistigi alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'chapter-stats' }),
      error: chapterStatsRes.error,
    })
  }
  if (badgeRes.error && !isAbortError(badgeRes.error)) {
    fansubHoverDataLogger.error({
      event: requestContext.event,
      message: 'fansub badge verisi alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'badges' }),
      error: badgeRes.error,
    })
  }
  if (latestChapterRes.error && !isAbortError(latestChapterRes.error)) {
    fansubHoverDataLogger.error({
      event: requestContext.event,
      message: 'son bolum verisi alinamadi.',
      context: toRequestContextLogContext(requestContext, { surface: 'latest-chapter' }),
      error: latestChapterRes.error,
    })
  }
  const cosmetics = cosmeticMap.get(fansub.id)
  const statsRow = (statsRes.data || null) as FansubStatsRow | null
  const publicChapterStatsAvailable = !chapterStatsRes.error
  const translatedMangaCount = new Set(
    ((chapterStatsRes.data || []) as FansubPublicChapterStatsRow[])
      .map((row) => (row.manga_id || '').trim())
      .filter(Boolean),
  ).size
  const resolvedMangaCount = publicChapterStatsAvailable
    ? translatedMangaCount
    : normalizePublicCount(statsRow?.manga_count ?? fansub.manga_count)
  const resolvedFollowerCount = normalizePublicCount(statsRow?.follower_count ?? fansub.follower_count)
  const activeProfileEffectAssets = fansub.active_profile_effect_id
    ? profileEffectAssetMapResult.data.get(fansub.active_profile_effect_id)
    : null
  const boostCapabilities = snapshotResult?.capabilities ?? null

  const displayedBadges: ResolvedFansubHoverData['displayedBadges'] = ((badgeRes.data || []) as FansubDisplayedBadgeRow[])
    .flatMap((row) => {
      const badge = takeFirstRelation(row.badge)
      if (!badge?.id || !badge.name) return []
      const badgeImage = resolveStoreAssetUrl(badge.image_url || '') || badge.image_url || '/badges/default.png'
      const mappedBadge: ResolvedFansubHoverData['displayedBadges'][number] = {
        id: badge.id,
        name: badge.name,
        imageUrl: badgeImage,
      }
      if (badge.rarity) mappedBadge.rarity = badge.rarity
      return [mappedBadge]
    })

  let latestContent: ResolvedFansubHoverData['latestContent'] | undefined
  const latestChapter = (latestChapterRes.data || null) as FansubLatestChapterRow | null
  if (latestChapter) {
    const manga = takeFirstRelation(latestChapter.manga)
    const mangaId = (manga?.id || latestChapter.manga_id || '').trim()
    const mangaSlug = (manga?.slug || '').trim() || undefined
    const mangaTitle = (manga?.title || '').trim()
    if (mangaId && mangaTitle) {
      const rawChapterNumber =
        typeof latestChapter.chapter_number === 'number' && Number.isFinite(latestChapter.chapter_number)
          ? Number(latestChapter.chapter_number)
          : undefined
      const chapterNumber = rawChapterNumber != null ? rawChapterNumber : undefined
      const chapterTitle = (latestChapter.title || '').trim() || undefined
      latestContent = {
        mangaId,
        mangaSlug,
        mangaTitle,
        chapterNumber,
        chapterTitle,
        createdAt: latestChapter.publish_at || latestChapter.created_at,
      }
    }
  }

  const latestActivityAt = latestContent?.createdAt
  const latestActivityTimestamp = parseIsoTimestamp(latestActivityAt)
  const activeWindowMs = FANSUB_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const participationStatus: ResolvedFansubHoverData['participationStatus'] =
    latestActivityTimestamp !== null && (Date.now() - latestActivityTimestamp) <= activeWindowMs
      ? 'active'
      : 'passive'

  return {
    id: fansub.id,
    slug: fansub.slug || undefined,
    name: fansub.name,
    avatar: fansub.avatar_url || getFansubFallbackAvatar(fansub.slug || fansub.id),
    description: fansub.description || undefined,
    mangaCount: resolvedMangaCount,
    followerCount: resolvedFollowerCount,
    hasFullNameStyle: boostCapabilities?.hasFullNameStyle === true,
    canUploadStaticBackground: boostCapabilities?.canUploadStaticBackground === true,
    canUploadVideoBackground: boostCapabilities?.canUploadVideoBackground === true,
    canUseHoverTheme: boostCapabilities?.canUseHoverTheme === true,
    hoverTheme: boostCapabilities?.canUseHoverTheme === true ? parseHoverCardTheme(fansub.hover_theme) : null,
    activeNameStyle: (fansub.active_name_style || undefined) as ResolvedFansubHoverData['activeNameStyle'],
    frameType: cosmetics?.frameType || fansub.frame_type || undefined,
    primaryColor: cosmetics?.primaryColor || fansub.primary_color || undefined,
    secondaryColor: cosmetics?.secondaryColor || fansub.secondary_color || undefined,
    profileBackgroundStyle: cosmetics?.backgroundStyle,
    profileBackgroundVideoUrl: cosmetics?.backgroundVideoUrl,
    profilePatternStyle: cosmetics?.patternStyle,
    activeProfileEffectAssets: cloneStoreProfileEffectAssets(activeProfileEffectAssets),
    latestContent,
    participationStatus,
    participationUpdatedAt: latestActivityAt,
    displayedBadges,
  }
}
