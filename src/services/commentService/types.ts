import type { NameTextStyleSelection } from '@/data/nameTextEffects'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'

export type CommentSortBy = 'newest' | 'oldest' | 'popular'

export interface Comment {
    id: string
    userId: string
    username: string
    activeFansubIdentityTag?: FansubIdentityTagPresentation | null
    avatar: string
    chapterId?: string
    parentId?: string
    text: string
    isSpoiler?: boolean
    likes: number
    dislikes: number
    date: string
    isLiked?: boolean
    isDisliked?: boolean
    isPinned?: boolean
    frameType?: string
    frameCustomOverlayUrl?: string
    framePosterOverlayUrl?: string
    replies?: Comment[]
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
    primaryColor?: string
    secondaryColor?: string
    nameStyle?: NameTextStyleSelection | null
}

export type DbMangaCommentProfile = {
    id: string | null
    username: string | null
    avatar_url: string | null
    frame_type: string | null
    background_type?: string | null
    active_fansub_identity_tag?: FansubIdentityTagPresentation | null
    active_name_style?: Record<string, unknown> | null
}

export type DbMangaComment = {
    id: string
    manga_id: string
    user_id: string
    chapter_id?: string | null
    parent_id: string | null
    content: string
    is_spoiler?: boolean | null
    likes: number
    dislikes?: number | null
    is_pinned?: boolean | null
    is_active: boolean
    created_at: string
    users?: DbMangaCommentProfile | null
}

export type DbMangaCommentReaction = {
    comment_id: string
    reaction: 'like' | 'dislike'
}

export type MangaCommentReactionResponse = {
    is_liked: boolean
    is_disliked: boolean
    likes_count: number
    dislikes_count: number
}

export type SupabaseErrorLike = {
    code?: string
    message?: string
    details?: string
    hint?: string
    status?: number
}
