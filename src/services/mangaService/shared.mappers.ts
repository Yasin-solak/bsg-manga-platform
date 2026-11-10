import type { Chapter, ChapterFansub, Manga } from '@/types'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { resolveChapterPageUrl } from '../assetUrlService'
import { buildChapterPageRatios, sanitizeChapterPageDimensionMap } from '@/lib/chapterPageDimensions'
import type {
  DbChapter,
  DbChapterFansubRow,
  DbManga,
  DbPendingContentRevisionRow,
  PendingRevisionMap,
} from './shared.types'
import { txa } from '@/i18n/activeLocale'

export function mapDbManga(row: DbManga): Manga {
  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    coverImage:
      row.cover_image_url
      ?? buildCoverPlaceholder(row.title),
    lastChapter:
      row.last_chapter_number != null ? txa('{v1}. Bolum', { v1: row.last_chapter_number }) : undefined,
    isNew: row.is_new ?? undefined,
    rating: row.rating ?? undefined,
    totalRatings: row.total_ratings ?? undefined,
    description: row.description ?? undefined,
    status: row.status as Manga['status'] | undefined,
    views: row.total_views ?? undefined,
    followerCount: row.follower_count ?? undefined,
    genres: row.genres || undefined,
    seriesType: (row.series_type as Manga['seriesType']) ?? undefined,
    isMature: row.is_mature ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDbChapter(row: DbChapter): Chapter {
  // The ref list is extracted once: page URLs and dimension ratios must derive from the SAME
  // list, or indexes shift after filtering.
  const pageRefs = Array.isArray(row.pages)
    ? row.pages.filter((page): page is string => typeof page === 'string' && page.trim().length > 0)
    : []

  return {
    id: row.id,
    mangaId: row.manga_id,
    chapterNumber: Number(row.chapter_number),
    title: row.title || undefined,
    notes: row.notes || undefined,
    pages: pageRefs.map((page) => resolveChapterPageUrl(page) || page),
    // Ratios for reserving space; null for an unknown page (the reader fills it by measuring).
    pageRatios: buildChapterPageRatios(pageRefs, sanitizeChapterPageDimensionMap(row.page_dimensions)),
    publishAt: row.publish_at || undefined,
    isApproved: row.is_approved ?? undefined,
    isActive: row.is_active ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapDbChapterFansub(row?: DbChapterFansubRow | null): ChapterFansub | undefined {
  if (!row?.id || !row?.name || !row?.slug) return undefined
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatar: row.avatar_url || undefined,
    activeNameStyle: (row.active_name_style ?? undefined) as ChapterFansub['activeNameStyle'],
  }
}

export function mapLatestPendingRevisions(
  rows: DbPendingContentRevisionRow[],
): PendingRevisionMap {
  const map: PendingRevisionMap = new Map()
  rows.forEach((row) => {
    const key = `${row.target_type}:${row.target_id}`
    if (!map.has(key)) {
      map.set(key, row)
    }
  })
  return map
}
