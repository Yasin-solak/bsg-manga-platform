import { Loader2 } from 'lucide-react'
import { CommentThread } from '@components/common/CommentThread'
import type { FrameType } from '@components/common/AvatarFrame'
import type { CommentSortBy } from '@/services/commentService'
import type { Comment, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface MangaDetailCommentsPanelProps {
  comments: Comment[]
  loadingComments: boolean
  loadedCommentSortBy: CommentSortBy | null
  newComment: string
  setNewComment: (value: string) => void
  replyingTo: string | null
  setReplyingTo: (value: string | null) => void
  replyText: string
  setReplyText: (value: string) => void
  onAddComment: (isSpoiler?: boolean) => Promise<void> | void
  onSubmitReply: (parentId: string, replyToReplyId?: string, isSpoiler?: boolean) => Promise<void> | void
  onLike: (commentId: string) => void
  onDislike: (commentId: string) => void
  onReport: (commentId: string) => void
  isReaderCommentsEnabled: boolean
  isReportsEnabled: boolean
  inactiveCommentMessage: string
  inactiveReplyMessage: string
  currentUserAvatar?: string
  currentUserFrameType: FrameType | null
  mentionedUsers: RelatedUser[]
  relatedFansubs: RelatedFansub[]
  mentionedMangas: RelatedManga[]
  commentSortBy: CommentSortBy
  onCommentSortChange: (value: CommentSortBy) => void
  composerMaxLength: number
}

export default function MangaDetailCommentsPanel({
  comments,
  loadingComments,
  loadedCommentSortBy,
  newComment,
  setNewComment,
  replyingTo,
  setReplyingTo,
  replyText,
  setReplyText,
  onAddComment,
  onSubmitReply,
  onLike,
  onDislike,
  onReport,
  isReaderCommentsEnabled,
  isReportsEnabled,
  inactiveCommentMessage,
  inactiveReplyMessage,
  currentUserAvatar,
  currentUserFrameType,
  mentionedUsers,
  relatedFansubs,
  mentionedMangas,
  commentSortBy,
  onCommentSortChange,
  composerMaxLength,
}: MangaDetailCommentsPanelProps) {
  return (
    <div className="space-y-4">
      {!isReaderCommentsEnabled ? (
        <p className="m-0 text-sm text-muted-foreground">
          {inactiveCommentMessage}{' '}{txa('Okuma ve yorum listesi gorunur kalir; gonderim sonra acilacaktir.')}
        </p>
      ) : null}

      {loadingComments && !loadedCommentSortBy ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border/60 bg-card/40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {txa('Yorumlar yükleniyor...')}
          </div>
        </div>
      ) : null}

      {!loadingComments || loadedCommentSortBy ? (
        <CommentThread
          comments={comments}
          newComment={newComment}
          setNewComment={setNewComment}
          onAddComment={onAddComment}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          replyText={replyText}
          setReplyText={setReplyText}
          onSubmitReply={onSubmitReply}
          onLike={onLike}
          onDislike={onDislike}
          onReport={onReport}
          allowCommentCreate={isReaderCommentsEnabled}
          allowReplyCreate={isReaderCommentsEnabled}
          allowReport={isReportsEnabled}
          reportPassive={!isReportsEnabled}
          commentCreateDisabledMessage={inactiveCommentMessage}
          replyCreateDisabledMessage={inactiveReplyMessage}
          variant="community"
          currentUserAvatar={currentUserAvatar}
          currentUserFrameType={currentUserFrameType}
          mentionedUsers={mentionedUsers}
          relatedFansubs={relatedFansubs}
          mentionedMangas={mentionedMangas}
          sortBy={commentSortBy}
          onSortChange={onCommentSortChange}
          hoverSideOffset={34}
          composerMaxLength={composerMaxLength}
        />
      ) : null}
    </div>
  )
}
