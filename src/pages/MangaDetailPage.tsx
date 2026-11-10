import { useParams } from 'react-router-dom'
import { useNavigate, Navigate } from '@/i18n/router'
import { useState, useEffect, useMemo, useCallback } from 'react'
import MangaContinueReadingCard from '@components/manga/MangaContinueReadingCard'
import RelatedMangaPanel from '@components/manga/RelatedMangaPanel'
import type { FrameType } from '@components/common/AvatarFrame'
import { ReportModal } from '@components/common/ReportModal/ReportModal'
import MangaDetailChapterList from '@/pages/mangaDetail/MangaDetailChapterList'
import MangaDetailCommentsPanel from '@/pages/mangaDetail/MangaDetailCommentsPanel'
import MangaDetailHeroCard from '@/pages/mangaDetail/MangaDetailHeroCard'
import MangaDetailInfoPanel from '@/pages/mangaDetail/MangaDetailInfoPanel'
import MangaCommunityChannels from '@/pages/mangaDetail/MangaCommunityChannels'
import { useMangaDetailDerived } from '@/pages/mangaDetail/useMangaDetailDerived'
import MangaDetailSimilarStrip from '@/pages/mangaDetail/MangaDetailSimilarStrip'
import MangaDetailTopBar from '@/pages/mangaDetail/MangaDetailTopBar'
import { useRegisterMobileTopBarOverride } from '@/components/layout/MobileTopBarOverrideContext'
import MangaDetailRatingModal from '@/pages/mangaDetail/MangaDetailRatingModal'
import {
    formatGenreLabel,
    isMangaNotFoundError,
    statusColor,
    statusLabel,
} from '@/pages/mangaDetail/mangaDetailPage.utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
    buildPublicMangaPath,
    resolvePublicMangaKey,
} from '@/lib/routes'
import { AlertTriangle, Loader2 } from 'lucide-react'

