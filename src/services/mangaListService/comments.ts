import type { Comment } from '@/types'
import { buildCommentAuthorCosmeticMap, buildCommentAuthorCosmeticMapFromRows } from '../communityCosmeticService'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { ensureSupporterExpressionWriteAllowed } from '../supporterExpressionWriteGuard'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from '../userService/selfIdentity'
import { getE2EMockMangaListDetail } from '@/testing/e2eMocks'
import {
  DbMangaListCommentReaction,
  DbMangaListCommentRow,
  DbUserRow,
  getCurrentPublicUserId,
  loadCommentAuthorMap,
  MangaListCommentReactionResponse,
  mapDbCommentToComment,
  sortRootComments,
} from './shared'
import type { MangaListCommentSortBy } from './types'

const mangaListCommentsLogger = createScopedLogger('mangaListService/comments')
let isMangaListCommentSpoilerColumnUnavailable = false

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { message?: string; details?: string; hint?: string }
  const text = [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
  const normalizedColumn = columnName.toLowerCase()
  return (
    text.includes(`column "${normalizedColumn}"`)
    || text.includes(`column ${normalizedColumn}`)
    || (text.includes('does not exist') && text.includes(normalizedColumn))
    || (text.includes('could not find') && text.includes(normalizedColumn))
  )
}

function buildMangaListCommentSelect() {
  const columns = [
    'id',
    'list_id',
    'author_id',
    'parent_id',
    'body',
    'likes_count',
    'dislikes_count',
    'created_at',
    'is_active',
  ]

  if (!isMangaListCommentSpoilerColumnUnavailable) {
    columns.splice(columns.indexOf('likes_count'), 0, 'is_spoiler')
  }

  return columns.join(', ')
}

export async function listMangaListComments(
  listId: string,
  sortBy: MangaListCommentSortBy = 'newest',
) {
  if (getE2EMockMangaListDetail(listId)) return []

  const requestContext = createRequestContext('mangaListService/comments', 'listMangaListComments', {
    listId,
    sortBy,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('user_manga_list_comments')
        .select(buildMangaListCommentSelect())
        .eq('list_id', listId)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      signal,
    ),
    { label: 'mangaListService.listMangaListComments' },
  )

  let rows = data
  let listError = error

  if (listError && !isMangaListCommentSpoilerColumnUnavailable && isMissingColumnError(listError, 'is_spoiler')) {
    isMangaListCommentSpoilerColumnUnavailable = true
    const fallback = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('user_manga_list_comments')
          .select(buildMangaListCommentSelect())
          .eq('list_id', listId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        signal,
      ),
      { label: 'mangaListService.listMangaListComments.spoilerFallback' },
    )
    rows = fallback.data
    listError = fallback.error
  }

  if (listError || !rows) {
    mangaListCommentsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(listError, 'Manga liste yorumlari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error: listError,
    })
    return []
  }

  const typedRows = (rows || []) as unknown as DbMangaListCommentRow[]
  const authorMap = await loadCommentAuthorMap(typedRows.map((row) => row.author_id))
  const authorCosmeticMap = await buildCommentAuthorCosmeticMapFromRows(
    Array.from(authorMap.values()).map((author) => ({
      id: author.id,
      frame_type: author.frame_type || null,
      background_type: author.background_type || null,
    })),
  )
  const commentIds = typedRows.map((row) => row.id)
  const currentPublicUserId = await getCurrentPublicUserId()
  const reactionMap = new Map<string, 'like' | 'dislike'>()

  if (currentPublicUserId && commentIds.length > 0) {
    const { data: reactionRows, error: reactionError } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('user_manga_list_comment_reactions')
          .select('comment_id, reaction')
          .eq('user_id', currentPublicUserId)
          .in('comment_id', commentIds),
        signal,
      ),
      { label: 'mangaListService.listMangaListComments.reactions' },
    )

    if (reactionError) {
      mangaListCommentsLogger.warn({
        event: requestContext.event,
        message: toUserFacingErrorMessage(reactionError, 'Yorum reaksiyonlari yuklenemedi.'),
        context: toRequestContextLogContext(requestContext, { stage: 'reactions' }),
        error: reactionError,
      })
    } else {
      ;((reactionRows || []) as DbMangaListCommentReaction[]).forEach((row) => {
        if (row.comment_id && (row.reaction === 'like' || row.reaction === 'dislike')) {
          reactionMap.set(row.comment_id, row.reaction)
        }
      })
    }
  }

  const flatComments = typedRows.map((row) => {
    const author = authorMap.get(row.author_id)
    const authorId = author?.id || row.author_id
    return mapDbCommentToComment(row, author, reactionMap.get(row.id), authorCosmeticMap.get(authorId))
  })
  const commentMap = new Map<string, ReturnType<typeof mapDbCommentToComment>>()
  flatComments.forEach((comment) => {
    commentMap.set(comment.id, { ...comment, replies: [] })
  })

  const roots: Comment[] = []
  typedRows.forEach((row) => {
    const mapped = commentMap.get(row.id)
    if (!mapped) return

    if (row.parent_id) {
      const parent = commentMap.get(row.parent_id)
      if (parent) {
        parent.replies = [...(parent.replies || []), mapped]
      } else {
        roots.push(mapped)
      }
    } else {
      roots.push(mapped)
    }
  })

  return sortRootComments(roots, sortBy)
}

