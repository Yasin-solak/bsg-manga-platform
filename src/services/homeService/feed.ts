import { buildFansubCardCosmeticMap } from '../fansubCosmeticService'
import {
  buildCommentAuthorCosmeticMap,
  buildFansubCosmeticMap,
  type CommunityCardCosmetics,
} from '../communityCosmeticService'
import { loadFansubLiteByIds } from '../fansubLiteDirectory'
import { createScopedLogger } from '../logger'
import { loadMangaLiteByIds } from '../mangaLiteDirectory'
import { getLatestMangas } from '../mangaService'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import {
  applyLastChapterFallback,
  type HomeFeedRpcResult,
  mapHomeFansub,
  mapHomeManga,
  mapHomePost,
  resolvePublicLastChapterByMangaIds,
} from './shared'
import type { CommunityPost, Manga } from '@/types'
import type { HomeFeedData, HomeFeedParams } from './types'

const homeFeedLogger = createScopedLogger('homeService.feed')

type HomeMangaDetailRow = {
  id: string
  description: string | null
  genres: string[] | null
  status: Manga['status'] | null
  rating: number | null
  total_ratings: number | null
  total_views: number | null
}

type HomePostAuthorCosmeticMaps = {
  users: Map<string, CommunityCardCosmetics>
  fansubs: Map<string, CommunityCardCosmetics>
}

function hydrateMangaSlugs<T extends { id: string; slug?: string }>(
  rows: T[],
  slugMap: Map<string, { slug: string }>,
) {
  return rows.map((row) => {
    if (row.slug) return row
    const hydrated = slugMap.get(row.id)?.slug
    return hydrated ? { ...row, slug: hydrated } : row
  })
}

async function loadHomeMangaDetailsByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  const details = new Map<string, Partial<Manga>>()
  if (uniqueIds.length === 0) return details

  const { data, error } = await supabase
    .from('mangas')
    .select('id, description, genres, status, rating, total_ratings, total_views')
    .eq('is_active', true)
    .eq('is_approved', true)
    .in('id', uniqueIds)

  if (error) {
    const requestContext = createRequestContext('homeService.feed', 'manga-detail-hydration')
    homeFeedLogger.warn({
      event: requestContext.event,
      message: 'homepage manga detaylari ek sorgudan okunamadi.',
      context: toRequestContextLogContext(requestContext, { mangaCount: uniqueIds.length }),
      error,
    })
    return details
  }

  ;((data || []) as HomeMangaDetailRow[]).forEach((row) => {
    details.set(row.id, {
      description: row.description || undefined,
      genres: Array.isArray(row.genres) ? row.genres : undefined,
      status: row.status || undefined,
      rating: row.rating ?? undefined,
      totalRatings: row.total_ratings ?? undefined,
      views: row.total_views ?? undefined,
    })
  })

  return details
}

function applyHomeMangaDetails(items: Manga[], details: Map<string, Partial<Manga>>) {
  return items.map((item) => {
    const detail = details.get(item.id)
    return detail ? { ...item, ...detail } : item
  })
}

function applyAuthorCosmetics(post: CommunityPost, cosmetics?: CommunityCardCosmetics): CommunityPost {
  if (!cosmetics) return post

  return {
    ...post,
    frameType: (cosmetics.frameType as CommunityPost['frameType']) ?? post.frameType,
    frameCustomOverlayUrl: cosmetics.frameOverlayUrl ?? post.frameCustomOverlayUrl,
    framePosterOverlayUrl: cosmetics.framePosterUrl ?? post.framePosterOverlayUrl,
    profileBackgroundStyle: cosmetics.backgroundStyle ?? post.profileBackgroundStyle,
    profileBackgroundVideoUrl: cosmetics.backgroundVideoUrl ?? post.profileBackgroundVideoUrl,
    profilePatternStyle: cosmetics.patternStyle ?? post.profilePatternStyle,
    primaryColor: cosmetics.primaryColor ?? post.primaryColor,
    secondaryColor: cosmetics.secondaryColor ?? post.secondaryColor,
  }
}

function applyAuthorCosmeticsToPosts(posts: CommunityPost[], maps: HomePostAuthorCosmeticMaps) {
  return posts.map((post) => {
    const cosmetics = post.authorType === 'fansub'
      ? (post.authorFansub?.id ? maps.fansubs.get(post.authorFansub.id) : undefined)
      : (post.authorUserId ? maps.users.get(post.authorUserId) : undefined)

    return applyAuthorCosmetics(post, cosmetics)
  })
}

