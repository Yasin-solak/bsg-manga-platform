import type { CommunityCardCosmetics } from '../communityCosmeticService'
import { supabase } from '../supabase'
import { parseFansubIdentityTag } from '@/lib/fansubIdentityTags'
import { parsePublicNameTextStyle } from '@/data/userNameStyle'
import type {
    Comment,
    CommentSortBy,
    DbMangaComment,
    DbMangaCommentProfile,
    SupabaseErrorLike,
} from './types'

import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { loadPublicUserDirectoryLiteByIds } from '../publicUserDirectoryLite'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from '../userService/selfIdentity'

const commentSharedLogger = createScopedLogger('commentService.shared')

export const commentSchemaState = {
    isChapterScopeUnavailable: false,
    isDislikesColumnUnavailable: false,
    isSpoilerColumnUnavailable: false,
    isReactionTableUnavailable: false,
    isReactionRpcUnavailable: false,
    hasCheckedSchemaCompatibility: false,
}

function markLegacyCommentSchemaMode() {
    commentSchemaState.isChapterScopeUnavailable = true
    commentSchemaState.isDislikesColumnUnavailable = true
    commentSchemaState.isSpoilerColumnUnavailable = true
    commentSchemaState.isReactionTableUnavailable = true
    commentSchemaState.isReactionRpcUnavailable = true
}

export async function ensureSchemaCompatibilityChecked() {
    if (commentSchemaState.hasCheckedSchemaCompatibility) return
    commentSchemaState.hasCheckedSchemaCompatibility = true
    const requestContext = createRequestContext('commentService.shared', 'ensure-schema-compatibility')

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('feature_flags')
                .select('key')
                .eq('key', 'reader.comments')
                .maybeSingle<{ key: string }>(),
            signal,
        ),
        { label: 'Yorum sema uyumlulugunu kontrol etme' },
    )

    if (error) {
        if (isMissingTableOrRelationError(error, 'feature_flags')) {
            markLegacyCommentSchemaMode()
        } else {
            commentSharedLogger.warn({
                event: 'ensure-schema-compatibility-failed',
                message: toUserFacingErrorMessage(error, 'Yorum ozellik uyumlulugu kontrol edilemedi.'),
                context: toRequestContextLogContext(requestContext),
                error,
            })
        }
        return
    }

    if (!data?.key) {
        markLegacyCommentSchemaMode()
    }
}

function getErrorText(error: unknown) {
    if (!error || typeof error !== 'object') return ''
    const typed = error as SupabaseErrorLike
    return [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
}

export function isMissingColumnError(error: unknown, columnName: string) {
    const text = getErrorText(error)
    const col = columnName.toLowerCase()
    return (
        text.includes(`column "${col}"`) ||
        text.includes(`column ${col}`) ||
        (text.includes('does not exist') && text.includes(col)) ||
        (text.includes('could not find') && text.includes(col))
    )
}

export function isMissingTableOrRelationError(error: unknown, resourceName: string) {
    const typed = (error || {}) as SupabaseErrorLike
    const status = Number(typed.status || 0)
    const text = getErrorText(error)
    const resource = resourceName.toLowerCase()

    if (status === 404 && text.includes(resource)) return true
    if (text.includes('could not find the table') && text.includes(resource)) return true
    if (text.includes('could not find a relationship') && text.includes(resource)) return true
    if (text.includes('relation') && text.includes(resource) && text.includes('does not exist')) return true
    return false
}

export function isMissingFunctionError(error: unknown, functionName: string) {
    const typed = (error || {}) as SupabaseErrorLike
    const status = Number(typed.status || 0)
    const text = getErrorText(error)
    const fn = functionName.toLowerCase()

    if (status === 404 && text.includes(fn)) return true
    if (text.includes('could not find the function') && text.includes(fn)) return true
    if (text.includes('function') && text.includes(fn) && text.includes('does not exist')) return true
    return false
}

export async function getCurrentPublicUserId(): Promise<string | null> {
    const identity = await getCurrentUserIdentity()
    return identity?.id ?? null
}

export function mapDbCommentToComment(
    row: DbMangaComment,
    reaction?: 'like' | 'dislike',
    authorCosmetic?: CommunityCardCosmetics,
): Comment {
    return {
        id: row.id,
        userId: row.users?.id || row.user_id,
        username: row.users?.username || 'Anonim',
        avatar: row.users?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.user_id}`,
        // Note: the chapter comment flow works with author objects from different
        // sources, and raw snake_case JSON can arrive here too. We normalize at the mapper
        // boundary for one presentation shape.
        activeFansubIdentityTag: parseFansubIdentityTag(row.users?.active_fansub_identity_tag ?? null),
        chapterId: row.chapter_id || undefined,
        parentId: row.parent_id || undefined,
        text: row.content,
        isSpoiler: row.is_spoiler === true,
        likes: Number(row.likes || 0),
        dislikes: Number(row.dislikes || 0),
        date: row.created_at,
        isLiked: reaction === 'like',
        isDisliked: reaction === 'dislike',
        isPinned: row.is_pinned === true,
        frameType: authorCosmetic?.frameType || row.users?.frame_type || 'default',
        frameCustomOverlayUrl: authorCosmetic?.frameOverlayUrl,
        framePosterOverlayUrl: authorCosmetic?.framePosterUrl,
        replies: [],
        profileBackgroundStyle: authorCosmetic?.backgroundStyle,
        profileBackgroundVideoUrl: authorCosmetic?.backgroundVideoUrl,
        profilePatternStyle: authorCosmetic?.patternStyle,
        primaryColor: authorCosmetic?.primaryColor,
        secondaryColor: authorCosmetic?.secondaryColor,
        nameStyle: parsePublicNameTextStyle(row.users?.active_name_style),
    }
}

export function sortRootComments(comments: Comment[], sortBy: CommentSortBy) {
    const roots = [...comments]
    const pinned = roots.filter((item) => item.isPinned === true)
    const normal = roots.filter((item) => item.isPinned !== true)

    switch (sortBy) {
        case 'newest':
            normal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            break
        case 'oldest':
            normal.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            break
        case 'popular':
            normal.sort((a, b) => {
                const scoreA = a.likes - (a.dislikes || 0)
                const scoreB = b.likes - (b.dislikes || 0)
                if (scoreB !== scoreA) return scoreB - scoreA
                return new Date(b.date).getTime() - new Date(a.date).getTime()
            })
            break
    }

    return [...pinned, ...normal]
}

export async function loadCommentAuthorMap(userIds: string[], signal?: AbortSignal) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    if (uniqueUserIds.length === 0) return new Map<string, DbMangaCommentProfile>()
    const requestContext = createRequestContext('commentService.shared', 'load-comment-author-map', {
        userCount: uniqueUserIds.length,
    })

    const map = new Map<string, DbMangaCommentProfile>()
    try {
        const rows = await loadPublicUserDirectoryLiteByIds(uniqueUserIds, signal)
        rows.forEach((row) => {
            if (row.id) map.set(row.id, row as DbMangaCommentProfile)
        })
    } catch (error) {
        commentSharedLogger.warn({
            event: 'load-comment-author-map-failed',
            message: toUserFacingErrorMessage(error, 'Yorum yazar bilgileri yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
    }

    return map
}


