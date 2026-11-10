import { buildCommentAuthorCosmeticMap } from '../communityCosmeticService'
import { extractInlineCommunityMeta, resolveCommunityMentionHandles } from '../communityMentionService'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { isFeatureEnabled } from '../featureFlagService'
import { createScopedLogger } from '../logger'
import { loadMangaLiteByIds } from '../mangaLiteDirectory'
import { sendMangaCommentMentionNotification } from '../notificationService'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { ensureSupporterExpressionWriteAllowed } from '../supporterExpressionWriteGuard'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from '../userService/selfIdentity'
import { buildPublicMangaPath } from '@/lib/routes'
import { MANGA_COMMENT_MAX_LENGTH } from './constants'
import {
    commentSchemaState,
    ensureSchemaCompatibilityChecked,
    isMissingColumnError,
    isMissingFunctionError,
    mapDbCommentToComment,
} from './shared'
import type {
    DbMangaComment,
    DbMangaCommentProfile,
    MangaCommentReactionResponse,
} from './types'

const commentMutationsLogger = createScopedLogger('commentService.mutations')

function buildMangaCommentWritebackSelect() {
    const columns = [
        'id',
        'manga_id',
        'user_id',
        'parent_id',
        'content',
        'likes',
        'is_pinned',
        'is_active',
        'created_at',
    ]

    if (!commentSchemaState.isChapterScopeUnavailable) {
        columns.splice(3, 0, 'chapter_id')
    }

    if (!commentSchemaState.isDislikesColumnUnavailable) {
        columns.splice(columns.indexOf('is_pinned'), 0, 'dislikes')
    }

    if (!commentSchemaState.isSpoilerColumnUnavailable) {
        columns.splice(columns.indexOf('likes'), 0, 'is_spoiler')
    }

    return columns.join(', ')
}

export async function postComment(
    mangaId: string,
    content: string,
    parentId?: string,
    options: { chapterId?: string | null; isSpoiler?: boolean } = {},
) {
    await ensureSchemaCompatibilityChecked()
    const requestContext = createRequestContext('commentService.mutations', 'post-comment', {
        mangaId,
        hasParent: Boolean(parentId),
        hasChapter: Boolean(options.chapterId),
    })
    const isReaderCommentsEnabled = await isFeatureEnabled('reader.comments', false)
    if (!isReaderCommentsEnabled) {
        throw new Error('Manga ve bolum yorum gonderimi su anda aktif degil.')
    }
    const normalizedContent = await ensureSupporterExpressionWriteAllowed(content)
    if (!normalizedContent) {
        throw new Error('Yorum bos olamaz.')
    }
    if (normalizedContent.length > MANGA_COMMENT_MAX_LENGTH) {
        throw new Error(`Yorum en fazla ${MANGA_COMMENT_MAX_LENGTH} karakter olabilir.`)
    }

    const profile = await getCurrentUserIdentity({ required: true })
    if (!profile?.id) throw new Error('Profil bulunamadi.')

    const insertPayload: Record<string, unknown> = {
        manga_id: mangaId,
        user_id: profile.id,
        content: normalizedContent,
        parent_id: parentId || null,
        likes: 0,
    }
    if (!commentSchemaState.isChapterScopeUnavailable) {
        insertPayload.chapter_id = options.chapterId ?? null
    }
    if (!commentSchemaState.isDislikesColumnUnavailable) {
        insertPayload.dislikes = 0
    }
    if (!commentSchemaState.isSpoilerColumnUnavailable) {
        insertPayload.is_spoiler = options.isSpoiler === true
    }

    let insertedRow: DbMangaComment | null = null
    let insertError: unknown = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await withServiceTimeout(
            (signal) => withAbortSignal(
                supabase
                    .from('manga_comments')
                    .insert(insertPayload)
                    .select(buildMangaCommentWritebackSelect())
                    .single(),
                signal,
            ),
            { label: 'Yorum kaydini yazma' },
        )

        if (!result.error && result.data) {
            insertedRow = result.data as unknown as DbMangaComment
            insertError = null
            break
        }

        insertError = result.error

        if (insertPayload.chapter_id !== undefined && isMissingColumnError(result.error, 'chapter_id')) {
            commentSchemaState.isChapterScopeUnavailable = true
            delete insertPayload.chapter_id
            continue
        }

        if (insertPayload.dislikes !== undefined && isMissingColumnError(result.error, 'dislikes')) {
            commentSchemaState.isDislikesColumnUnavailable = true
            delete insertPayload.dislikes
            continue
        }

        if (insertPayload.is_spoiler !== undefined && isMissingColumnError(result.error, 'is_spoiler')) {
            commentSchemaState.isSpoilerColumnUnavailable = true
            delete insertPayload.is_spoiler
            continue
        }

        break
    }

    if (!insertedRow) {
        if (insertError) {
            commentMutationsLogger.error({
                event: 'post-comment-failed',
                message: toUserFacingErrorMessage(insertError, 'Yorum gonderilemedi.'),
                context: toRequestContextLogContext(requestContext, {
                    hasChapterColumn: insertPayload.chapter_id !== undefined,
                    hasDislikesColumn: insertPayload.dislikes !== undefined,
                }),
                error: insertError,
            })
        }
        throw insertError || new Error('Yorum gonderilemedi.')
    }

    const enriched = {
        ...insertedRow,
        users: {
            id: profile.id,
            username: profile.username,
            avatar_url: profile.avatar_url,
            frame_type: profile.frame_type,
            active_fansub_identity_tag: profile.active_fansub_identity_tag ?? null,
        } as DbMangaCommentProfile,
    }

    const inlineMeta = extractInlineCommunityMeta(normalizedContent)
    if (inlineMeta.mentionHandles.length > 0) {
        try {
            const mangaLiteMap = await loadMangaLiteByIds([mangaId])
            const mangaLite = mangaLiteMap.get(mangaId)
            const resolvedMentions = await resolveCommunityMentionHandles(inlineMeta.mentionHandles)
            const mentionedUserIds = Array.from(
                new Set(
                    resolvedMentions.mentionedUsers
                        .map((entry) => entry.id)
                        .filter((entryId): entryId is string => Boolean(entryId) && entryId !== profile.id),
                ),
            )

            await Promise.allSettled(
                mentionedUserIds.map((userId) => sendMangaCommentMentionNotification({
                    userId,
                    actorUserId: profile.id,
                    actorUsername: profile.username || 'Bir kullanici',
                    mangaId,
                    commentId: insertedRow.id,
                    routeHint: buildPublicMangaPath({
                        id: mangaId,
                        slug: mangaLite?.slug,
                        title: mangaLite?.title,
                    }),
                })),
            )
        } catch (mentionError) {
            commentMutationsLogger.warn({
                event: 'post-comment-mention-notification-failed',
                message: toUserFacingErrorMessage(mentionError, 'Yorum etiket bildirimleri gonderilemedi.'),
                context: toRequestContextLogContext(requestContext, {
                    mentionCount: inlineMeta.mentionHandles.length,
                }),
                error: mentionError,
            })
        }
    }

    const newAuthorCosmeticMap = await buildCommentAuthorCosmeticMap([profile.id])
    return mapDbCommentToComment(enriched, undefined, newAuthorCosmeticMap.get(profile.id))
}