/** Frame / background look of announcement authors (announcements render as cards). */
async function hydrateAnnouncementAuthorCosmetics(announcements: CommunityPost[]) {
  if (announcements.length === 0) return announcements

  const userIds = new Set<string>()
  const fansubIds = new Set<string>()
  announcements.forEach((post) => {
    if (post.authorType === 'fansub') {
      if (post.authorFansub?.id) fansubIds.add(post.authorFansub.id)
      return
    }

    if (post.authorUserId) userIds.add(post.authorUserId)
  })

  try {
    const [userCosmeticMap, fansubRowsById] = await Promise.all([
      buildCommentAuthorCosmeticMap(Array.from(userIds)),
      loadFansubLiteByIds(Array.from(fansubIds)),
    ])
    const fansubCosmeticMap = await buildFansubCosmeticMap(Array.from(fansubRowsById.values()))
    return applyAuthorCosmeticsToPosts(announcements, { users: userCosmeticMap, fansubs: fansubCosmeticMap })
  } catch (cosmeticError) {
    const requestContext = createRequestContext('homeService.feed', 'announcement-author-cosmetic-hydration')
    homeFeedLogger.warn({
      event: requestContext.event,
      message: 'homepage duyuru yazar cerceveleri ek sorgudan okunamadi.',
      context: toRequestContextLogContext(requestContext, { postCount: announcements.length }),
      error: cosmeticError,
    })

    return announcements
  }
}

export async function getHomePageFeed(params: HomeFeedParams = {}): Promise<HomeFeedData> {
  const {
    trendingLimit = 7,
    latestLimit = 14,
    fansubLimit = 6,
    announcementLimit = 5,
    sidebarPopularMangaLimit = 5,
  } = params

  const { data, error } = await supabase.rpc('get_homepage_feed', {
    p_trending_limit: trendingLimit,
    p_latest_limit: latestLimit,
    p_fansub_limit: fansubLimit,
    // Old community posts were removed; the parameter is 0 for signature compatibility.
    p_popular_post_limit: 0,
    p_announcement_limit: announcementLimit,
    p_sidebar_popular_manga_limit: sidebarPopularMangaLimit,
  })

  if (error) {
    throw error
  }

  const payload = (data || {}) as HomeFeedRpcResult
  const fansubRows = payload.fansubs || []
  const fansubCosmeticMap = await buildFansubCardCosmeticMap(fansubRows)
  const trendingFromRpc = (payload.trending_mangas || []).map(mapHomeManga)
  const sidebarPopularFromRpc = (payload.popular_mangas || []).map(mapHomeManga)
  let safeLatestMangas = (payload.latest_mangas || []).map(mapHomeManga)

  if (safeLatestMangas.length === 0) {
    try {
      safeLatestMangas = await getLatestMangas(latestLimit)
    } catch (latestError) {
      const requestContext = createRequestContext('homeService.feed', 'latest-manga-fallback')
      homeFeedLogger.warn({
        event: requestContext.event,
        message: 'rpc latest manga verisi bos geldigi icin fallback tetiklendi.',
        context: toRequestContextLogContext(requestContext, { latestLimit }),
        error: latestError,
      })
    }
  }

  const mangaSlugMap = await loadMangaLiteByIds([
    ...trendingFromRpc.map((manga) => manga.id),
    ...safeLatestMangas.map((manga) => manga.id),
    ...sidebarPopularFromRpc.map((manga) => manga.id),
  ])
  const hydratedTrendingMangas = hydrateMangaSlugs(trendingFromRpc, mangaSlugMap)
  const hydratedLatestMangas = hydrateMangaSlugs(safeLatestMangas, mangaSlugMap)
  const hydratedSidebarPopularMangas = hydrateMangaSlugs(sidebarPopularFromRpc, mangaSlugMap)
  const mangaDetailMap = await loadHomeMangaDetailsByIds([
    ...hydratedTrendingMangas.map((manga) => manga.id),
    ...hydratedLatestMangas.map((manga) => manga.id),
    ...hydratedSidebarPopularMangas.map((manga) => manga.id),
  ])

  const chapterFallbackMap = await resolvePublicLastChapterByMangaIds([
    ...hydratedTrendingMangas.map((manga) => manga.id),
    ...hydratedLatestMangas.map((manga) => manga.id),
    ...hydratedSidebarPopularMangas.map((manga) => manga.id),
  ])
  const announcements = await hydrateAnnouncementAuthorCosmetics((payload.announcements || []).map(mapHomePost))

  return {
    trendingMangas: applyLastChapterFallback(applyHomeMangaDetails(hydratedTrendingMangas, mangaDetailMap), chapterFallbackMap),
    latestMangas: applyLastChapterFallback(applyHomeMangaDetails(hydratedLatestMangas, mangaDetailMap), chapterFallbackMap),
    sidebarPopularMangas: applyLastChapterFallback(applyHomeMangaDetails(hydratedSidebarPopularMangas, mangaDetailMap), chapterFallbackMap),
    fansubs: fansubRows.map((row) => mapHomeFansub(row, fansubCosmeticMap.get(row.id))),
    announcements,
  }
}