import type { Manga, Comment, Chapter, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import { getMangaByIdentifier, listRelatedMangasForDetail, getChaptersByMangaId, getMyMangaRating, submitMangaRating, type RelatedMangaSuggestion } from '@/services/mangaService'
import { commentService, MANGA_COMMENT_MAX_LENGTH, type CommentSortBy } from '@/services/commentService'
import { userService } from '@/services/userService'
import type { ReportTargetType } from '@/services/reportService'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { buildInactiveFeatureMessage, showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { resolveCommentMentionContext } from '@/services/commentMentionService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

const mangaDetailLogger = createScopedLogger('MangaDetailPage')

/* ============================
   ANA BILESEN
   ============================ */

function MangaDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [selectedTab, setSelectedTab] = useState<'info' | 'comments' | 'chapters'>('chapters')
    const [manga, setManga] = useState<Manga | null>(null)
    const [chapters, setChapters] = useState<Chapter[]>([])
    const [related, setRelated] = useState<RelatedMangaSuggestion[]>([])
    const [loadingRelated, setLoadingRelated] = useState(false)
    const [hasPrimedRelated, setHasPrimedRelated] = useState(false)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [comments, setComments] = useState<Comment[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [commentSortBy, setCommentSortBy] = useState<CommentSortBy>('newest')
    const [loadedCommentSortBy, setLoadedCommentSortBy] = useState<CommentSortBy | null>(null)
    const [newComment, setNewComment] = useState('')
    const [isFollowing, setIsFollowing] = useState(false)
    const [userRating, setUserRating] = useState(0)
    const [showRatingModal, setShowRatingModal] = useState(false)
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const [resolvedMentionedUsers, setResolvedMentionedUsers] = useState<RelatedUser[]>([])
    const [resolvedRelatedFansubs, setResolvedRelatedFansubs] = useState<RelatedFansub[]>([])
    const [resolvedMentionedMangas, setResolvedMentionedMangas] = useState<RelatedManga[]>([])
    const [isReportModalOpen, setIsReportModalOpen] = useState(false)
    const [reportTargetId, setReportTargetId] = useState('')
    const [reportTargetType, setReportTargetType] = useState<ReportTargetType>('manga_comment')
    const [isReportsEnabled, setIsReportsEnabled] = useState(false)
    const [isReaderCommentsEnabled, setIsReaderCommentsEnabled] = useState(false)
    const [currentUserFrameType, setCurrentUserFrameType] = useState<FrameType | null>('default')
    const [selectedVersions, setSelectedVersions] = useState<Record<number, string>>({})
    const [publicProfileId, setPublicProfileId] = useState<string | null>(null)
    const [continueReadingEntry, setContinueReadingEntry] = useState<{
        chapterId: string | null
        chapterNumber: number
        readAt: string | null
    } | null>(null)
    const [descExpanded, setDescExpanded] = useState(false)
    const inactiveCommentMessage = buildInactiveFeatureMessage(txa('Manga yorum gönderimi'))
    const inactiveReplyMessage = buildInactiveFeatureMessage(txa('Manga yorum yanıtı'))
    const { currentUser } = useAuth()
    const mangaId = manga?.id || null

    const resolveCommentMentions = async (rows: Comment[], signal?: AbortSignal) => {
        const requestContext = createRequestContext('MangaDetailPage', 'resolve-comment-mentions', {
            mangaId: mangaId,
            commentCount: rows.length,
        })
        try {
            const resolved = await resolveCommentMentionContext(rows, signal)
            if (signal?.aborted) return
            setResolvedMentionedUsers(resolved.mentionedUsers)
            setResolvedRelatedFansubs(resolved.relatedFansubs)
            setResolvedMentionedMangas(resolved.mentionedMangas)
        } catch (error) {
            if (signal?.aborted) return
            mangaDetailLogger.warn({
                event: requestContext.event,
                message: 'yorum mention baglami cozulmedi.',
                context: toRequestContextLogContext(requestContext),
                error,
            })
            setResolvedMentionedUsers([])
            setResolvedRelatedFansubs([])
            setResolvedMentionedMangas([])
        }
    }

    /* Feature flags */
    useEffect(() => {
        let c = false
        const load = async (force = false) => {
            const f = await getRuntimeFeatureFlags(['reader.comments', 'moderation.reports'], false, force)
            if (c) return
            setIsReaderCommentsEnabled(f['reader.comments'] === true)
            setIsReportsEnabled(f['moderation.reports'] === true)
        }
        void load()
        const unsub = listenFeatureFlagUpdates((p) => {
            if (p.key !== 'reader.comments' && p.key !== 'moderation.reports') return
            void load(true)
        })
        return () => { c = true; unsub() }
    }, [])
    useEffect(() => { if (!isReportsEnabled) setIsReportModalOpen(false) }, [isReportsEnabled])

    /* Main data load */
    useEffect(() => {
        let alive = true
        const controller = new AbortController()
        async function load() {
            if (!id) return
            const requestContext = createRequestContext('MangaDetailPage', 'load-manga-detail', {
                routeKey: id,
            })
            try {
                setLoading(true); setLoadError(null); setNotFound(false)
                const mangaData = await getMangaByIdentifier(id, controller.signal)
                if (!alive) return
                const canonicalKey = resolvePublicMangaKey({ id: mangaData.id, slug: mangaData.slug, title: mangaData.title })
                if (canonicalKey && canonicalKey !== id) {
                    navigate(buildPublicMangaPath({ id: mangaData.id, slug: mangaData.slug, title: mangaData.title }), { replace: true })
                }
                const chapterRows = await getChaptersByMangaId(mangaData.id, controller.signal)
                if (!alive) return
                setManga(mangaData)
                setChapters(chapterRows)
            } catch (err) {
                if (alive) {
                    if (isMangaNotFoundError(err)) {
                        setNotFound(true)
                        setLoadError(txa('Manga bulunamadı.'))
                    } else {
                        const reportedError = reportUserFacingError(mangaDetailLogger, {
                            event: requestContext.event,
                            error: err,
                            fallback: txa('Beklenmeyen bir hata oluştu.'),
                            requestContext,
                        })
                        setLoadError(reportedError.userMessage)
                    }
                }
            } finally { if (alive) setLoading(false) }
        }
        void load(); return () => { alive = false; controller.abort() }
    }, [id, navigate])

    useEffect(() => {
        setRelated([])
        setLoadingRelated(false)
        setHasPrimedRelated(false)
    }, [id])

    useEffect(() => {
        if (!manga?.id || hasPrimedRelated || typeof window === 'undefined') return

        const prime = () => {
            setHasPrimedRelated(true)
        }

        window.addEventListener('pointerdown', prime, { once: true, passive: true })
        window.addEventListener('keydown', prime, { once: true })
        window.addEventListener('scroll', prime, { once: true, passive: true })

        return () => {
            window.removeEventListener('pointerdown', prime)
            window.removeEventListener('keydown', prime)
            window.removeEventListener('scroll', prime)
        }
    }, [hasPrimedRelated, manga?.id])

    useEffect(() => {
        if (!manga || !hasPrimedRelated) return

        let alive = true
        const controller = new AbortController()
        setLoadingRelated(true)

        void listRelatedMangasForDetail(manga, { limit: 6 }, controller.signal)
            .then((items) => {
                if (!alive) return
                setRelated(items)
            })
            .catch((error) => {
                if (!alive || controller.signal.aborted) return
                mangaDetailLogger.warn({
                    event: 'load-related-mangas',
                    message: 'ilgili manga onerileri yuklenemedi.',
                    context: { mangaId: manga.id },
                    error,
                })
                setRelated([])
            })
            .finally(() => {
                if (alive) setLoadingRelated(false)
            })

        return () => {
            alive = false
            controller.abort()
        }
    }, [hasPrimedRelated, manga, mangaId])

    useEffect(() => {
        if (!currentUser) {
            setPublicProfileId(null)
            setCurrentUserFrameType('default')
            return
        }

        setPublicProfileId(currentUser.id)
        setCurrentUserFrameType((currentUser.frameType as FrameType) || 'default')
    }, [currentUser?.frameType, currentUser?.id])

    useEffect(() => {
        if (!mangaId) return
        if (!currentUser) {
            setIsFollowing(false)
            setUserRating(0)
            return
        }

        let alive = true
        const controller = new AbortController()
        const requestContext = createRequestContext('MangaDetailPage', 'load-current-user-context', {
            mangaId,
            routeKey: id,
            publicProfileId: currentUser.id,
        })

        void userService.isFollowingManga(currentUser.id, mangaId, controller.signal).then((nextFollowing) => {
            if (!alive) return
            setIsFollowing(nextFollowing)
        }).catch((error) => {
            if (controller.signal.aborted) return
            mangaDetailLogger.warn({
                event: requestContext.event,
                message: 'aktif kullanici takip durumu yuklenemedi.',
                context: toRequestContextLogContext(requestContext),
                error,
            })
        })

        void getMyMangaRating(mangaId, controller.signal).then((rating) => {
            if (!alive) return
            setUserRating(rating ?? 0)
        }).catch((error) => {
            if (controller.signal.aborted) return
            mangaDetailLogger.warn({
                event: 'load-my-manga-rating',
                message: 'aktif kullanici puani yuklenemedi.',
                context: toRequestContextLogContext(requestContext),
                error,
            })
        })

        return () => {
            alive = false
            controller.abort()
        }
    }, [currentUser?.id, id, mangaId])

    useEffect(() => {
        setComments([])
        setLoadedCommentSortBy(null)
        setResolvedMentionedUsers([])
        setResolvedRelatedFansubs([])
        setResolvedMentionedMangas([])
        setLoadingComments(false)
    }, [id])

    useEffect(() => {
        if (!mangaId) return
        if (selectedTab !== 'comments') return
        if (loadedCommentSortBy === commentSortBy) return
        let alive = true
        const controller = new AbortController()
        setLoadingComments(true)

        void (async () => {
            const requestContext = createRequestContext('MangaDetailPage', 'load-manga-comments', {
                mangaId,
                sortBy: commentSortBy,
            })
            try {
                const rows = await commentService.getComments(mangaId, {
                    sortBy: commentSortBy,
                    signal: controller.signal,
                })
                if (!alive) return
                setComments(rows as unknown as Comment[])
                setLoadedCommentSortBy(commentSortBy)
                if (controller.signal.aborted) return
                await resolveCommentMentions(rows as unknown as Comment[], controller.signal)
            } catch (error) {
                if (!alive) return
                mangaDetailLogger.warn({
                    event: requestContext.event,
                    message: 'manga yorumlari yuklenemedi.',
                    context: toRequestContextLogContext(requestContext),
                    error,
                })
                setComments([])
                setResolvedMentionedUsers([])
                setResolvedRelatedFansubs([])
                setResolvedMentionedMangas([])
            }
        })().finally(() => {
            if (alive) setLoadingComments(false)
        })

        return () => { alive = false; controller.abort() }
    }, [commentSortBy, loadedCommentSortBy, mangaId, selectedTab])

    useEffect(() => {
        if (!publicProfileId || !mangaId) {
            setContinueReadingEntry(null)
            return
        }

        let alive = true
        const controller = new AbortController()

        void (async () => {
            const requestContext = createRequestContext('MangaDetailPage', 'load-continue-reading', {
                mangaId,
                publicProfileId,
            })
            try {
                const row = await userService.getLatestReadingHistoryForManga(publicProfileId, mangaId, controller.signal)
                if (!alive) return

                const chapterNumber = Number(row?.chapter_number || 0)
                if (!row || !Number.isFinite(chapterNumber) || chapterNumber <= 0) {
                    setContinueReadingEntry(null)
                    return
                }

                setContinueReadingEntry({
                    chapterId: typeof row.chapter_id === 'string' ? row.chapter_id : null,
                    chapterNumber,
                    readAt: typeof row.read_at === 'string' ? row.read_at : null,
                })
            } catch (error) {
                if (!alive) return
                mangaDetailLogger.warn({
                    event: requestContext.event,
                    message: 'kaldigin yer bilgisi yuklenemedi.',
                    context: toRequestContextLogContext(requestContext),
                    error,
                })
                setContinueReadingEntry(null)
            }
        })()

        return () => { alive = false; controller.abort() }
    }, [mangaId, publicProfileId])

    useEffect(() => {
        if (!continueReadingEntry?.chapterId) return
        setSelectedVersions((prev) => {
            const matchedChapter = chapters.find((chapter) => chapter.id === continueReadingEntry.chapterId)
            if (!matchedChapter) return prev
            if (prev[matchedChapter.chapterNumber] === matchedChapter.id) return prev
            return {
                ...prev,
                [matchedChapter.chapterNumber]: matchedChapter.id,
            }
        })
    }, [chapters, continueReadingEntry?.chapterId])

    /* Yorum handler'lari */
    const updateCommentReactionInTree = (
        list: Comment[],
        commentId: string,
        patch: Pick<Comment, 'isLiked' | 'isDisliked' | 'likes' | 'dislikes'>,
    ): Comment[] => (
        list.map((comment) => {
            if (comment.id === commentId) return { ...comment, ...patch }
            if (comment.replies?.length) return { ...comment, replies: updateCommentReactionInTree(comment.replies, commentId, patch) }
            return comment
        })
    )

    const findCommentInTree = (list: Comment[], commentId: string): Comment | null => {
        for (const comment of list) {
            if (comment.id === commentId) return comment
            if (comment.replies?.length) {
                const found = findCommentInTree(comment.replies, commentId)
                if (found) return found
            }
        }
        return null
    }

    const handleLike = async (commentId: string) => {
        const current = findCommentInTree(comments, commentId)
        if (!current) return
        const nextReaction = current.isLiked ? 'none' : 'like'
        try {
            const result = await commentService.setCommentReaction(commentId, nextReaction)
            setComments((prev) => updateCommentReactionInTree(prev, commentId, {
                isLiked: result.isLiked,
                isDisliked: result.isDisliked,
                likes: result.likes,
                dislikes: result.dislikes,
            }))
        } catch (error) {
            const requestContext = createRequestContext('MangaDetailPage', 'like-comment', { mangaId, commentId, nextReaction })
            const reportedError = reportUserFacingError(mangaDetailLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Yorum reaksiyonu güncellenemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleDislike = async (commentId: string) => {
        const current = findCommentInTree(comments, commentId)
        if (!current) return
        const nextReaction = current.isDisliked ? 'none' : 'dislike'
        try {
            const result = await commentService.setCommentReaction(commentId, nextReaction)
            setComments((prev) => updateCommentReactionInTree(prev, commentId, {
                isLiked: result.isLiked,
                isDisliked: result.isDisliked,
                likes: result.likes,
                dislikes: result.dislikes,
            }))
        } catch (error) {
            const requestContext = createRequestContext('MangaDetailPage', 'dislike-comment', { mangaId, commentId, nextReaction })
            const reportedError = reportUserFacingError(mangaDetailLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Yorum reaksiyonu güncellenemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleAddComment = async (isSpoiler = false) => {
        if (!isReaderCommentsEnabled) { showInactiveFeatureToast(txa('Manga yorum gönderimi')); return }
        if (!newComment.trim() || !mangaId) return
        try {
            const created = await commentService.postComment(mangaId, newComment, undefined, { isSpoiler })
            const createdComment = created as unknown as Comment
            const nextComments = [createdComment, ...comments]
            setComments(nextComments)
            void resolveCommentMentions(nextComments)
            setNewComment('')
        } catch (error) {
            const requestContext = createRequestContext('MangaDetailPage', 'add-comment', { mangaId, hasText: Boolean(newComment.trim()) })
            const reportedError = reportUserFacingError(mangaDetailLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Yorum gönderilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleSubmitReply = async (parentId: string, replyToReplyId?: string, isSpoiler = false) => {
        if (!isReaderCommentsEnabled) { showInactiveFeatureToast(txa('Manga yorum yanıtı')); return }
        if (!replyText.trim() || !mangaId) return
        const actualParentId = replyToReplyId || parentId
        try {
            const created = await commentService.postComment(mangaId, replyText.trim(), actualParentId, { isSpoiler })
            const createdComment = created as unknown as Comment
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
            setReplyText('')
            setReplyingTo(null)
        } catch (error) {
            const requestContext = createRequestContext('MangaDetailPage', 'reply-comment', {
                mangaId,
                parentId: actualParentId,
            })
            const reportedError = reportUserFacingError(mangaDetailLogger, {
                event: requestContext.event,
                error,
                fallback: txa('Yanıt gönderilemedi.'),
                requestContext,
            })
            toast.error(reportedError.userMessage)
        }
    }

    const handleReport = (cid: string) => {
        if (!isReportsEnabled) { showInactiveFeatureToast('Raporlama sistemi'); return }
        // With a session, currentUser hydration may arrive late;
        // let the identity check in the service layer manage the modal opening.
        setReportTargetId(cid)
        setReportTargetType('manga_comment')
        setIsReportModalOpen(true)
    }

    /*
     * Chapter report: the target type is supported end to end (reports_target_type_check
     * includes 'chapter' in migration 241, and ReportModal has a title). The button
     * used to show showInactiveFeatureToast: a dead button in front of a working
     * pipeline.
     */
    const handleReportChapter = (chapterId: string) => {
        if (!isReportsEnabled) { showInactiveFeatureToast('Raporlama sistemi'); return }
        setReportTargetId(chapterId)
        setReportTargetType('chapter')
        setIsReportModalOpen(true)
    }

    const handleReportManga = useCallback(() => {
        if (!isReportsEnabled) { showInactiveFeatureToast('Raporlama sistemi'); return }
        if (!manga?.id) return
        setReportTargetId(manga.id)
        setReportTargetType('manga')
        setIsReportModalOpen(true)
    }, [isReportsEnabled, manga?.id])

    /* Takip & Puanlama */
    const openRatingModal = useCallback(() => { setShowRatingModal(true) }, [])

    const handleFollow = useCallback(async () => {
        if (!publicProfileId || !manga) return
        try { if (isFollowing) { await userService.unfollowManga(publicProfileId, manga.id); toast.info(txa('Takipten çıkıldı.')) } else { await userService.followManga(publicProfileId, manga.id); toast.success(txa('Takip edildi.')) }; setIsFollowing(!isFollowing) } catch (error) { const requestContext = createRequestContext('MangaDetailPage', 'toggle-follow-manga', { mangaId: manga.id, publicProfileId, nextFollowing: !isFollowing }); const reportedError = reportUserFacingError(mangaDetailLogger, { event: requestContext.event, error, fallback: txa('Takip işlemi sırasında hata oluştu.'), requestContext }); toast.error(reportedError.userMessage) }
    }, [isFollowing, manga, publicProfileId])
    const handleSubmitRating = async (r: number) => {
        if (!manga?.id || !currentUser) { toast.warning(txa('Puan vermek için giriş yapmalısınız!')); return }
        try { const res = await submitMangaRating(manga.id, r); setUserRating(res.userRating); setManga((p) => p ? { ...p, rating: res.averageRating ?? p.rating } : p); setShowRatingModal(false); toast.success(txa('Puaniniz kaydedildi.')) } catch (error) { const requestContext = createRequestContext('MangaDetailPage', 'submit-manga-rating', { mangaId: manga.id, rating: r, currentUserId: currentUser?.id || null }); const reportedError = reportUserFacingError(mangaDetailLogger, { event: requestContext.event, error, fallback: txa('Puan kaydedilemedi.'), requestContext }); toast.error(reportedError.userMessage) }
    }
    const { totalCommentCount, continueReadingChapter, continueReadingUrl, startReadingUrl } = useMangaDetailDerived(manga, chapters, comments, continueReadingEntry)
    const visibleCommentCount = loadedCommentSortBy ? totalCommentCount : undefined

    /*
     * Take over the mobile top bar (prototype: back | title | share | ⋯).
     * Registered BEFORE EARLY RETURNS: hooks cannot be called conditionally, and
     * the bar should belong to the page while loading too.
     */
    const mobileTopBar = useMemo(() => (
        <MangaDetailTopBar
            title={manga?.title || ''}
            onReport={isReportsEnabled && manga?.id ? handleReportManga : undefined}
            isFollowing={isFollowing}
            onFollowToggle={handleFollow}
            onOpenRating={openRatingModal}
            userRating={userRating}
        />
    ), [handleFollow, handleReportManga, isFollowing, isReportsEnabled, manga?.id, manga?.title, openRatingModal, userRating])
    useRegisterMobileTopBarOverride('manga-detail', mobileTopBar)

    /* ======== EARLY RETURNS ======== */
    if (loading) return (
        <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    )
    if (notFound) return <Navigate to={`/404?resource=manga&value=${encodeURIComponent(id || '')}`} replace />
    if (!manga || loadError) return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">{loadError || txa('Manga bulunamadı')}</p>
            <Button size="sm" onClick={() => navigate('/')}>{txa('Ana Sayfaya Dön')}</Button>
        </div>
    )

    /* ======== RENDER ======== */
    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">

                    {/* ======== SOL KOLON - Ana Icerik ======== */}
                    <div className="min-w-0 space-y-5">

                        <MangaDetailHeroCard
                            manga={manga}
                            chaptersCount={chapters.length}
                            startReadingUrl={startReadingUrl}
                            continueReadingUrl={continueReadingUrl}
                            isFollowing={isFollowing}
                            userRating={userRating}
                            selectedTab={selectedTab}
                            visibleCommentCount={visibleCommentCount}
                            descExpanded={descExpanded}
                            onToggleDescription={() => setDescExpanded((prev) => !prev)}
                            onSelectedTabChange={setSelectedTab}
                            onFollowToggle={() => { void handleFollow() }}
                            onOpenRating={() => setShowRatingModal(true)}
                            onReport={isReportsEnabled ? handleReportManga : undefined}
                            formatGenreLabel={formatGenreLabel}
                            statusLabel={statusLabel}
                            statusColor={statusColor}
                        />

                        {continueReadingEntry && continueReadingUrl ? (
                            <MangaContinueReadingCard
                                chapterNumber={continueReadingChapter?.chapterNumber || continueReadingEntry.chapterNumber}
                                continueUrl={continueReadingUrl}
                                readAt={continueReadingEntry.readAt}
                                title={continueReadingChapter?.title}
                            />
                        ) : null}

                        <MangaCommunityChannels key={`${manga.id}:${currentUser?.id || 'guest'}`} mangaId={manga.id} />

                        {/* --- TAB ICERIGI --- */}
                        {selectedTab === 'chapters' && (
                            <MangaDetailChapterList
                                manga={manga}
                                chapters={chapters}
                                searchQuery={searchQuery}
                                onSearchQueryChange={setSearchQuery}
                                selectedVersions={selectedVersions}
                                onSelectedVersionChange={(chapterNumber, versionId) => {
                                    setSelectedVersions((prev) => ({ ...prev, [chapterNumber]: versionId }))
                                }}
                                continueReadingChapterNumber={continueReadingEntry?.chapterNumber}
                                onReportChapter={isReportsEnabled ? handleReportChapter : undefined}
                            />
                        )}

                        {/*
                          Prototipte benzer seriler BOLUM LISTESININ ALTINDA duruyor.
                          Genis ekranda ayni oneriler sag kolonda zaten sabit, o yuzden
                          serit yalnizca dar ekranda cizilir (bilesen icinde lg:hidden).
                        */}
                        {selectedTab === 'chapters' && hasPrimedRelated ? (
                            <MangaDetailSimilarStrip
                                items={related}
                                loading={loadingRelated}
                                formatGenreLabel={formatGenreLabel}
                                genres={manga.genres}
                            />
                        ) : null}

                        {selectedTab === 'comments' && (
                            <MangaDetailCommentsPanel
                                comments={comments}
                                loadingComments={loadingComments}
                                loadedCommentSortBy={loadedCommentSortBy}
                                newComment={newComment}
                                setNewComment={setNewComment}
                                replyingTo={replyingTo}
                                setReplyingTo={setReplyingTo}
                                replyText={replyText}
                                setReplyText={setReplyText}
                                onAddComment={handleAddComment}
                                onSubmitReply={handleSubmitReply}
                                onLike={handleLike}
                                onDislike={handleDislike}
                                onReport={handleReport}
                                isReaderCommentsEnabled={isReaderCommentsEnabled}
                                isReportsEnabled={isReportsEnabled}
                                inactiveCommentMessage={inactiveCommentMessage}
                                inactiveReplyMessage={inactiveReplyMessage}
                                currentUserAvatar={currentUser?.avatar}
                                currentUserFrameType={currentUserFrameType}
                                mentionedUsers={resolvedMentionedUsers}
                                relatedFansubs={resolvedRelatedFansubs}
                                mentionedMangas={resolvedMentionedMangas}
                                commentSortBy={commentSortBy}
                                onCommentSortChange={setCommentSortBy}
                                composerMaxLength={MANGA_COMMENT_MAX_LENGTH}
                            />
                        )}

                        {selectedTab === 'info' && (
                            <MangaDetailInfoPanel
                                manga={manga}
                                chapters={chapters}
                                chaptersCount={chapters.length}
                                formatGenreLabel={formatGenreLabel}
                                statusLabel={statusLabel}
                            />
                        )}
                    </div>

                    {/* ======== SAG KOLON - Iliskili Mangalar ======== */}
                    <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
                        <RelatedMangaPanel
                            title={txa('İlişkili Mangalar')}
                            items={related}
                            emptyText={txa('İlişkili içerik yok.')}
                            loading={loadingRelated}
                            deferred={!hasPrimedRelated}
                            formatGenreLabel={formatGenreLabel}
                        />
                    </aside>
                </div>

            </div>

            <MangaDetailRatingModal
                isOpen={showRatingModal}
                userRating={userRating}
                onClose={() => setShowRatingModal(false)}
                onRatingChange={setUserRating}
                onSubmit={(rating) => { if (rating > 0) void handleSubmitRating(rating) }}
            />

            {isReportsEnabled && <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} targetId={reportTargetId} targetType={reportTargetType} />}
        </div>
    )
}

export default MangaDetailPage
