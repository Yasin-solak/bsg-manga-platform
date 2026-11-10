/**
 * Reader v2 chapter comments.
 *
 * In v1 comment state and six operations were scattered across the page component's body
 * (MangaReaderPage carried ~200 lines of comment logic) and errors were swallowed by raw console
 * calls. Here they gather in one place, tree operations come from a pure
 * module (readerV2CommentTree) and errors go to the scoped logger.
 *
 * Loading starts when chapter end comes into view: for someone just starting to read,
 * a comment query is a wasted cost.
 */

import { useCallback, useEffect, useState } from 'react'
import { commentService, type CommentSortBy } from '@/services/commentService'
import { resolveCommentMentionContext } from '@/services/commentMentionService'
import { createScopedLogger } from '@/services/logger'
import { toast } from '@/services/toastService'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import {
  findReaderV2Comment,
  insertReaderV2Reply,
  removeReaderV2Comment,
  updateReaderV2CommentReaction,
} from '@/pages/reader/readerV2CommentTree'
import type { Comment, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import { txa } from '@/i18n/activeLocale'

const readerV2CommentsLogger = createScopedLogger('ReaderV2Comments')

interface UseReaderV2CommentsArgs {
  mangaId: string | null | undefined
  chapterId: string | null | undefined
  commentsEnabled: boolean
  /** Comments are not fetched until chapter end is visible. */
  active: boolean
}

export function useReaderV2Comments({
  mangaId,
  chapterId,
  commentsEnabled,
  active,
}: UseReaderV2CommentsArgs) {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [sortBy, setSortBy] = useState<CommentSortBy>('newest')
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [mentionedUsers, setMentionedUsers] = useState<RelatedUser[]>([])
  const [relatedFansubs, setRelatedFansubs] = useState<RelatedFansub[]>([])
  const [mentionedMangas, setMentionedMangas] = useState<RelatedManga[]>([])

  const resolveMentions = useCallback(async (rows: Comment[], signal?: AbortSignal) => {
    try {
      const resolved = await resolveCommentMentionContext(rows, signal)
      setMentionedUsers(resolved.mentionedUsers)
      setRelatedFansubs(resolved.relatedFansubs)
      setMentionedMangas(resolved.mentionedMangas)
    } catch (error) {
      // Mention cozumlemesi kozmetiktir; yorumlar yine gosterilir.
      readerV2CommentsLogger.error({ event: 'resolve-mentions-error', error })
    }
  }, [])

  useEffect(() => {
    if (!mangaId || !chapterId || !active) {
      setComments([])
      setIsLoading(false)
      return
    }

    let alive = true
    const controller = new AbortController()
    setIsLoading(true)

    void (async () => {
      try {
        const rows = await commentService.getComments(mangaId, {
          chapterId,
          sortBy,
          signal: controller.signal,
        })
        if (!alive) return
        const list = rows as unknown as Comment[]
        setComments(list)
        await resolveMentions(list, controller.signal)
      } catch (error) {
        if (!alive) return
        readerV2CommentsLogger.error({ event: 'comments-load-error', error })
        setComments([])
      } finally {
        if (alive) setIsLoading(false)
      }
    })()

    return () => {
      alive = false
      controller.abort()
    }
  }, [active, chapterId, mangaId, resolveMentions, sortBy])

  const addComment = useCallback(async (isSpoiler = false) => {
    if (!commentsEnabled) {
      showInactiveFeatureToast(txa('Manga yorum gonderimi'))
      return
    }
    const content = newComment.trim()
    if (!mangaId || !chapterId || !content) return

    try {
      const row = await commentService.postComment(mangaId, content, undefined, { chapterId, isSpoiler })
      const created = row as unknown as Comment
      setComments((previous) => {
        const next = [created, ...previous]
        void resolveMentions(next)
        return next
      })
      setNewComment('')
      toast.success(txa('Yorum gonderildi.'))
    } catch (error) {
      readerV2CommentsLogger.error({ event: 'add-comment-error', error })
      toast.error(error instanceof Error ? error.message : txa('Yorum gonderilemedi.'))
    }
  }, [chapterId, commentsEnabled, mangaId, newComment, resolveMentions])

  const submitReply = useCallback(async (parentId: string, replyToReplyId?: string, isSpoiler = false) => {
    if (!commentsEnabled) {
      showInactiveFeatureToast(txa('Manga yorum yaniti'))
      return
    }
    const content = replyText.trim()
    if (!mangaId || !chapterId || !content) return
    const actualParentId = replyToReplyId || parentId

    try {
      const row = await commentService.postComment(mangaId, content, actualParentId, { chapterId, isSpoiler })
      const created = row as unknown as Comment
      setComments((previous) => {
        const next = insertReaderV2Reply(previous, actualParentId, created)
        void resolveMentions(next)
        return next
      })
      setReplyingTo(null)
      setReplyText('')
      toast.success(txa('Yanit gonderildi.'))
    } catch (error) {
      readerV2CommentsLogger.error({ event: 'add-reply-error', error })
      toast.error(error instanceof Error ? error.message : txa('Yanit gonderilemedi.'))
    }
  }, [chapterId, commentsEnabled, mangaId, replyText, resolveMentions])

  /** Like and dislike use the same path: the opposite of the current state. */
  const applyReaction = useCallback(async (commentId: string, kind: 'like' | 'dislike') => {
    const current = findReaderV2Comment(comments, commentId)
    if (!current) return
    const isActive = kind === 'like' ? current.isLiked : current.isDisliked
    try {
      const result = await commentService.setCommentReaction(commentId, isActive ? 'none' : kind)
      setComments((previous) => updateReaderV2CommentReaction(previous, commentId, {
        isLiked: result.isLiked,
        isDisliked: result.isDisliked,
        likes: result.likes,
        dislikes: result.dislikes,
      }))
    } catch (error) {
      readerV2CommentsLogger.error({ event: 'comment-reaction-error', error, context: { kind } })
      toast.error(txa('Yorum reaksiyonu guncellenemedi.'))
    }
  }, [comments])

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      await commentService.deleteComment(commentId)
      setComments((previous) => removeReaderV2Comment(previous, commentId))
      toast.success(txa('Yorum silindi.'))
    } catch (error) {
      readerV2CommentsLogger.error({ event: 'delete-comment-error', error })
      toast.error(error instanceof Error ? error.message : txa('Yorum silinemedi.'))
    }
  }, [])

  return {
    comments,
    isLoading,
    sortBy,
    setSortBy,
    newComment,
    setNewComment,
    replyingTo,
    setReplyingTo,
    replyText,
    setReplyText,
    mentionedUsers,
    relatedFansubs,
    mentionedMangas,
    addComment,
    submitReply,
    likeComment: useCallback((commentId: string) => { void applyReaction(commentId, 'like') }, [applyReaction]),
    dislikeComment: useCallback((commentId: string) => { void applyReaction(commentId, 'dislike') }, [applyReaction]),
    deleteComment,
  }
}
