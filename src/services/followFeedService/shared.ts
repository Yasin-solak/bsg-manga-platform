import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import type { MangaLiteRow } from '../mangaLiteDirectory'
import type { DbFollowActivityRow, FollowActivityFeedResult, FollowActivityItem } from './types'

export function mapDbFollowActivityRow(row: DbFollowActivityRow): FollowActivityItem {
  return {
    id: row.event_key,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorUserId: row.actor_user_id || undefined,
    actorFansubId: row.actor_fansub_id || undefined,
    actorName: row.actor_name || 'Bilinmeyen',
    actorUsername: row.actor_username || undefined,
    actorAvatarUrl: row.actor_avatar_url || undefined,
    actorFrameType: row.actor_frame_type || undefined,
    mangaId: row.manga_id || undefined,
    mangaTitle: row.manga_title || undefined,
    mangaCoverImageUrl: row.manga_cover_image_url || undefined,
    chapterId: row.chapter_id || undefined,
    chapterNumber: row.chapter_number != null ? Number(row.chapter_number) : undefined,
    commentId: row.comment_id || undefined,
    routeHint: row.route_hint || undefined,
    summary: row.summary || 'Yeni aktivite',
    createdAt: row.created_at,
  }
}

function buildCanonicalFollowRouteHint(
  item: FollowActivityItem,
  mangaLite?: MangaLiteRow,
) {
  const mangaId = mangaLite?.id || item.mangaId
  const mangaSlug = mangaLite?.slug || item.mangaSlug
  const mangaTitle = mangaLite?.title || item.mangaTitle

  if (item.chapterNumber != null) {
    return buildPublicChapterPath({
      chapterId: item.chapterId,
      chapterNumber: item.chapterNumber,
      mangaId,
      mangaSlug,
      mangaTitle,
      fansubSlug: item.actorType === 'fansub' ? item.actorUsername : undefined,
    })
  }

  if (mangaId || mangaSlug || mangaTitle) {
    return buildPublicMangaPath({
      id: mangaId,
      slug: mangaSlug,
      title: mangaTitle,
    })
  }

  return item.routeHint
}

export function hydrateFollowFeedItem(
  item: FollowActivityItem,
  mangaLite?: MangaLiteRow,
): FollowActivityItem {
  return {
    ...item,
    mangaSlug: mangaLite?.slug || item.mangaSlug,
    routeHint: buildCanonicalFollowRouteHint(item, mangaLite),
  }
}

export function cloneFollowFeedResult(result: FollowActivityFeedResult): FollowActivityFeedResult {
  return {
    items: result.items.slice(),
    nextCursor: result.nextCursor
      ? {
        createdAt: result.nextCursor.createdAt,
        eventKey: result.nextCursor.eventKey,
      }
      : null,
  }
}

export function toCacheKey(viewerId: string, safeLimit: number) {
  return `${viewerId}:${safeLimit}`
}

export function logFollowFeedLatency(label: string, durationMs: number, detail: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.debug('[followFeedService] ' + label, {
    durationMs: Math.round(durationMs),
    ...detail,
  })
}
