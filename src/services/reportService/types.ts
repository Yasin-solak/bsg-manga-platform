export type ReportTargetType =
    | 'manga_comment'
    | 'manga_list_comment'
    | 'user'
    | 'manga'
    | 'chapter'
export type ReportStatus = 'pending' | 'resolved' | 'dismissed'

/** Fansub-owned targets that enter the "reported content" fix loop. */
export const FANSUB_FIX_TARGET_TYPES: ReportTargetType[] = ['manga', 'chapter']

export interface Report {
    id: string
    reporter_id: string
    target_id: string
    target_type: ReportTargetType
    reason: string
    description?: string
    status: ReportStatus
    created_at: string
    resolved_at?: string
    resolved_by?: string
    reporter?: {
        username: string
        avatar_url: string
    }
}

export interface ReportTargetContext {
    targetType: ReportTargetType
    targetId: string
    targetTitle: string
    targetPreview?: string
    targetIsActive: boolean
    ownerId?: string
    ownerUsername?: string
    ownerAvatarUrl?: string
    parentId?: string
    parentTitle?: string
    publicUrl?: string
    locationPath: string
    adminSection: 'mangas' | 'lists' | 'users'
}

export interface ReportModerationEvent {
    id: string
    action: string
    summary: string
    note?: string
    actorUsername?: string
    createdAt: string
}

export interface TargetConfig {
    table: 'manga_comments' | 'user_manga_list_comments' | 'users' | 'mangas' | 'chapters'
    ownerColumn: 'user_id' | 'author_id' | 'id'
    notFoundMessage: string
}

export type UserMiniRow = {
    id: string
    username: string | null
    avatar_url: string | null
}

export type MangaMini = {
    id: string
    title: string | null
    slug: string | null
}

export type ChapterMini = {
    id: string
    title: string | null
    chapter_number: number | null
}

export type MangaCommentContextRow = {
    id: string
    content: string | null
    is_active: boolean | null
    user_id: string
    manga_id: string
    chapter_id: string | null
    manga: MangaMini | MangaMini[] | null
    chapter: ChapterMini | ChapterMini[] | null
}

export type MangaListMini = {
    id: string
    title: string | null
}

export type MangaListCommentContextRow = {
    id: string
    body: string | null
    is_active: boolean | null
    author_id: string
    list_id: string
    list: MangaListMini | MangaListMini[] | null
}

export type UserReportContextRow = {
    id: string
    username: string | null
    avatar_url: string | null
    bio: string | null
    is_active: boolean | null
    is_banned: boolean | null
}

export type MangaContentContextRow = {
    id: string
    title: string | null
    slug: string | null
    description: string | null
    is_active: boolean | null
    fansub_id: string | null
}

export type ChapterContentContextRow = {
    id: string
    chapter_number: number | null
    title: string | null
    is_active: boolean | null
    manga_id: string
    fansub_id: string | null
    manga: MangaMini | MangaMini[] | null
}
