import type { CommunityPost, Fansub, Manga } from '@/types'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildFansubAvatarPlaceholder } from '@/lib/fansubAvatarPlaceholder'
import type { FansubCardCosmetics } from '../fansubCosmeticService'
import type {
  HomeDiscussionHighlightChapter,
  HomeDiscussionHighlightManga,
} from './types'
import type {
  DbDiscussionChapterRow,
  DbDiscussionMangaRow,
  DbHomeFansub,
  DbHomeManga,
  DbHomePost,
} from './shared.types'
import { txa } from '@/i18n/activeLocale'

export function mapHomeManga(row: DbHomeManga): Manga {
  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    coverImage:
      row.cover_image_url ??
      buildCoverPlaceholder(row.title),
    lastChapter: row.last_chapter_number != null ? txa('{v1}. Bolum', { v1: row.last_chapter_number }) : undefined,
    isNew: row.is_new ?? undefined,
    rating: row.rating ?? undefined,
    totalRatings: row.total_ratings ?? undefined,
    description: row.description || undefined,
    genres: Array.isArray(row.genres) ? row.genres : undefined,
    status: row.status || undefined,
    views: row.total_views ?? undefined,
    updatedAt: row.updated_at,
  }
}

export function mapHomeFansub(row: DbHomeFansub, cosmetics?: FansubCardCosmetics): Fansub {
  const fallbackAvatar = buildFansubAvatarPlaceholder(
    row.name,
    cosmetics?.primaryColor ?? row.primary_color,
    cosmetics?.secondaryColor ?? row.secondary_color,
  )
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatar: row.avatar_url ?? fallbackAvatar,
    description: row.description ?? undefined,
    frameType: cosmetics?.frameType ?? (row.frame_type as Fansub['frameType']) ?? 'default',
    primaryColor: cosmetics?.primaryColor ?? row.primary_color ?? undefined,
    secondaryColor: cosmetics?.secondaryColor ?? row.secondary_color ?? undefined,
    customBackgroundAssetUrl: row.custom_background_asset_url ?? undefined,
    hasFullNameStyle: row.has_full_name_style === true,
    canUploadStaticBackground: row.can_upload_static_background === true,
    canUploadVideoBackground: row.can_upload_video_background === true,
    profileBackgroundStyle: cosmetics?.profileBackgroundStyle,
    profileBackgroundVideoUrl: cosmetics?.profileBackgroundVideoUrl,
    profilePatternStyle: cosmetics?.profilePatternStyle,
    mangaCount: row.manga_count ?? 0,
    followerCount: row.follower_count ?? 0,
    activeFrameId: row.active_frame_id ?? undefined,
    activeBackgroundId: row.active_background_id ?? undefined,
    activePatternId: row.active_pattern_id ?? undefined,
  }
}

export function mapHomePost(row: DbHomePost): CommunityPost {
  const isFansubAuthor = Boolean(row.related_fansub_id && row.fansub_slug)
  const username = isFansubAuthor
    ? (row.fansub_slug || row.username || 'fansub')
    : (row.username || 'Anonim')
  const displayName = isFansubAuthor
    ? (row.fansub_name || username)
    : username
  const avatar = isFansubAuthor
    ? (
      row.fansub_avatar_url
      || row.avatar_url
      || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(row.fansub_slug || row.related_fansub_id || username)}`
    )
    : (
      row.avatar_url
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.author_id}`
    )
  return {
    id: row.id,
    username,
    displayName,
    avatar,
    authorType: isFansubAuthor ? 'fansub' : 'user',
    authorUserId: row.author_id,
    authorFansub: isFansubAuthor && row.related_fansub_id
      ? {
        id: row.related_fansub_id,
        name: row.fansub_name || displayName,
        slug: row.fansub_slug || username,
        avatar: row.fansub_avatar_url || undefined,
      }
      : undefined,
    category: row.category || undefined,
    title: row.title || undefined,
    description: row.body || undefined,
    likes: row.likes_count ?? 0,
    comments: row.comments_count ?? 0,
    primaryColor: row.primary_color || undefined,
    secondaryColor: row.secondary_color || undefined,
    profileBackgroundStyle: row.profile_background_style || undefined,
    profileBackgroundVideoUrl: row.profile_background_video_url || undefined,
    profilePatternStyle: row.profile_pattern_style || undefined,
    frameType: (row.frame_type as CommunityPost['frameType']) ?? undefined,
    frameCustomOverlayUrl: row.frame_custom_overlay_url || undefined,
    framePosterOverlayUrl: row.frame_poster_overlay_url || undefined,
    isVerified: !!row.is_verified,
    createdAt: row.created_at || undefined,
  }
}

export function mapDiscussionManga(row: DbDiscussionMangaRow): HomeDiscussionHighlightManga {
  return {
    mangaId: row.manga_id,
    mangaTitle: row.manga_title,
    mangaSlug: row.manga_slug || undefined,
    coverImageUrl:
      row.cover_image_url ??
      buildCoverPlaceholder(row.manga_title),
    commentCount: Number(row.comment_count || 0),
    recentCommentCount: Number(row.recent_comment_count || 0),
    lastCommentAt: row.last_comment_at || undefined,
  }
}

export function mapDiscussionChapter(row: DbDiscussionChapterRow): HomeDiscussionHighlightChapter {
  return {
    chapterId: row.chapter_id,
    mangaId: row.manga_id,
    mangaTitle: row.manga_title,
    mangaSlug: row.manga_slug || undefined,
    chapterNumber: Number(row.chapter_number),
    chapterTitle: row.chapter_title || undefined,
    coverImageUrl:
      row.cover_image_url ??
      buildCoverPlaceholder(row.manga_title),
    commentCount: Number(row.comment_count || 0),
    recentCommentCount: Number(row.recent_comment_count || 0),
    lastCommentAt: row.last_comment_at || undefined,
  }
}
