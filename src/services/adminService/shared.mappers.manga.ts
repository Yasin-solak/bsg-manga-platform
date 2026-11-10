import { EMPTY_CHAPTER_STATS } from './shared.constants'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import type {
  DbAdminChapterStatRow,
  DbAdminMangaChapterRow,
  DbAdminMangaCommentRow,
  DbAdminMangaControlRow,
  DbAdminMangaRatingRow,
  DbAdminMangaRow,
} from './shared.db'
import { getSingleRelation } from './shared.utils'
import type {
  AdminManagedManga,
  AdminMangaActorMini,
  AdminMangaChapterBrief,
  AdminMangaChapterStats,
  AdminMangaCommentItem,
  AdminMangaControlItem,
  AdminMangaRatingItem,
} from './types'

export function mapDbAdminManga(row: DbAdminMangaRow): AdminManagedManga | null {
  if (!row.fansub_id) return null
  return {
    id: row.id,
    fansubId: row.fansub_id,
    title: row.title,
    slug: row.slug,
    coverImageUrl: row.cover_image_url || buildCoverPlaceholder(row.title),
    status: row.status,
    isApproved: row.is_approved === true,
    isActive: row.is_active !== false,
    totalViews: row.total_views || 0,
    lastChapterNumber: row.last_chapter_number ?? null,
    updatedAt: row.updated_at,
  }
}

function mergeChapterStats(base: AdminMangaChapterStats, row: DbAdminChapterStatRow) {
  base.total += 1
  if (row.is_approved === true) base.approved += 1
  else base.pending += 1
  if (row.is_active !== false) base.active += 1
}

export function mapDbMangaChapterStats(rows: DbAdminChapterStatRow[]) {
  const statsByMangaId = new Map<string, AdminMangaChapterStats>()
  rows.forEach((row) => {
    const prev = statsByMangaId.get(row.manga_id) || { ...EMPTY_CHAPTER_STATS }
    mergeChapterStats(prev, row)
    statsByMangaId.set(row.manga_id, prev)
  })
  return statsByMangaId
}

export function mapDbAdminMangaControl(
  row: DbAdminMangaControlRow,
  chapterStatsByMangaId: Map<string, AdminMangaChapterStats>,
  followerCountByMangaId: Map<string, number> = new Map(),
  creatorByFansubId: Map<string, AdminMangaActorMini> = new Map(),
): AdminMangaControlItem {
  const fansub = getSingleRelation(row.fansub)
  const creatorUser = row.fansub_id ? creatorByFansubId.get(row.fansub_id) : undefined
  return {
    id: row.id,
    fansubId: row.fansub_id || '',
    fansubName: fansub?.name || '-',
    fansubSlug: fansub?.slug || '-',
    title: row.title,
    slug: row.slug,
    coverImageUrl: row.cover_image_url || buildCoverPlaceholder(row.title),
    description: row.description || '',
    status: row.status,
    isApproved: row.is_approved === true,
    isActive: row.is_active !== false,
    isNew: row.is_new === true,
    totalViews: row.total_views || 0,
    followerCount: followerCountByMangaId.get(row.id) || 0,
    totalRatings: row.total_ratings || 0,
    rating: row.rating ?? null,
    genres: row.genres || [],
    seriesType: (row.series_type as AdminMangaControlItem['seriesType']) || 'manga',
    isMature: row.is_mature ?? false,
    lastChapterNumber: row.last_chapter_number ?? null,
    chapterStats: chapterStatsByMangaId.get(row.id) || { ...EMPTY_CHAPTER_STATS },
    creatorUser,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDbAdminMangaChapter(row: DbAdminMangaChapterRow): AdminMangaChapterBrief {
  const fansub = getSingleRelation(row.fansub)
  return {
    id: row.id,
    fansubId: row.fansub_id ?? undefined,
    fansubName: fansub?.name || '-',
    fansubSlug: fansub?.slug || '-',
    chapterNumber: Number(row.chapter_number),
    title: row.title || undefined,
    isApproved: row.is_approved === true,
    isActive: row.is_active !== false,
    publishAt: row.publish_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDbAdminMangaComment(row: DbAdminMangaCommentRow): AdminMangaCommentItem {
  const user = getSingleRelation(row.user)
  return {
    id: row.id,
    mangaId: row.manga_id,
    userId: row.user_id,
    username: user?.username || 'Bilinmeyen Kullanici',
    avatarUrl: user?.avatar_url || undefined,
    parentId: row.parent_id ?? undefined,
    content: row.content || '',
    likes: row.likes || 0,
    isActive: row.is_active !== false,
    isPinned: row.is_pinned === true,
    isSpoiler: row.is_spoiler === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDbAdminMangaRating(row: DbAdminMangaRatingRow): AdminMangaRatingItem {
  const user = getSingleRelation(row.user)
  return {
    mangaId: row.manga_id,
    userId: row.user_id,
    username: user?.username || 'Bilinmeyen Kullanici',
    avatarUrl: user?.avatar_url || undefined,
    rating: Number(row.rating || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
