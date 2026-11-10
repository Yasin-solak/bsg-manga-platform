/**
 * Comment tree operations (pure functions).
 *
 * In v1 these recursions were embedded in the page component (two separate helpers in
 * MangaReaderPage + reply adding logic in the handler body).
 * Extracted, they are testable and a single source: adding replies
 * and updating reactions use the same tree walking rule.
 */

import type { Comment } from '@/types'

export type ReaderV2CommentReactionPatch = Pick<Comment, 'isLiked' | 'isDisliked' | 'likes' | 'dislikes'>

export function findReaderV2Comment(list: Comment[], commentId: string): Comment | null {
  for (const comment of list) {
    if (comment.id === commentId) return comment
    if (comment.replies?.length) {
      const found = findReaderV2Comment(comment.replies, commentId)
      if (found) return found
    }
  }
  return null
}

export function updateReaderV2CommentReaction(
  list: Comment[],
  commentId: string,
  patch: ReaderV2CommentReactionPatch,
): Comment[] {
  return list.map((comment) => {
    if (comment.id === commentId) return { ...comment, ...patch }
    if (comment.replies?.length) {
      return { ...comment, replies: updateReaderV2CommentReaction(comment.replies, commentId, patch) }
    }
    return comment
  })
}

/** Yaniti dogru ebeveynin altina ekler; agacin geri kalanina dokunmaz. */
export function insertReaderV2Reply(list: Comment[], parentId: string, reply: Comment): Comment[] {
  return list.map((comment) => {
    if (comment.id === parentId) {
      return { ...comment, replies: [...(comment.replies || []), reply] }
    }
    if (comment.replies?.length) {
      return { ...comment, replies: insertReaderV2Reply(comment.replies, parentId, reply) }
    }
    return comment
  })
}

/** Removes a deleted comment (and its replies, if any) from the tree. */
export function removeReaderV2Comment(list: Comment[], commentId: string): Comment[] {
  return list
    .filter((comment) => comment.id !== commentId)
    .map((comment) => (
      comment.replies?.length
        ? { ...comment, replies: removeReaderV2Comment(comment.replies, commentId) }
        : comment
    ))
}