export async function postMangaListComment(
  listId: string,
  content: string,
  parentId?: string,
  options: { isSpoiler?: boolean } = {},
) {
  const requestContext = createRequestContext('mangaListService/comments', 'postMangaListComment', {
    listId,
    hasParent: Boolean(parentId),
  })
  const identity = await getCurrentUserIdentity({ required: true })
  if (!identity?.id) {
    throw new Error('Profil bulunamadi.')
  }
  const normalizedContent = await ensureSupporterExpressionWriteAllowed(content)

  const profile: DbUserRow = {
    id: identity.id,
    username: identity.username,
    avatar_url: identity.avatar_url,
    frame_type: identity.frame_type,
  }

  let { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('user_manga_list_comments')
        .insert({
          list_id: listId,
          author_id: profile.id,
          parent_id: parentId || null,
          body: normalizedContent,
          ...(isMangaListCommentSpoilerColumnUnavailable ? {} : { is_spoiler: options.isSpoiler === true }),
        })
        .select(buildMangaListCommentSelect())
        .single<DbMangaListCommentRow>(),
      signal,
    ),
    { label: 'mangaListService.postMangaListComment.insert' },
  )

  if (error && !isMangaListCommentSpoilerColumnUnavailable && isMissingColumnError(error, 'is_spoiler')) {
    isMangaListCommentSpoilerColumnUnavailable = true
    const fallbackResult = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('user_manga_list_comments')
          .insert({
            list_id: listId,
            author_id: profile.id,
            parent_id: parentId || null,
            body: normalizedContent,
          })
          .select(buildMangaListCommentSelect())
          .single<DbMangaListCommentRow>(),
        signal,
      ),
      { label: 'mangaListService.postMangaListComment.spoilerFallback' },
    )
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error || !data) {
    mangaListCommentsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Yorum gonderilemedi.'),
      context: toRequestContextLogContext(requestContext, { authorId: profile.id }),
      error,
    })
    throw error || new Error('Yorum gonderilemedi.')
  }

  const authorCosmeticMap = await buildCommentAuthorCosmeticMap([profile.id])
  return mapDbCommentToComment(data, profile, undefined, authorCosmeticMap.get(profile.id))
}

export async function setMangaListCommentReaction(
  commentId: string,
  reaction: 'like' | 'dislike' | 'none',
) {
  const requestContext = createRequestContext('mangaListService/comments', 'setMangaListCommentReaction', {
    commentId,
    reaction,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_user_manga_list_comment_reaction', {
        p_comment_id: commentId,
        p_reaction: reaction,
      }),
      signal,
    ),
    { label: 'mangaListService.setMangaListCommentReaction' },
  )

  if (error || !data) {
    mangaListCommentsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Yorum reaksiyonu guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error || new Error('Yorum reaksiyonu guncellenemedi.')
  }

  const row = data as MangaListCommentReactionResponse
  return {
    isLiked: Boolean(row.is_liked),
    isDisliked: Boolean(row.is_disliked),
    likes: Number(row.likes_count || 0),
    dislikes: Number(row.dislikes_count || 0),
  }
}
