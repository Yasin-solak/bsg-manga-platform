import type { CommunityCardCosmetics } from '../communityCosmeticService'
import type {
  MangaListDetail,
  MangaListItem,
  MangaListSummary,
} from './types'
import type {
  DbMangaListItemRow,
  DbMangaListRow,
  DbTopMangaListRow,
} from './shared.types'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import {
  mapDbMangaToListCover,
  toSingleRow,
} from './shared.utils'
import { txa } from '@/i18n/activeLocale'

export function mapDbMangaListRow(
  row: DbMangaListRow,
  cosmetics?: CommunityCardCosmetics,
): MangaListSummary {
  const owner = toSingleRow(row.users)
  const cover = mapDbMangaToListCover(toSingleRow(row.cover_manga))

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    isPublic: row.is_public === true,
    ownerId: row.owner_id,
    ownerUsername: owner?.username || 'Anonim',
    ownerAvatar: owner?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.owner_id}`,
    ownerFrameType: cosmetics?.frameType || owner?.frame_type || 'default',
    ownerProfileBackgroundStyle: cosmetics?.backgroundStyle,
    ownerProfileBackgroundVideoUrl: cosmetics?.backgroundVideoUrl,
    ownerProfilePatternStyle: cosmetics?.patternStyle,
    categoryId: row.category_id || undefined,
    coverMangaId: row.cover_manga_id || cover.id,
    coverMangaTitle: cover.title,
    coverMangaSlug: cover.slug,
    coverImage: cover.coverImage,
    previewImages: cover.coverImage ? [cover.coverImage] : [],
    itemsCount: Number(row.items_count || 0),
    ratingsCount: Number(row.ratings_count || 0),
    ratingAvg: Number(row.rating_avg || 0),
    commentsCount: Number(row.comments_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

export function mapDbTopMangaListRow(row: DbTopMangaListRow): MangaListSummary {
  return {
    id: row.list_id,
    title: row.title,
    description: row.description || '',
    isPublic: true,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username || 'Anonim',
    ownerAvatar: row.owner_avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.owner_id}`,
    ownerFrameType: 'default',
    categoryId: row.category_id || undefined,
    coverMangaId: row.cover_manga_id || undefined,
    coverMangaTitle: row.cover_manga_title || undefined,
    coverMangaSlug: row.cover_manga_slug || undefined,
    coverImage: row.cover_image_url || undefined,
    previewImages: row.cover_image_url ? [row.cover_image_url] : [],
    itemsCount: Number(row.items_count || 0),
    ratingsCount: Number(row.ratings_count || 0),
    ratingAvg: Number(row.rating_avg || 0),
    commentsCount: Number(row.comments_count || 0),
    periodRatingCount: Number(row.period_rating_count || 0),
    periodCommentCount: Number(row.period_comment_count || 0),
    score: Number(row.score || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  }
}

export function mapDbMangaListItemRow(row: DbMangaListItemRow): MangaListItem | null {
  const manga = toSingleRow(row.mangas)
  if (!manga?.id || !manga.title) return null

  return {
    id: row.id,
    mangaId: manga.id,
    position: Number(row.position || 0),
    note: row.note || undefined,
    title: manga.title,
    slug: manga.slug || undefined,
    coverImage:
      manga.cover_image_url ||
      buildCoverPlaceholder(manga.title),
    lastChapter:
      manga.last_chapter_number != null
        ? txa('{v1}. Bolum', { v1: manga.last_chapter_number })
        : undefined,
    isNew: manga.is_new ?? undefined,
    rating: manga.rating ?? undefined,
    views: manga.total_views ?? undefined,
    genres: Array.isArray(manga.genres) ? manga.genres : undefined,
  }
}

export function buildMangaListDetail(
  listRow: DbMangaListRow,
  items: MangaListItem[],
  myRating: number | null,
  canEdit: boolean,
  cosmetics?: CommunityCardCosmetics,
): MangaListDetail {
  const summary = mapDbMangaListRow(listRow, cosmetics)
  return {
    ...summary,
    isPublic: listRow.is_public,
    items,
    myRating,
    canEdit,
  }
}
