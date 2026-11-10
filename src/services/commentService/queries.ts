import { buildCommentAuthorCosmeticMapFromRows } from '../communityCosmeticService'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { getBlockedUserIds } from '../userService/blocks'
import {
    commentSchemaState,
    ensureSchemaCompatibilityChecked,
    getCurrentPublicUserId,
    isMissingColumnError,
    isMissingTableOrRelationError,
    loadCommentAuthorMap,
    mapDbCommentToComment,
    sortRootComments,
} from './shared'
import type { Comment, CommentSortBy, DbMangaComment, DbMangaCommentReaction } from './types'

function buildMangaCommentSelect() {
    const columns = [
        'id',
        'manga_id',
        'user_id',
        'chapter_id',
        'parent_id',
        'content',
        'likes',
        'dislikes',
        'is_pinned',
        'is_active',
        'created_at',
    ]

    if (!commentSchemaState.isSpoilerColumnUnavailable) {
        columns.splice(columns.indexOf('likes'), 0, 'is_spoiler')
    }

    return columns.join(',\n    ')
}

export async function getComments(
    mangaId: string,
    options: {
        chapterId?: string | null
        sortBy?: CommentSortBy
        signal?: AbortSignal
    } = {},
): Promise<Comment[]> {
    await ensureSchemaCompatibilityChecked()
    const chapterId = options.chapterId ?? null
    const sortBy = options.sortBy || 'newest'
    const signal = options.signal

    let query = supabase
        .from('manga_comments')
        .select(buildMangaCommentSelect())
        .eq('manga_id', mangaId)
        .eq('is_active', true)

    const shouldUseChapterScope = !commentSchemaState.isChapterScopeUnavailable
    if (shouldUseChapterScope) {
        query = chapterId ? query.eq('chapter_id', chapterId) : query.is('chapter_id', null)
    }

    let { data, error } = await withServiceTimeout(
        (timeoutSignal) => withAbortSignal(
            query.order('created_at', { ascending: true }),
            timeoutSignal,
        ),
        { label: 'commentService.getComments', signal },
    )

    if (error && shouldUseChapterScope && isMissingColumnError(error, 'chapter_id')) {
        commentSchemaState.isChapterScopeUnavailable = true
        const fallback = await withServiceTimeout(
            (timeoutSignal) => withAbortSignal(
                supabase
                    .from('manga_comments')
                    .select(buildMangaCommentSelect())
                    .eq('manga_id', mangaId)
                    .eq('is_active', true)
                    .order('created_at', { ascending: true }),
                timeoutSignal,
            ),
            { label: 'commentService.getComments.legacyFallback', signal },
        )
        data = fallback.data
        error = fallback.error
    }

    if (error && !commentSchemaState.isSpoilerColumnUnavailable && isMissingColumnError(error, 'is_spoiler')) {
        commentSchemaState.isSpoilerColumnUnavailable = true
        const fallback = await withServiceTimeout(
            (timeoutSignal) => withAbortSignal(
                supabase
                    .from('manga_comments')
                    .select(buildMangaCommentSelect())
                    .eq('manga_id', mangaId)
                    .eq('is_active', true)
                    .order('created_at', { ascending: true }),
                timeoutSignal,
            ),
            { label: 'commentService.getComments.spoilerFallback', signal },
        )
        data = fallback.data
        error = fallback.error
    }

    if (error || !data) {
        if (error) {
            console.error('[commentService] getComments error', error)
        }
        return []
    }

    const blockedUserIds = new Set(await getBlockedUserIds(undefined, signal))
    const typedRows = ((data || []) as unknown as DbMangaComment[]).filter((row) => !blockedUserIds.has(row.user_id))
    const authorMap = await loadCommentAuthorMap(typedRows.map((row) => row.user_id), signal)
    const enrichedRows = typedRows.map((row) => ({
        ...row,
        users: authorMap.get(row.user_id) || null,
    }))

    const commentIds = enrichedRows.map((row) => row.id)
    const currentPublicUserId = await getCurrentPublicUserId()
    const reactionMap = new Map<string, 'like' | 'dislike'>()

    if (currentPublicUserId && commentIds.length > 0 && !commentSchemaState.isReactionTableUnavailable) {
        const { data: reactions, error: reactionsError } = await withServiceTimeout(
            (timeoutSignal) => withAbortSignal(
                supabase
                    .from('manga_comment_reactions')
                    .select('comment_id, reaction')
                    .eq('user_id', currentPublicUserId)
                    .in('comment_id', commentIds),
                timeoutSignal,
            ),
            { label: 'commentService.getComments.reactions', signal },
        )

        if (reactionsError) {
            if (isMissingTableOrRelationError(reactionsError, 'manga_comment_reactions')) {
                commentSchemaState.isReactionTableUnavailable = true
            } else {
                console.error('[commentService] getComments reactions error', reactionsError)
            }
        } else {
            ;(reactions as DbMangaCommentReaction[]).forEach((row) => {
                if (row.comment_id && (row.reaction === 'like' || row.reaction === 'dislike')) {
                    reactionMap.set(row.comment_id, row.reaction)
                }
            })
        }
    }

    const authorCosmeticMap = await buildCommentAuthorCosmeticMapFromRows(
        Array.from(authorMap.values()).map((author) => ({
            id: author.id || '',
            frame_type: author.frame_type || null,
            background_type: author.background_type || null,
        })),
        signal,
    )

    const flatComments = enrichedRows.map((row) => {
        const authorId = row.users?.id || row.user_id
        return mapDbCommentToComment(row, reactionMap.get(row.id), authorCosmeticMap.get(authorId))
    })

    const commentMap = new Map<string, Comment>()
    flatComments.forEach((comment) => {
        commentMap.set(comment.id, comment)
    })

    const roots: Comment[] = []
    enrichedRows.forEach((row) => {
        const comment = commentMap.get(row.id)
        if (!comment) return

        if (row.parent_id) {
            const parent = commentMap.get(row.parent_id)
            if (parent) {
                parent.replies = [...(parent.replies || []), comment]
            } else {
                roots.push(comment)
            }
        } else {
            roots.push(comment)
        }
    })

    return sortRootComments(roots, sortBy)
}
