import { getComments } from './queries'
import {
    deleteComment,
    dislikeComment,
    likeComment,
    postComment,
    setCommentPinned,
    setCommentReaction,
} from './mutations'
import { MANGA_COMMENT_MAX_LENGTH } from './constants'

export type { Comment, CommentSortBy } from './types'
export {
    deleteComment,
    dislikeComment,
    getComments,
    MANGA_COMMENT_MAX_LENGTH,
    likeComment,
    postComment,
    setCommentPinned,
    setCommentReaction,
}

export const commentService = {
    getComments,
    postComment,
    setCommentReaction,
    likeComment,
    dislikeComment,
    deleteComment,
    setCommentPinned,
}
