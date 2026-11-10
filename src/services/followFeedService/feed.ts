import { loadMangaLiteByIds } from '../mangaLiteDirectory'
import { loadFansubLiteByIds, type FansubLiteRow } from '../fansubLiteDirectory'
import { loadPublicUserDirectoryLiteByIds, type PublicUserDirectoryLiteRow } from '../publicUserDirectoryLite'
import { supabase } from '../supabase'
import {
  clearFollowFeedInFlight,
  getFollowFeedInFlight,
  readCachedFollowFeed,
  setFollowFeedInFlight,
  writeCachedFollowFeed,
} from './cache'
import { hydrateFollowFeedItem, logFollowFeedLatency, mapDbFollowActivityRow, toCacheKey } from './shared'
import type { DbFollowActivityRow, FollowActivityCursor, FollowActivityFeedResult, FollowActivityItem } from './types'

function hydrateActivityActor(
  item: FollowActivityItem,
  userMap: Map<string, PublicUserDirectoryLiteRow>,
  fansubMap: Map<string, FansubLiteRow>,
): FollowActivityItem {
  if (item.actorType === 'user' && item.actorUserId) {
    const user = userMap.get(item.actorUserId)
    if (!user) return item

    return {
      ...item,
      actorName: user.username || item.actorName,
      actorUsername: user.username || item.actorUsername,
      actorAvatarUrl: user.avatar_url || item.actorAvatarUrl,
      // The activity RPC may return an old snapshot; the public directory's current profile record is authoritative.
      actorFrameType: user.frame_type || undefined,
    }
  }

  if (item.actorType === 'fansub' && item.actorFansubId) {
    const fansub = fansubMap.get(item.actorFansubId)
    if (!fansub) return item

    return {
      ...item,
      actorName: fansub.name || item.actorName,
      actorUsername: fansub.slug || item.actorUsername,
      actorAvatarUrl: fansub.avatar_url || item.actorAvatarUrl,
      actorFrameType: fansub.active_frame_id
        ? (fansub.frame_type || item.actorFrameType)
        : (fansub.frame_type || undefined),
    }
  }

  return item
}

export async function listFollowedActivityFeed(params: {
  limit?: number
  cursor?: FollowActivityCursor | null
  viewerId?: string | null
  forceRefresh?: boolean
} = {}): Promise<FollowActivityFeedResult> {
  const safeLimit = Number.isFinite(params.limit)
    ? Math.min(Math.max(Math.floor(params.limit || 20), 1), 50)
    : 20

  const cursor = params.cursor || null
  const isFirstPage = cursor == null
  const normalizedViewerId = typeof params.viewerId === 'string' ? params.viewerId.trim() : ''
  const cacheKey = isFirstPage && normalizedViewerId ? toCacheKey(normalizedViewerId, safeLimit) : null
  const forceRefresh = params.forceRefresh === true

  if (cacheKey && !forceRefresh) {
    const cached = readCachedFollowFeed(cacheKey)
    if (cached) {
      logFollowFeedLatency('listFollowedActivityFeed cache hit', 0, {
        cached: true,
        itemCount: cached.items.length,
        limit: safeLimit,
      })
      return cached
    }

    const inFlight = getFollowFeedInFlight(cacheKey)
    if (inFlight) {
      return inFlight
    }
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const request = (async () => {
    const { data, error } = await supabase.rpc('get_followed_activity_feed', {
      p_limit: safeLimit,
      p_before_created_at: cursor?.createdAt || null,
      p_before_event_key: cursor?.eventKey || null,
    })

    if (error) {
      throw error
    }

    const rows = (data || []) as DbFollowActivityRow[]
    const baseItems = rows.map(mapDbFollowActivityRow)
    const mangaIds = baseItems
      .map((item) => item.mangaId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    const actorUserIds = baseItems
      .filter((item) => item.actorType === 'user')
      .map((item) => item.actorUserId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    const actorFansubIds = baseItems
      .filter((item) => item.actorType === 'fansub')
      .map((item) => item.actorFansubId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    const [mangaLiteMap, userLiteMap, fansubLiteMap] = await Promise.all([
      loadMangaLiteByIds(mangaIds),
      loadPublicUserDirectoryLiteByIds(actorUserIds),
      loadFansubLiteByIds(actorFansubIds),
    ])
    const items = baseItems.map((item) => {
      const hydratedActorItem = hydrateActivityActor(item, userLiteMap, fansubLiteMap)
      return hydrateFollowFeedItem(hydratedActorItem, item.mangaId ? mangaLiteMap.get(item.mangaId) : undefined)
    })
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null
    const result: FollowActivityFeedResult = {
      items,
      nextCursor: lastRow
        ? {
          createdAt: lastRow.created_at,
          eventKey: lastRow.event_key,
        }
        : null,
    }

    if (cacheKey) {
      writeCachedFollowFeed(cacheKey, result)
    }

    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    logFollowFeedLatency('listFollowedActivityFeed rpc', finishedAt - startedAt, {
      cached: false,
      itemCount: rows.length,
      limit: safeLimit,
      hasCursor: cursor != null,
    })

    return result
  })()

  if (cacheKey && !forceRefresh) {
    setFollowFeedInFlight(cacheKey, request)
  }

  try {
    return await request
  } finally {
    if (cacheKey) {
      clearFollowFeedInFlight(cacheKey)
    }
  }
}
