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

/** Top-level comments per public page. Public pages must never load an unbounded list. */
export const COMMENT_PAGE_SIZE = 30
/** Pinned roots shown above the paged list on the first page. */
const PINNED_ROOT_LIMIT = 10
/** Replies fetched per thread level; keeps a viral thread from blowing up the payload. */
const REPLIES_PER_LEVEL_LIMIT = 500
const REPLY_PARENT_CHUNK = 30
const MAX_REPLY_DEPTH = 6

export type CommentPage = {
    comments: Comment[]
    /** True when the server has more top-level comments after this page. */
    hasMore: boolean
    /** Offset to pass to the next call (server rows consumed so far). */
    nextOffset: number
    /** Exact active comment count (roots + replies) for this scope; only set on the first page. */
    total: number | null
}

type CommentQueryResult = { data: unknown; error: unknown }
type CommentQueryFactory = (signal: AbortSignal) => PromiseLike<CommentQueryResult>

/** Runs a comment query and retries once per missing optional column (legacy schemas). */
async function runCommentQuery(
    build: (useChapterScope: boolean) => CommentQueryFactory,
    label: string,
    signal?: AbortSignal,
): Promise<CommentQueryResult> {
    const run = (useChapterScope: boolean) => withServiceTimeout(build(useChapterScope), { label, signal })

    let result = await run(!commentSchemaState.isChapterScopeUnavailable)
    if (result.error && !commentSchemaState.isChapterScopeUnavailable && isMissingColumnError(result.error, 'chapter_id')) {
        commentSchemaState.isChapterScopeUnavailable = true
        result = await run(false)
    }
    if (result.error && !commentSchemaState.isSpoilerColumnUnavailable && isMissingColumnError(result.error, 'is_spoiler')) {
        commentSchemaState.isSpoilerColumnUnavailable = true
        result = await run(!commentSchemaState.isChapterScopeUnavailable)
    }
    return result
}

type ChapterScopable = {
    eq: (column: string, value: string) => unknown
    is: (column: string, value: null) => unknown
}

/** Applies the chapter scope filter; the builder type is kept loose to avoid deep generic instantiation. */
function applyChapterScope<T>(query: T, useChapterScope: boolean, chapterId: string | null): T {
    if (!useChapterScope) return query
    const scopable = query as unknown as ChapterScopable
    return (chapterId ? scopable.eq('chapter_id', chapterId) : scopable.is('chapter_id', null)) as T
}

async function countActiveComments(mangaId: string, chapterId: string | null, signal?: AbortSignal): Promise<number | null> {
    try {
        const { count, error } = await withServiceTimeout(
            (timeoutSignal) => withAbortSignal(
                applyChapterScope(
                    supabase
                        .from('manga_comments')
                        .select('id', { count: 'exact', head: true })
                        .eq('manga_id', mangaId)
                        .eq('is_active', true),
                    !commentSchemaState.isChapterScopeUnavailable,
                    chapterId,
                ),
                timeoutSignal,
            ),
            { label: 'commentService.getCommentsPage.count', signal },
        )
        if (error) return null
        return typeof count === 'number' ? count : null
    } catch {
        // The counter is cosmetic; the page still renders without it.
        return null
    }
}

/** Loads the replies of the given parents level by level so loaded threads stay complete. */
async function loadReplyRows(mangaId: string, rootIds: string[], signal?: AbortSignal): Promise<DbMangaComment[]> {
    const collected: DbMangaComment[] = []
    let parentIds = rootIds
    for (let depth = 0; depth < MAX_REPLY_DEPTH && parentIds.length > 0; depth += 1) {
        const levelRows: DbMangaComment[] = []
        for (let index = 0; index < parentIds.length; index += REPLY_PARENT_CHUNK) {
            const chunk = parentIds.slice(index, index + REPLY_PARENT_CHUNK)
            const { data, error } = await runCommentQuery(
                () => (timeoutSignal) => withAbortSignal(
                    supabase
                        .from('manga_comments')
                        .select(buildMangaCommentSelect())
                        .eq('manga_id', mangaId)
                        .eq('is_active', true)
                        .in('parent_id', chunk)
                        .order('created_at', { ascending: true })
                        .limit(REPLIES_PER_LEVEL_LIMIT),
                    timeoutSignal,
                ),
                'commentService.getCommentsPage.replies',
                signal,
            )
            // A failed reply chunk only leaves those threads without replies; the roots still render.
            if (error || !data) continue
            levelRows.push(...(data as unknown as DbMangaComment[]))
        }
        collected.push(...levelRows)
        parentIds = levelRows.map((row) => row.id)
    }
    return collected
}

