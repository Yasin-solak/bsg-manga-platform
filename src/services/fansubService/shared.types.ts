import type { Fansub, Manga } from '@/types'

export interface DbFansub {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  description: string | null
  discord_invite_url: string | null
  frame_type: string | null
  primary_color: string | null
  secondary_color: string | null
  custom_background_asset_url: string | null
  active_name_style: Record<string, unknown> | null
  hover_theme?: Record<string, unknown> | null
  manga_count: number | null
  follower_count: number | null
  has_discover_badge?: boolean | null
  has_gold_frame?: boolean | null
  has_full_name_style?: boolean | null
  can_upload_static_background?: boolean | null
  can_upload_video_background?: boolean | null
  active_frame_id: string | null
  active_background_id: string | null
  active_pattern_id: string | null
  active_profile_effect_id: string | null
  vanity_slug_changed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  coin_balance?: number | null
}

export interface DbManga {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  cover_image_url: string | null
  description: string | null
  status: 'ongoing' | 'completed' | 'hiatus' | null
  rating: number | null
  total_ratings: number | null
  total_views: number | null
  is_new: boolean | null
  last_chapter_number: number | null
  is_approved?: boolean | null
  is_active?: boolean | null
}

export interface DbFansubRequest {
  id: string
  requester_user_id: string
  requested_name: string
  requested_slug: string
  requested_avatar_url: string | null
  requested_description: string | null
  requested_primary_color: string | null
  requested_secondary_color: string | null
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_fansub_id: string | null
  request_meta: Record<string, unknown> | null
  created_at: string
  updated_at: string
  requester?: {
    id: string
    username: string
    avatar_url: string | null
  } | {
    id: string
    username: string
    avatar_url: string | null
  }[] | null
}

export interface FansubRequest {
  id: string
  requesterUserId: string
  requestedName: string
  requestedSlug: string
  requestedAvatarUrl?: string
  requestedDescription?: string
  requestedPrimaryColor?: string
  requestedSecondaryColor?: string
  status: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  reviewedBy?: string
  reviewedAt?: string
  createdFansubId?: string
  requestMeta?: FansubRequestMeta
  createdAt: string
  updatedAt: string
  requester?: {
    id: string
    username: string
    avatarUrl?: string
  }
}

export interface FansubRequestMeta {
  contactEmail?: string
  contactDiscord?: string
  contactTelegram?: string
  teamSize?: number
  experienceLevel?: 'new' | 'intermediate' | 'experienced'
  sourceLanguages?: string[]
  targetLanguage?: string
  focusGenres?: string[]
  weeklyReleaseGoal?: number
  contentTypes?: string[]
  releaseDays?: string[]
  operatingTimezone?: string
  recruitmentOpen?: boolean
  recruitmentRoles?: string
  teamRolesNeeded?: string[]
  communicationHours?: string
  sampleWorkUrl?: string
  websiteUrl?: string
  portfolioNotes?: string
  motivation?: string
  spoilerPolicy?: string
  ageRatingPolicy?: 'all' | 'teen' | 'mature'
  qualityChecklist?: string
  moderationPolicy?: string
  dmcaAccepted?: boolean
  dmcaAcceptedAt?: string
}

export interface CreateFansubRequestInput {
  requesterUserId: string
  name: string
  description?: string
  primaryColor?: string
  secondaryColor?: string
  avatarFile?: File | null
  requestMeta?: FansubRequestMeta
}

export interface ListFansubMangasOptions {
  includePending?: boolean
  chapterRows?: FansubChapterMangaLookupRow[]
  translatedOnly?: boolean
}

export interface FansubMangaListResult {
  data: Manga[]
  pendingOwnedMangaIds: string[]
}

export interface ListFansubChaptersOptions {
  includePending?: boolean
}

export interface FansubChapterMangaLookupRow {
  manga_id: string
  mangas?:
    | Pick<DbManga, 'id' | 'title' | 'slug' | 'cover_image_url' | 'is_active' | 'is_approved'>
    | Array<Pick<DbManga, 'id' | 'title' | 'slug' | 'cover_image_url' | 'is_active' | 'is_approved'>>
    | null
}

export type { Fansub, Manga }


