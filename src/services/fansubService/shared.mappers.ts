import type { FansubCardCosmetics } from '../fansubCosmeticService'
import { parseProfileTheme } from '@/lib/profileTheme'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import type {
  DbFansub,
  DbFansubRequest,
  DbManga,
  Fansub,
  FansubRequest,
  FansubRequestMeta,
  Manga,
} from './shared.types'
import { txa } from '@/i18n/activeLocale'

export function mapDbFansubRequest(row: DbFansubRequest): FansubRequest {
  const requesterRow = Array.isArray(row.requester) ? row.requester[0] : row.requester

  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    requestedName: row.requested_name,
    requestedSlug: row.requested_slug,
    requestedAvatarUrl: row.requested_avatar_url ?? undefined,
    requestedDescription: row.requested_description ?? undefined,
    requestedPrimaryColor: row.requested_primary_color ?? undefined,
    requestedSecondaryColor: row.requested_secondary_color ?? undefined,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdFansubId: row.created_fansub_id ?? undefined,
    requestMeta: (row.request_meta ?? undefined) as FansubRequestMeta | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requester: requesterRow
      ? {
          id: requesterRow.id,
          username: requesterRow.username,
          avatarUrl: requesterRow.avatar_url ?? undefined,
        }
      : undefined,
  }
}

export function mapDbFansub(row: DbFansub, cosmetics?: FansubCardCosmetics): Fansub {
  const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${row.slug}`
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatar: row.avatar_url ?? fallbackAvatar,
    description: row.description ?? undefined,
    discordInviteUrl: row.discord_invite_url ?? undefined,
    mangaCount: row.manga_count ?? 0,
    followerCount: row.follower_count ?? 0,
    hasDiscoverBadge: row.has_discover_badge === true,
    hasGoldFrame: row.has_gold_frame === true,
    hasFullNameStyle: row.has_full_name_style === true,
    canUploadStaticBackground: row.can_upload_static_background === true,
    canUploadVideoBackground: row.can_upload_video_background === true,
    frameType: cosmetics?.frameType ?? (row.frame_type as Fansub['frameType']) ?? 'default',
    primaryColor: cosmetics?.primaryColor ?? row.primary_color ?? undefined,
    secondaryColor: cosmetics?.secondaryColor ?? row.secondary_color ?? undefined,
    customBackgroundAssetUrl: row.custom_background_asset_url ?? undefined,
    activeNameStyle: (row.active_name_style ?? undefined) as Fansub['activeNameStyle'],
    hoverTheme: parseProfileTheme(row.hover_theme) ?? undefined,
    frameCustomOverlayUrl: cosmetics?.frameCustomOverlayUrl,
    framePosterOverlayUrl: cosmetics?.framePosterOverlayUrl,
    profileBackgroundStyle: cosmetics?.profileBackgroundStyle,
    profileBackgroundVideoUrl: cosmetics?.profileBackgroundVideoUrl,
    profilePatternStyle: cosmetics?.profilePatternStyle,
    activeFrameId: row.active_frame_id ?? undefined,
    activeBackgroundId: row.active_background_id ?? undefined,
    activePatternId: row.active_pattern_id ?? undefined,
    activeProfileEffectId: row.active_profile_effect_id ?? undefined,
    vanitySlugChangedAt: row.vanity_slug_changed_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    coinBalance: row.coin_balance ?? undefined,
  }
}

export function mapDbManga(row: DbManga): Manga {
  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    coverImage:
      row.cover_image_url
      ?? buildCoverPlaceholder(row.title),
    lastChapter: row.last_chapter_number != null ? txa('{v1}. Bolum', { v1: row.last_chapter_number }) : undefined,
    isNew: row.is_new ?? undefined,
    rating: row.rating ?? undefined,
    description: row.description ?? undefined,
    status: row.status ?? undefined,
    views: row.total_views ?? undefined,
    createdAt: undefined,
    updatedAt: undefined,
  }
}


