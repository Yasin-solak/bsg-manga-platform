import type { RelatedFansub, RelatedManga, RelatedUser } from '@types'

export interface CommunityInlineMeta {
    tags: string[]
    mentionHandles: string[]
}

export interface CommunityMentionFansubSuggestion extends RelatedFansub {
    slug: string
    avatar?: string
}

export interface CommunityMentionMangaSuggestion extends RelatedManga {
    slug: string
    coverImage?: string
}

export type MentionUserRow = {
    id: string
    username: string
    display_name?: string | null
    avatar_url: string | null
    frame_type?: string | null
    background_type?: string | null
}

export type MentionFansubRow = {
    id: string
    name: string
    slug: string
    avatar_url: string | null
    description: string | null
    frame_type: string | null
    primary_color: string | null
    secondary_color: string | null
    custom_background_asset_url: string | null
    manga_count: number | null
    follower_count: number | null
    active_frame_id: string | null
    active_background_id: string | null
    active_pattern_id: string | null
}

export type MentionMangaRow = {
    id: string
    title: string
    slug: string
    cover_image_url: string | null
}

export type { RelatedFansub, RelatedManga, RelatedUser }
