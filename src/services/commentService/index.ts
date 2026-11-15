import { COMMENT_PAGE_SIZE, getCommentsPage } from './queries'
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
export type { CommentPage } from './queries'
export {
    deleteComment,
    dislikeComment,
    getCommentsPage,
    COMMENT_PAGE_SIZE,
    MANGA_COMMENT_MAX_LENGTH,
    likeComment,
    postComment,
    setCommentPinned,
    setCommentReaction,
}

export const commentService = {
    getCommentsPage,
    postComment,
    setCommentReaction,
    likeComment,
    dislikeComment,
    deleteComment,
    setCommentPinned,
}