export async function setCommentReaction(
    commentId: string,
    reaction: 'like' | 'dislike' | 'none',
) {
    await ensureSchemaCompatibilityChecked()
    const requestContext = createRequestContext('commentService.mutations', 'set-comment-reaction', {
        commentId,
        reaction,
    })
    if (commentSchemaState.isReactionRpcUnavailable) {
        throw new Error('Yorum reaksiyonlari su anda kullanilamiyor.')
    }

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('set_manga_comment_reaction', {
                p_comment_id: commentId,
                p_reaction: reaction,
            }),
            signal,
        ),
        { label: 'Yorum reaksiyonunu guncelleme' },
    )

    if (error || !data) {
        if (isMissingFunctionError(error, 'set_manga_comment_reaction')) {
            commentSchemaState.isReactionRpcUnavailable = true
            throw new Error('Yorum reaksiyonu icin veritabani migrationi eksik.')
        }
        commentMutationsLogger.error({
            event: 'set-comment-reaction-failed',
            message: toUserFacingErrorMessage(error, 'Yorum reaksiyonu guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error || new Error('Yorum reaksiyonu guncellenemedi.')
    }

    const result = data as MangaCommentReactionResponse
    return {
        isLiked: Boolean(result.is_liked),
        isDisliked: Boolean(result.is_disliked),
        likes: Number(result.likes_count || 0),
        dislikes: Number(result.dislikes_count || 0),
    }
}

export async function likeComment(commentId: string) {
    return setCommentReaction(commentId, 'like')
}

export async function dislikeComment(commentId: string) {
    return setCommentReaction(commentId, 'dislike')
}

export async function deleteComment(commentId: string) {
    const requestContext = createRequestContext('commentService.mutations', 'delete-comment', {
        commentId,
    })
    const profile = await getCurrentUserIdentity({ required: true })
    if (!profile?.id) throw new Error('Profil bulunamadi.')

    const { data: targetComment, error: targetCommentError } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('manga_comments')
                .select('id, user_id')
                .eq('id', commentId)
                .single(),
            signal,
        ),
        { label: 'Silinecek yorumu okuma' },
    )

    if (targetCommentError || !targetComment) {
        throw new Error('Yorum bulunamadi.')
    }

    const canDelete = profile.role === 'admin' || targetComment.user_id === profile.id
    if (!canDelete) {
        throw new Error('Bu yorumu silme yetkiniz yok.')
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('manga_comments').delete().eq('id', commentId),
            signal,
        ),
        { label: 'Yorumu silme' },
    )

    if (error) {
        commentMutationsLogger.error({
            event: 'delete-comment-failed',
            message: toUserFacingErrorMessage(error, 'Yorum silinemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
}

export async function setCommentPinned(commentId: string, pinned: boolean) {
    const requestContext = createRequestContext('commentService.mutations', 'set-comment-pinned', {
        commentId,
        pinned,
    })
    const profile = await getCurrentUserIdentity({ required: true })
    if (!profile?.id) throw new Error('Profil bulunamadi.')

    if (profile.role !== 'admin') {
        throw new Error('Yalnizca admin yorum sabitleyebilir.')
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('manga_comments').update({ is_pinned: pinned }).eq('id', commentId),
            signal,
        ),
        { label: 'Yorum sabitleme durumunu guncelleme' },
    )

    if (error) {
        commentMutationsLogger.error({
            event: 'set-comment-pinned-failed',
            message: toUserFacingErrorMessage(error, 'Yorum sabitleme durumu guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
}