/**
 * Bounded public loader: one page of top-level comments (plus pinned roots on the first page)
 * together with the replies of the loaded roots. Further pages use `offset`.
 * Server order follows the sort option and pinned roots stay on top. The page is re-sorted
 * client side with sortRootComments (popular orders by likes on the server and by
 * likes - dislikes inside a page).
 */
export async function getCommentsPage(
    mangaId: string,
    options: {
        chapterId?: string | null
        sortBy?: CommentSortBy
        offset?: number
        limit?: number
        signal?: AbortSignal
    } = {},
): Promise<CommentPage> {
    await ensureSchemaCompatibilityChecked()
    const chapterId = options.chapterId ?? null
    const sortBy = options.sortBy || 'newest'
    const signal = options.signal
    const offset = Math.max(0, Math.floor(options.offset ?? 0))
    const limit = Math.min(Math.max(1, Math.floor(options.limit ?? COMMENT_PAGE_SIZE)), 50)
    const isFirstPage = offset === 0

    const rootsPromise = runCommentQuery(
        (useChapterScope) => (timeoutSignal) => {
            let query = applyChapterScope(
                supabase
                    .from('manga_comments')
                    .select(buildMangaCommentSelect())
                    .eq('manga_id', mangaId)
                    .eq('is_active', true)
                    .is('parent_id', null),
                useChapterScope,
                chapterId,
            )
            if (sortBy === 'popular') query = query.order('likes', { ascending: false })
            query = query
                .order('created_at', { ascending: sortBy === 'oldest' })
                .order('id', { ascending: false })
            // One extra row tells us whether another page exists.
            return withAbortSignal(query.range(offset, offset + limit), timeoutSignal)
        },
        'commentService.getCommentsPage',
        signal,
    )
    const pinnedPromise = isFirstPage
        ? runCommentQuery(
            (useChapterScope) => (timeoutSignal) => withAbortSignal(
                applyChapterScope(
                    supabase
                        .from('manga_comments')
                        .select(buildMangaCommentSelect())
                        .eq('manga_id', mangaId)
                        .eq('is_active', true)
                        .is('parent_id', null)
                        .eq('is_pinned', true),
                    useChapterScope,
                    chapterId,
                )
                    .order('created_at', { ascending: false })
                    .limit(PINNED_ROOT_LIMIT),
                timeoutSignal,
            ),
            'commentService.getCommentsPage.pinned',
            signal,
        )
        : Promise.resolve<CommentQueryResult>({ data: [], error: null })
    const totalPromise = isFirstPage ? countActiveComments(mangaId, chapterId, signal) : Promise.resolve<number | null>(null)

    const [rootsResult, pinnedResult, total] = await Promise.all([rootsPromise, pinnedPromise, totalPromise])

    if (rootsResult.error || !rootsResult.data) {
        if (rootsResult.error) {
            console.error('[commentService] getCommentsPage error', rootsResult.error)
        }
        return { comments: [], hasMore: false, nextOffset: offset, total }
    }

    const rawRoots = rootsResult.data as unknown as DbMangaComment[]
    const hasMore = rawRoots.length > limit
    const pageRoots = rawRoots.slice(0, limit)
    const pinnedRoots = pinnedResult.error ? [] : ((pinnedResult.data || []) as unknown as DbMangaComment[])

    const seenRootIds = new Set<string>()
    const rootRows = [...pinnedRoots, ...pageRoots].filter((row) => {
        if (seenRootIds.has(row.id)) return false
        seenRootIds.add(row.id)
        return true
    })
    const replyRows = await loadReplyRows(mangaId, rootRows.map((row) => row.id), signal)
    const data = [...rootRows, ...replyRows]

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

    return {
        comments: sortRootComments(roots, sortBy),
        hasMore,
        nextOffset: offset + limit,
        total,
    }
}
