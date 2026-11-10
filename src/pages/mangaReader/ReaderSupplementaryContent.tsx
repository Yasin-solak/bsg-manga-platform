import type { Dispatch, SetStateAction } from 'react'

import { CommentThread } from '@components/common/CommentThread'
import type { FrameType } from '@components/common/AvatarFrame'
import PushAdoptionNudge from '@/components/common/PushAdoptionNudge'
import ChapterEndCreditRail from '@/components/fansub/ChapterEndCreditRail'
import type { ChapterCreditPresentation } from '@/components/fansub/chapterCreditPresentation'
import { MANGA_COMMENT_MAX_LENGTH, type CommentSortBy } from '@/services/commentService'
import type { ReportTargetType } from '@/services/reportService'
import type { Chapter, Comment, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface ReaderSupplementaryContentProps {
  chapter: Chapter
  chapterCreditLoading: boolean
  chapterCreditPresentation: ChapterCreditPresentation | null
  comments: Comment[]
  commentsLoading: boolean
  commentSortBy: CommentSortBy
  currentUserAvatar?: string
  currentUserFrameType?: FrameType | null
  inactiveCommentMessage: string
  inactiveReplyMessage: string
  isReaderCommentsEnabled: boolean
  isReportsEnabled: boolean
  mentionedMangas: RelatedManga[]
  newComment: string
  onAddComment: (isSpoiler?: boolean) => Promise<void> | void
  onDislike: (commentId: string) => void
  onLike: (commentId: string) => void
  onReport: (commentId: string, targetType?: ReportTargetType) => void
  onSortChange: Dispatch<SetStateAction<CommentSortBy>>
  onSubmitReply: (parentId: string, replyToReplyId?: string, isSpoiler?: boolean) => Promise<void> | void
  relatedFansubs: RelatedFansub[]
  repliedCommentId: string | null
  replyText: string
  setNewComment: Dispatch<SetStateAction<string>>
  setRepliedCommentId: Dispatch<SetStateAction<string | null>>
  setReplyText: Dispatch<SetStateAction<string>>
  users: RelatedUser[]
}

export function ReaderSupplementaryContent({
  chapter,
  chapterCreditLoading,
  chapterCreditPresentation,
  comments,
  commentsLoading,
  commentSortBy,
  currentUserAvatar,
  currentUserFrameType,
  inactiveCommentMessage,
  inactiveReplyMessage,
  isReaderCommentsEnabled,
  isReportsEnabled,
  mentionedMangas,
  newComment,
  onAddComment,
  onDislike,
  onLike,
  onReport,
  onSortChange,
  onSubmitReply,
  relatedFansubs,
  repliedCommentId,
  replyText,
  setNewComment,
  setRepliedCommentId,
  setReplyText,
  users,
}: ReaderSupplementaryContentProps) {
  return (
    <>
      {chapter.notes ? (
        <div className="mt-5 w-full max-w-[1100px]">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/80">{txa('Bölüm notu')}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/85">{chapter.notes}</p>
          </div>
        </div>
      ) : null}

      {chapterCreditPresentation ? (
        <div className="mt-5 w-full max-w-[1100px]">
          <ChapterEndCreditRail presentation={chapterCreditPresentation} />
        </div>
      ) : null}

      {chapter.fansub && chapterCreditLoading ? (
        <div className="mt-5 w-full max-w-[1100px]">
          <div className="h-[154px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.04]" />
        </div>
      ) : null}

      {/* Bolum sonu push onerisi: bir kez gosterilir, kendi durumunu yonetir
          (flag/destek/izin + localStorage) — uygun degilse hic render olmaz. */}
      <PushAdoptionNudge className="mt-5 w-full max-w-[1100px]" />

      <div className="mt-5 w-full max-w-[1100px]">
        <div className="rounded-xl border border-white/10 bg-black/45 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">{txa('Bölüm yorumları')}</h2>
              <p className="text-xs text-white/55">{txa('Bölüm tartışma alanı')}</p>
            </div>
            <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/60">
              {txa('Bölüm {v1}', { v1: chapter.chapterNumber })}
            </span>
          </div>

          {!isReaderCommentsEnabled && (
            <p className="mb-3 text-sm text-white/70">
              {inactiveCommentMessage} {txa('Okuma devam eder; yorum gönderimi sonra açılacaktır.')}
            </p>
          )}

          {commentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[96px] animate-pulse rounded-lg border border-white/10 bg-black/25"
                />
              ))}
            </div>
          ) : (
            <div className="dark" style={{ colorScheme: 'dark' }}>
              <CommentThread
                comments={comments}
                newComment={newComment}
                setNewComment={setNewComment}
                onAddComment={onAddComment}
                replyingTo={repliedCommentId}
                setReplyingTo={setRepliedCommentId}
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
                currentUserFrameType={currentUserFrameType ?? 'default'}
                mentionedUsers={users}
                relatedFansubs={relatedFansubs}
                mentionedMangas={mentionedMangas}
                sortBy={commentSortBy}
                onSortChange={onSortChange}
                hoverSideOffset={34}
                supporterAssetFansubId={chapter.fansub?.id}
                composerMaxLength={MANGA_COMMENT_MAX_LENGTH}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
