import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Navigate, useNavigate, useSearchParams } from '@/i18n/router'
import type { Comment } from '@/types'
import { cn } from '@/lib/utils'
import { buildPublicMangaPath } from '@/lib/routes'
import type { FrameType } from '@components/common/AvatarFrame'
import { ReportModal } from '@components/common/ReportModal/ReportModal'
import { Button } from '@/components/ui/button'
import {
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Flag,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  Settings2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { commentService, type CommentSortBy } from '@/services/commentService'
import type { ReportTargetType } from '@/services/reportService'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { buildInactiveFeatureMessage, showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/services/toastService'
import { useReaderPreferences } from '@/hooks/useReaderPreferences'
import { READER_IMAGE_FIT_MODE_OPTIONS } from '@/services/readerPreferencesService'
import { ReaderSupplementaryContent } from '@/pages/mangaReader/ReaderSupplementaryContent'
import {
  getHorizontalReaderImageClassName,
  getHorizontalReaderViewportClassName,
  getHorizontalReaderZoomWrapperClassName,
  getVerticalReaderDeckClassName,
  getVerticalReaderImageClassName,
  isOriginalReaderImageFitMode,
  readerImageFitModeLabel,
} from '@/pages/mangaReader/readerDisplayPresentation'
import { useMangaReaderData } from '@/pages/mangaReader/useMangaReaderData'
import { useReaderViewportController } from '@/pages/mangaReader/useReaderViewportController'
import { txa } from '@/i18n/activeLocale'

function updateCommentReactionInTree(
  list: Comment[],
  commentId: string,
  patch: Pick<Comment, 'isLiked' | 'isDisliked' | 'likes' | 'dislikes'>,
): Comment[] {
  return list.map((comment) => {
    if (comment.id === commentId) return { ...comment, ...patch }
    if (comment.replies?.length) {
      return { ...comment, replies: updateCommentReactionInTree(comment.replies, commentId, patch) }
    }
    return comment
  })
}

function findCommentInTree(list: Comment[], commentId: string): Comment | null {
  for (const comment of list) {
    if (comment.id === commentId) return comment
    if (comment.replies?.length) {
      const found = findCommentInTree(comment.replies, commentId)
      if (found) return found
    }
  }
  return null
}

function MangaReaderPage() {
  const { id, chapterNumber, fansubKey } = useParams<{ id: string; chapterNumber: string; fansubKey?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const versionId = searchParams.get('version')
  const { currentUser } = useAuth()
  const { preferences, updatePreferences } = useReaderPreferences()

  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const horizontalPageViewportRef = useRef<HTMLDivElement>(null)
  const horizontalDetailRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const [commentSortBy, setCommentSortBy] = useState<CommentSortBy>('newest')
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportTargetId, setReportTargetId] = useState('')
  const [reportTargetType, setReportTargetType] = useState<ReportTargetType>('manga_comment')
  const [isReportsEnabled, setIsReportsEnabled] = useState(false)
  const [isReaderCommentsEnabled, setIsReaderCommentsEnabled] = useState(false)
  const [isBoostSystemEnabled, setIsBoostSystemEnabled] = useState(false)

  const inactiveCommentMessage = buildInactiveFeatureMessage(txa('Manga yorum gönderimi'))
  const inactiveReplyMessage = buildInactiveFeatureMessage(txa('Manga yorum yanıtı'))

  useEffect(() => {
    let cancelled = false
    const loadFeatureFlags = async (forceRefresh = false) => {
      const flags = await getRuntimeFeatureFlags(['reader.comments', 'moderation.reports', 'boost.system'], false, forceRefresh)
      if (cancelled) return
      setIsReaderCommentsEnabled(flags['reader.comments'] === true)
      setIsReportsEnabled(flags['moderation.reports'] === true)
      setIsBoostSystemEnabled(flags['boost.system'] === true)
    }

    void loadFeatureFlags()
    const unsubscribe = listenFeatureFlagUpdates((payload) => {
      if (payload.key !== 'reader.comments' && payload.key !== 'moderation.reports' && payload.key !== 'boost.system') return
      void loadFeatureFlags(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isReportsEnabled) return
    setIsReportModalOpen(false)
  }, [isReportsEnabled])

  const {
    allChapters,
    chapter,
    chapterCreditLoading,
    chapterCreditPresentation,
    comments,
    commentsLoading,
    loading,
    mangaId,
    mangaSlug,
    mangaTitle,
    notFound,
    pages,
    resolvedMentionedMangas,
    resolvedMentionedUsers,
    resolvedRelatedFansubs,
    resolveCommentMentions,
    setComments,
  } = useMangaReaderData({
    chapterNumber,
    commentSortBy,
    fansubKey,
    id,
    isBoostSystemEnabled,
    locationPathname: location.pathname,
    locationSearch: location.search,
    navigate,
    currentUserId: currentUser?.id ?? null,
    versionId,
  })

  const {
    autoScroll,
    autoScrollSpeed,
    backwardLabel,
    canGoBackward,
    canGoForward,
    currentPage,
    forwardLabel,
    goNextPage,
    goPrevPage,
    handleBackward,
    handleForward,
    hideBars,
    imageFitMode,
    isFirstPage,
    isFullscreen,
    isHorizontalPagedMode,
    isLastPage,
    keyboardHint,
    readerChapterNumber,
    readerModeSummaryLabel,
    readerProgressLabel,
    safePageIndex,
    scrollProgress,
    scrollToStart,
    selectChapterNumber,
    setAutoScroll,
    setShowSettings,
    seamlessStrip,
    showSettings,
    sortedChapters,
    toggleFs,
    toggleSeamlessStrip,
    updateAutoScrollSpeed,
    updateReaderImageFitMode,
    zoomIn,
    zoomLevel,
    zoomOut,
    zoomStyle,
  } = useReaderViewportController({
    allChapters,
    chapter,
    chapterNumber,
    containerRef,
    contentRef,
    endRef,
    horizontalDetailRef,
    horizontalPageViewportRef,
    mangaId,
    mangaSlug,
    mangaTitle,
    navigate,
    pages,
    preferences,
    updatePreferences,
  })

  useEffect(() => {
    setReplyingTo(null)
    setReplyText('')
    setNewComment('')
  }, [chapter?.id])

  const handleAddComment = async (isSpoiler = false) => {
    if (!isReaderCommentsEnabled) {
      showInactiveFeatureToast(txa('Manga yorum gönderimi'))
      return
    }
    if (!mangaId || !chapter?.id || !newComment.trim()) return

    try {
      const row = await commentService.postComment(mangaId, newComment.trim(), undefined, { chapterId: chapter.id, isSpoiler })
      const createdComment = row as unknown as Comment
      const nextComments = [createdComment, ...comments]
      setComments(nextComments)
      void resolveCommentMentions(nextComments)
      setNewComment('')
      toast.success(txa('Yorum gönderildi.'))
    } catch (error) {
      console.error('[MangaReaderPage] add chapter comment error', error)
      const message = error instanceof Error ? error.message : txa('Yorum gönderilemedi.')
      toast.error(message)
    }
  }

  const handleSubmitReply = async (parentId: string, replyToReplyId?: string, isSpoiler = false) => {
    if (!isReaderCommentsEnabled) {
      showInactiveFeatureToast(txa('Manga yorum yanıtı'))
      return
    }
    if (!mangaId || !chapter?.id || !replyText.trim()) return
    const actualParentId = replyToReplyId || parentId

    try {
      const row = await commentService.postComment(mangaId, replyText.trim(), actualParentId, { chapterId: chapter.id, isSpoiler })
      const createdComment = row as unknown as Comment
      const addRecursive = (list: Comment[]): Comment[] => (
        list.map((comment) => {
          if (comment.id === actualParentId) {
            return { ...comment, replies: [...(comment.replies || []), createdComment] }
          }
          if (comment.replies?.length) {
            return { ...comment, replies: addRecursive(comment.replies) }
          }
          return comment
        })
      )
      const nextComments = addRecursive(comments)
      setComments(nextComments)
      void resolveCommentMentions(nextComments)
      setReplyingTo(null)
      setReplyText('')
      toast.success(txa('Yanıt gönderildi.'))
    } catch (error) {
      console.error('[MangaReaderPage] add chapter reply error', error)
      const message = error instanceof Error ? error.message : txa('Yanıt gönderilemedi.')
      toast.error(message)
    }
  }

  const handleLike = async (commentId: string) => {
    const current = findCommentInTree(comments, commentId)
    if (!current) return
    const nextReaction = current.isLiked ? 'none' : 'like'
    try {
      const result = await commentService.setCommentReaction(commentId, nextReaction)
      setComments((previous) => updateCommentReactionInTree(previous, commentId, {
        isLiked: result.isLiked,
        isDisliked: result.isDisliked,
        likes: result.likes,
        dislikes: result.dislikes,
      }))
    } catch (error) {
      console.error('[MangaReaderPage] handleLike error', error)
      toast.error(txa('Yorum reaksiyonu güncellenemedi.'))
    }
  }

  const handleDislike = async (commentId: string) => {
    const current = findCommentInTree(comments, commentId)
    if (!current) return
    const nextReaction = current.isDisliked ? 'none' : 'dislike'
    try {
      const result = await commentService.setCommentReaction(commentId, nextReaction)
      setComments((previous) => updateCommentReactionInTree(previous, commentId, {
        isLiked: result.isLiked,
        isDisliked: result.isDisliked,
        likes: result.likes,
        dislikes: result.dislikes,
      }))
    } catch (error) {
      console.error('[MangaReaderPage] handleDislike error', error)
      toast.error(txa('Yorum reaksiyonu güncellenemedi.'))
    }
  }

  const handleReport = (commentId: string) => {
    if (!isReportsEnabled) {
      showInactiveFeatureToast('Raporlama sistemi')
      return
    }
    // With a session, currentUser hydration may arrive late;
    // let the identity check in the service layer manage the modal opening.
    setReportTargetId(commentId)
    setReportTargetType('manga_comment')
    setIsReportModalOpen(true)
  }

  const handleReportChapter = (chapterId: string) => {
    if (!isReportsEnabled) {
      showInactiveFeatureToast('Raporlama sistemi')
      return
    }
    // This chapter is one fansub's upload (chapters.id is fansub-specific);
    // the report is attributed to the right fansub.
    setReportTargetId(chapterId)
    setReportTargetType('chapter')
    setIsReportModalOpen(true)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    )
  }

  if (!chapter) {
    if (notFound) {
      return <Navigate to={`/404?resource=chapter&value=${encodeURIComponent(`${id || ''}:${chapterNumber || ''}`)}`} replace />
    }
    return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black text-white/60">{txa('Bölüm bulunamadı.')}</div>
  }

  const readerSupplementaryContent = (
    <ReaderSupplementaryContent
      chapter={chapter}
      chapterCreditLoading={chapterCreditLoading}
      chapterCreditPresentation={chapterCreditPresentation}
      comments={comments}
      commentsLoading={commentsLoading}
      commentSortBy={commentSortBy}
      currentUserAvatar={currentUser?.avatar}
      currentUserFrameType={(currentUser?.frameType as FrameType | null) ?? 'default'}
      inactiveCommentMessage={inactiveCommentMessage}
      inactiveReplyMessage={inactiveReplyMessage}
      isReaderCommentsEnabled={isReaderCommentsEnabled}
      isReportsEnabled={isReportsEnabled}
      mentionedMangas={resolvedMentionedMangas}
      newComment={newComment}
      onAddComment={handleAddComment}
      onDislike={handleDislike}
      onLike={handleLike}
      onReport={handleReport}
      onSortChange={setCommentSortBy}
      onSubmitReply={handleSubmitReply}
      relatedFansubs={resolvedRelatedFansubs}
      repliedCommentId={replyingTo}
      replyText={replyText}
      setNewComment={setNewComment}
      setRepliedCommentId={setReplyingTo}
      setReplyText={setReplyText}
      users={resolvedMentionedUsers}
    />
  )

  return (
    <div ref={containerRef} className={cn('fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-black text-white')}>
      <header
        className={cn(
          'shrink-0 border-b border-white/10 bg-black/95 backdrop-blur-md transition-all duration-200',
          hideBars && 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10" onClick={() => navigate('/')}>
              <Home className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => navigate(buildPublicMangaPath({ id: mangaId || id, slug: mangaSlug, title: mangaTitle }))}
            >
              <BookOpen className="h-4 w-4" /> <span className="hidden sm:inline text-xs">{txa('Seri')}</span>
            </Button>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <select
              className="h-8 min-w-0 max-w-[300px] cursor-pointer truncate rounded-md border border-white/15 bg-white/10 px-2.5 text-sm font-medium text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              value={String(readerChapterNumber)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                selectChapterNumber(Number(event.target.value))
              }}
            >
              {sortedChapters.map((item) => (
                <option key={`${item.chapterNumber}:${item.id}`} value={item.chapterNumber} className="bg-neutral-900 text-white">
                  {txa('Bölüm {number}', { number: item.chapterNumber })}{item.title ? ` - ${item.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {isReportsEnabled ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={txa('Bölümü raporla')}
                className="h-8 text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => handleReportChapter(chapter.id)}
              >
                <Flag className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className={cn('h-8 text-white/80 hover:text-white hover:bg-white/10', showSettings && 'bg-white/15 text-white')}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-white/80 hover:text-white hover:bg-white/10" onClick={toggleFs}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="h-0.5 w-full bg-white/10">
          <div className="h-full bg-primary transition-[width] duration-150 ease-out" style={{ width: `${scrollProgress}%` }} />
        </div>
      </header>

      {showSettings && !hideBars ? (
        <div className="shrink-0 border-b border-white/15 bg-black/90 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/70">{txa('Zoom')}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/10" onClick={zoomOut} disabled={zoomLevel === 50}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[3rem] text-center text-sm font-semibold text-white">{zoomLevel}%</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/80 hover:text-white hover:bg-white/10" onClick={zoomIn} disabled={zoomLevel === 200}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="h-5 w-px bg-white/15" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/70">{txa('Mod')}</span>
              <div className="flex items-center rounded-full border border-white/15 bg-white/5 p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    !isHorizontalPagedMode ? 'bg-primary text-black' : 'text-white/65 hover:text-white',
                  )}
                  onClick={() => updatePreferences({ layoutMode: 'vertical' })}
                >
                  {txa('Dikey akış')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    isHorizontalPagedMode ? 'bg-primary text-black' : 'text-white/65 hover:text-white',
                  )}
                  onClick={() => updatePreferences({ layoutMode: 'horizontal-paged' })}
                >
                  {txa('Yatay sayfa')}
                </button>
              </div>
            </div>

            <div className="h-5 w-px bg-white/15" />

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/70">{txa('Görünüm')}</span>
              <div className="flex flex-wrap items-center rounded-2xl border border-white/15 bg-white/5 p-1">
                {READER_IMAGE_FIT_MODE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      imageFitMode === option ? 'bg-primary text-black' : 'text-white/65 hover:text-white',
                    )}
                    onClick={() => updateReaderImageFitMode(option)}
                  >
                    {readerImageFitModeLabel(option)}
                  </button>
                ))}
              </div>
            </div>

            {!isHorizontalPagedMode ? (
              <>
                <div className="h-5 w-px bg-white/15" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white/70">{txa('Webtoon')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={seamlessStrip}
                    aria-label={txa('Webtoon modu: sayfalar arasındaki boşluğu kaldır')}
                    onClick={toggleSeamlessStrip}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      seamlessStrip ? 'bg-primary' : 'bg-white/20',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]',
                        seamlessStrip ? 'left-[18px]' : 'left-0.5',
                      )}
                    />
                  </button>
                  <span className="text-[11px] text-white/50">
                    {seamlessStrip ? txa('Kesintisiz şerit') : txa('Sayfa aralıklı')}
                  </span>
                </div>
              </>
            ) : null}

            <div className="h-5 w-px bg-white/15" />

            <p className="text-xs text-white/60">{keyboardHint}</p>
            {isHorizontalPagedMode ? (
              <>
                <div className="h-5 w-px bg-white/15" />
                <p className="text-xs text-white/55">{txa('Otomatik kaydırma yalnız dikey akışta çalışır.')}</p>
              </>
            ) : null}
            {imageFitMode === 'original' ? (
              <>
                <div className="h-5 w-px bg-white/15" />
                <p className="text-xs text-white/55">{txa('Orijinal mod taşan sayfalar için yatay veya dikey kaydırma açar.')}</p>
              </>
            ) : null}
            {isHorizontalPagedMode && imageFitMode === 'fit-width' ? (
              <>
                <div className="h-5 w-px bg-white/15" />
                <p className="text-xs text-white/55">{txa('Uzun sayfalar sahne içinde dikey kaydırılır.')}</p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={isHorizontalPagedMode ? undefined : contentRef}
        className={cn(
          'flex flex-1 flex-col items-center bg-neutral-950',
          isHorizontalPagedMode ? 'overflow-hidden px-0 py-0' : 'overflow-y-auto px-2 py-4',
          !isHorizontalPagedMode && isOriginalReaderImageFitMode(imageFitMode) ? 'overflow-x-auto' : 'overflow-x-hidden',
        )}
      >
        {isHorizontalPagedMode ? (
          <div className="flex h-full w-full flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col px-2 py-4">
              {currentPage ? (
                <div className="flex min-h-0 flex-1 flex-col space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/65">
                    <span>{readerModeSummaryLabel}</span>
                    <span>{readerProgressLabel}</span>
                  </div>

                  {/* overflow-hidden: sahne icindeki sayfa gorseli hicbir
                      kosulda alttaki yorum paneline tasmasin (tasan alan
                      tiklamalari yutuyordu). */}
                  <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
                    <button
                      type="button"
                      aria-label={backwardLabel}
                      className="absolute inset-y-0 left-0 z-10 w-[18%] min-w-[72px] cursor-w-resize bg-transparent transition-colors hover:bg-gradient-to-r hover:from-white/[0.05] hover:to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                      onClick={handleBackward}
                    >
                      <span className="sr-only">{backwardLabel}</span>
                    </button>

                    <button
                      type="button"
                      aria-label={forwardLabel}
                      className="absolute inset-y-0 right-0 z-10 w-[18%] min-w-[72px] cursor-e-resize bg-transparent transition-colors hover:bg-gradient-to-l hover:from-white/[0.05] hover:to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                      onClick={handleForward}
                    >
                      <span className="sr-only">{forwardLabel}</span>
                    </button>

                    <div ref={horizontalPageViewportRef} className={getHorizontalReaderViewportClassName(imageFitMode)}>
                      <div className={getHorizontalReaderZoomWrapperClassName(imageFitMode)} style={zoomStyle}>
                        <img
                          src={currentPage}
                          alt={txa('Sayfa {number}', { number: safePageIndex + 1 })}
                          className={getHorizontalReaderImageClassName(imageFitMode)}
                          loading="eager"
                        />
                      </div>
                    </div>
                  </div>

                  {pages.length > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
                      <span>{txa('{v1} sayfalık bölüm', { v1: pages.length })}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30"
                          disabled={isFirstPage}
                          onClick={goPrevPage}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="hidden sm:inline">{txa('Önceki sayfa')}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30"
                          disabled={isLastPage}
                          onClick={goNextPage}
                        >
                          <span className="hidden sm:inline">{txa('Sonraki sayfa')}</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="w-full rounded-lg border border-dashed border-white/20 px-6 py-12 text-center text-white/70">{txa('Bu bölümde henüz sayfa yok.')}</div>
                </div>
              )}
            </div>

            {/* Yorum paneli 42vh iken okuyucunun neredeyse yarisini yiyor ve
                sayfa sahnesi kisa ekranlarda 200px'e kadar duşuyordu. Okuma
                alani onceliklidir; panel kendi icinde kaydirilabilir. */}
            <div ref={horizontalDetailRef} className="max-h-[min(32vh,420px)] w-full overflow-y-auto border-t border-white/10 bg-black/55 px-2 py-4">
              <div className="flex flex-col items-center">
                {readerSupplementaryContent}
              </div>
            </div>
          </div>
        ) : (
          <div className={getVerticalReaderDeckClassName(imageFitMode, seamlessStrip)} style={zoomStyle}>
            {pages.length > 0 ? pages.map((page, index) => (
              <img
                key={index}
                src={page}
                alt={txa('Sayfa {number}', { number: index + 1 })}
                className={getVerticalReaderImageClassName(imageFitMode)}
                loading="lazy"
              />
            )) : (
              <div className="w-full max-w-lg rounded-lg border border-dashed border-white/20 px-6 py-12 text-center text-white/70">{txa('Bu bölümde henüz sayfa yok.')}</div>
            )}
            <div ref={endRef} className="h-px w-px" aria-hidden />
          </div>
        )}
        {!isHorizontalPagedMode ? readerSupplementaryContent : null}
      </div>

      <footer
        className={cn(
          'shrink-0 border-t border-white/15 bg-black/95 backdrop-blur-md transition-all duration-200',
          hideBars && 'pointer-events-none translate-y-full opacity-0',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30" disabled={!canGoBackward} onClick={handleBackward}>
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline text-xs">{backwardLabel}</span>
          </Button>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isHorizontalPagedMode ? (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-7 gap-1 px-2 text-xs font-medium',
                    autoScroll ? 'bg-primary/25 text-primary hover:bg-primary/35' : 'text-white/80 hover:text-white hover:bg-white/10',
                  )}
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{autoScroll ? txa('Kaydırma açık') : txa('Oto kaydır')}</span>
                </Button>
                {autoScroll ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={30}
                      max={220}
                      step={10}
                      value={autoScrollSpeed}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateAutoScrollSpeed(Number(event.target.value))}
                      className="w-16 accent-primary sm:w-20"
                    />
                    <span className="text-[11px] font-medium text-white/70">{autoScrollSpeed}px/s</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isHorizontalPagedMode ? <div className="hidden h-4 w-px bg-white/15 sm:block" /> : null}

            <span className="text-xs font-medium text-white/70">{readerProgressLabel}</span>
            <span className="text-xs font-medium text-white/70">{Math.round(scrollProgress)}%</span>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-white/70 hover:text-white hover:bg-white/10"
              onClick={scrollToStart}
            >
              <ArrowUp className="h-3 w-3" /> <span className="hidden sm:inline">{isHorizontalPagedMode ? txa('İlk sayfa') : txa('Başa dön')}</span>
            </Button>
          </div>

          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30" disabled={!canGoForward} onClick={handleForward}>
            <span className="hidden sm:inline text-xs">{forwardLabel}</span> <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>

      {isReportsEnabled ? (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          targetId={reportTargetId}
          targetType={reportTargetType}
        />
      ) : null}
    </div>
  )
}

export default MangaReaderPage
