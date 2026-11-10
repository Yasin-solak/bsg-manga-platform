/**
 * Chapter end comment block (v2).
 *
 * In v1 comments sat in a panel pinned under the reader: clipped on narrow
 * screens, and overflowing images swallowed clicks (why the emoji/sticker
 * picker could not be clicked). Here comments are a normal part of the chapter end
 * flow, with no pinned layer, at full width.
 *
 * The report dialog is here too: notifications after a report must appear above the
 * reader (toast layer z-[10100], reader shell z-[9000]).
 */

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { CommentThread } from '@components/common/CommentThread'
import { ReportModal } from '@components/common/ReportModal/ReportModal'
import { MANGA_COMMENT_MAX_LENGTH, type CommentSortBy } from '@/services/commentService'
import { buildInactiveFeatureMessage, showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import type { Comment, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import type { FrameType } from '@components/common/AvatarFrame'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2CommentsProps {
  chapterNumber: number | undefined
  fansubId: string | undefined
  comments: Comment[]
  isLoading: boolean
  sortBy: CommentSortBy
  onSortChange: (sort: CommentSortBy) => void
  newComment: string
  setNewComment: (value: string) => void
  onAddComment: (isSpoiler: boolean) => void | Promise<void>
  replyingTo: string | null
  setReplyingTo: (value: string | null) => void
  replyText: string
  setReplyText: (value: string) => void
  onSubmitReply: (parentId: string, replyToReplyId?: string, isSpoiler?: boolean) => void | Promise<void>
  onLike: (commentId: string) => void
  onDislike: (commentId: string) => void
  mentionedUsers: RelatedUser[]
  relatedFansubs: RelatedFansub[]
  mentionedMangas: RelatedManga[]
  commentsEnabled: boolean
  reportsEnabled: boolean
  currentUserAvatar?: string
  currentUserFrameType?: FrameType | null
}

export function ReaderV2Comments({
  chapterNumber,
  fansubId,
  comments,
  isLoading,
  sortBy,
  onSortChange,
  newComment,
  setNewComment,
  onAddComment,
  replyingTo,
  setReplyingTo,
  replyText,
  setReplyText,
  onSubmitReply,
  onLike,
  onDislike,
  mentionedUsers,
  relatedFansubs,
  mentionedMangas,
  commentsEnabled,
  reportsEnabled,
  currentUserAvatar,
  currentUserFrameType,
}: ReaderV2CommentsProps) {
  const [reportTargetId, setReportTargetId] = useState('')
  const [isReportOpen, setIsReportOpen] = useState(false)

  const inactiveCommentMessage = buildInactiveFeatureMessage(txa('Manga yorum gonderimi'))
  const inactiveReplyMessage = buildInactiveFeatureMessage(txa('Manga yorum yaniti'))

  const handleReport = (commentId: string) => {
    if (!reportsEnabled) {
      showInactiveFeatureToast(txa('Raporlama sistemi'))
      return
    }
    setReportTargetId(commentId)
    setIsReportOpen(true)
  }

  return (
    <section
      data-testid="reader-v2-end-comments"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-white/50" />
          <div>
            <h3 className="text-sm font-black text-white">{txa('Bolum yorumlari')}</h3>
            <p className="text-[11px] text-white/45">{txa('Bolum tartisma alani')}</p>
          </div>
        </div>
        {typeof chapterNumber === 'number' ? (
          <span className="rounded-full border border-white/12 px-2 py-1 text-[11px] text-white/55">
            {txa('Bolum {v1}', { v1: chapterNumber })}
          </span>
        ) : null}
      </div>

      {!commentsEnabled ? (
        <p className="mb-3 text-sm text-white/65">
          {inactiveCommentMessage}{' '}{txa('Okuma devam eder; yorum gonderimi sonra acilacaktir.')}
        </p>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-white/10 bg-black/25" />
          ))}
        </div>
      ) : (
        <div className="dark" style={{ colorScheme: 'dark' }}>
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
            onReport={handleReport}
            allowCommentCreate={commentsEnabled}
            allowReplyCreate={commentsEnabled}
            allowReport={reportsEnabled}
            reportPassive={!reportsEnabled}
            commentCreateDisabledMessage={inactiveCommentMessage}
            replyCreateDisabledMessage={inactiveReplyMessage}
            variant="community"
            currentUserAvatar={currentUserAvatar}
            currentUserFrameType={currentUserFrameType ?? 'default'}
            mentionedUsers={mentionedUsers}
            relatedFansubs={relatedFansubs}
            mentionedMangas={mentionedMangas}
            sortBy={sortBy}
            onSortChange={onSortChange}
            hoverSideOffset={34}
            supporterAssetFansubId={fansubId}
            composerMaxLength={MANGA_COMMENT_MAX_LENGTH}
          />
        </div>
      )}

      {reportsEnabled ? (
        <ReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          targetId={reportTargetId}
          targetType="manga_comment"
        />
      ) : null}
    </section>
  )
}

export default ReaderV2Comments
