import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import FansubIdentityTagChip from '@components/common/FansubIdentityTagChip'
import { UserHoverCard } from '@components/common/UserHoverCard'
import CommunityRichText from '@components/common/CommunityRichText'
import { getRelativeTime } from '@components/community/communityUiShared'
import type { CommentSortBy } from '@/services/commentService'
import { listPublicFansubSupporterAssets, type FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import type { Comment, RelatedFansub, RelatedManga, RelatedUser } from '@types'
import { buildUserNameStyleProps } from '@/data/userNameStyle'
import { useNameSurfaceColors } from '@/lib/useNameSurfaceColors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
    Heart, ThumbsDown, Reply, Flag, Pin, Trash2,
    CornerDownRight, ChevronDown, ChevronUp,
    ArrowUpDown, Clock, Flame, ArrowDownAZ, MessageCircle, EyeOff,
} from 'lucide-react'
import { CommentThreadAutocompleteTextarea as AutocompleteTextarea } from './CommentThreadAutocompleteTextarea'
import { CommentThreadSpoilerBlock as CommentSpoilerBlock } from './CommentThreadSpoilerBlock'
import { txa } from '@/i18n/activeLocale'

// Sabitler

/** Visual depth limit; indentation does not grow past this level. */
const MAX_VISUAL_DEPTH = 2

/** Reply depth limit (root=0). New replies cannot open on depth >= 2 comments. */
const MAX_REPLY_DEPTH = 2

/** Baslangicta gosterilen yanit sayisi; fazlasi daraltilir. */
const INITIAL_VISIBLE_REPLIES = 5

/** Thread line colors; cycles by depth. */
const THREAD_COLORS = [
    'border-primary/25',
    'border-blue-500/25',
    'border-purple-500/25',
    'border-emerald-500/25',
] as const

/** Baslangicta gosterilecek root yorum sayisi. */
const INITIAL_ROOT_COMMENTS = 20

/** Additional root comments loaded by "Show more". */
const LOAD_MORE_COUNT = 20

/** Siralama secenekleri. */
const SORT_OPTIONS: { value: CommentSortBy; label: string; icon: typeof Clock }[] = [
    { value: 'newest', get label() { return txa('En yeni') }, icon: Clock },
    { value: 'oldest', get label() { return txa('En eski') }, icon: ArrowDownAZ },
    { value: 'popular', get label() { return txa('En popüler') }, icon: Flame },
]

// Tipler

export type CommentThreadVariant = 'manga' | 'community'
type MaybePromise<T> = T | Promise<T>

export interface CommentThreadProps {
    comments: Comment[]
    newComment: string
    setNewComment: (v: string) => void
    onAddComment: (isSpoiler: boolean) => MaybePromise<void>
    replyingTo: string | null
    setReplyingTo: (v: string | null) => void
    replyText: string
    setReplyText: (v: string) => void
    onSubmitReply: (parentId: string, replyToReplyId?: string, isSpoiler?: boolean) => MaybePromise<void>
    onLike: (commentId: string, isReply?: boolean, parentId?: string) => void
    onDislike: (commentId: string, isReply?: boolean, parentId?: string) => void
    variant?: CommentThreadVariant
    canModerate?: boolean
    onPin?: (commentId: string) => void
    onDelete?: (commentId: string) => void
    onReport?: (commentId: string) => void
    currentUserAvatar?: string
    currentUserFrameType?: FrameType | null
    allowCommentCreate?: boolean
    allowReplyCreate?: boolean
    allowReport?: boolean
    reportPassive?: boolean
    commentCreateDisabledMessage?: string
    replyCreateDisabledMessage?: string
    /** Resolved mention data; used for linking by CommunityRichText. */
    mentionedUsers?: RelatedUser[]
    relatedFansubs?: RelatedFansub[]
    mentionedMangas?: RelatedManga[]
    /** Siralama kontrolleri disaridan yonetilir. */
    sortBy?: CommentSortBy
    onSortChange?: (sort: CommentSortBy) => void
    /** Horizontal gap between the hover card and trigger (px). */
    hoverSideOffset?: number
    supporterAssetFansubId?: string
    composerMaxLength?: number
}

function CommentThread({
    comments,
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
    variant = 'community',
    canModerate = false,
    onPin,
    onDelete,
    onReport,
    currentUserAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=current',
    currentUserFrameType = 'default',
    allowCommentCreate = true,
    allowReplyCreate = true,
    allowReport = true,
    reportPassive = false,
    commentCreateDisabledMessage = txa('Yorum gönderimi şu anda aktif değil.'),
    replyCreateDisabledMessage = txa('Yanıt gönderimi şu anda aktif değil.'),
    mentionedUsers = [],
    relatedFansubs = [],
    mentionedMangas = [],
    sortBy = 'newest',
    onSortChange,
    hoverSideOffset = 12,
    supporterAssetFansubId,
    composerMaxLength,
}: CommentThreadProps) {
    const isCommunity = variant === 'community'
    const [supporterAssets, setSupporterAssets] = useState<FansubSupporterAssetCatalogItem[]>([])
    // Keeps the name style readable on light / dark backgrounds: a contrast shield if the color is too close.
    const nameSurfaces = useNameSurfaceColors()
    const [newCommentIsSpoiler, setNewCommentIsSpoiler] = useState(false)
    const [replyIsSpoiler, setReplyIsSpoiler] = useState(false)
    const [revealedSpoilerComments, setRevealedSpoilerComments] = useState<Set<string>>(new Set())
    const [isSubmittingComment, setIsSubmittingComment] = useState(false)
    const [submittingReplyKey, setSubmittingReplyKey] = useState<string | null>(null)
    const resolvedCurrentUserAvatar = currentUserAvatar?.trim()
        || 'https://api.dicebear.com/7.x/avataaars/svg?seed=current'

    // Tracks which comments have all replies open.
    const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())

    // Kac root yorumun gorunur oldugunu tutar.
    const [visibleRootCount, setVisibleRootCount] = useState(INITIAL_ROOT_COMMENTS)

    // Is the sort dropdown open?
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

    useEffect(() => {
        if (!supporterAssetFansubId) {
            setSupporterAssets([])
            return
        }

        let alive = true

        void (async () => {
            try {
                const catalog = await listPublicFansubSupporterAssets(supporterAssetFansubId)
                if (!alive) return
                setSupporterAssets(catalog)
            } catch {
                if (!alive) return
                setSupporterAssets([])
            }
        })()

        return () => {
            alive = false
        }
    }, [supporterAssetFansubId])

    useEffect(() => {
        if (!newComment.trim()) {
            setNewCommentIsSpoiler(false)
        }
    }, [newComment])

    useEffect(() => {
        if (!replyingTo || !replyText.trim()) {
            setReplyIsSpoiler(false)
        }
    }, [replyText, replyingTo])

    const toggleExpand = (commentId: string) => {
        setExpandedThreads((prev) => {
            const next = new Set(prev)
            if (next.has(commentId)) next.delete(commentId)
            else next.add(commentId)
            return next
        })
    }

    const toggleSpoilerReveal = (commentId: string) => {
        setRevealedSpoilerComments((prev) => {
            const next = new Set(prev)
            if (next.has(commentId)) next.delete(commentId)
            else next.add(commentId)
            return next
        })
    }

    /**
     * Renders comments recursively.
     * @param c              - Comment object
     * @param depth          - Real tree depth (0 = root)
     * @param rootId         - Id of the top-level root comment
     * @param parentUsername - Username of the parent comment
     */
    const renderComment = (
        c: Comment,
        depth: number,
        rootId: string,
        parentUsername?: string,
    ) => {
        const isReply = depth > 0
        const replyKey = isReply ? `${rootId}-${c.id}` : c.id
        const isReplying = replyingTo === replyKey
        const profilePath = `/profil/${encodeURIComponent((c.username || '').trim() || c.userId)}`

        // Goreceli zaman
        const timeAgo = c.date ? getRelativeTime(c.date) || c.date : ''

        // Visual depth; does not grow past MAX_VISUAL_DEPTH.
        const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH)
        const canReplyCurrentComment = allowReplyCreate && depth < MAX_REPLY_DEPTH
        const replyDisabledReason = !allowReplyCreate
            ? replyCreateDisabledMessage
            : depth >= MAX_REPLY_DEPTH
                ? txa('Bu yorumda yanıt derinlik limitine ulaşıldı.')
                : undefined

        // Avatar boyutu; derin yanitlarda yeniden buyutulur.
        const avatarSize = depth >= 2 ? 36 : (depth === 0 ? 36 : 28)

        // Thread cizgi rengi
        const threadColor = THREAD_COLORS[depth % THREAD_COLORS.length]

        // Collapse / expand logic for replies.
        const replies = c.replies ?? []
        const hasReplies = replies.length > 0
        const isExpanded = expandedThreads.has(c.id)
        const shouldCollapse = replies.length > INITIAL_VISIBLE_REPLIES && !isExpanded
        const visibleReplies = shouldCollapse ? replies.slice(0, INITIAL_VISIBLE_REPLIES) : replies
        const hiddenCount = replies.length - INITIAL_VISIBLE_REPLIES

        // The "reply to" indicator appears only on deep replies.
        const replyTargetUsername = parentUsername?.trim() ?? ''
        const showReplyTarget = depth >= 2 && replyTargetUsername.length > 0
        const isSpoilerRevealed = revealedSpoilerComments.has(c.id)
        const isReplyTooLong = typeof composerMaxLength === 'number' && replyText.length > composerMaxLength
        const isCurrentReplySubmitting = submittingReplyKey === replyKey

        return (
            <div key={c.id} data-testid={`comment-thread-item-${c.id}`} className="group/comment">
                <div
                    data-hover-card-boundary
                    className={cn(
                        'flex gap-2.5',
                        !isReply && c.isPinned && 'rounded-lg bg-primary/5 px-3 py-2.5',
                    )}
                    style={visualDepth > 0 ? { marginLeft: `${visualDepth * 24}px` } : undefined}
                >
                    {/* Avatar */}
                    <UserHoverCard
                        id={c.userId}
                        username={c.username}
                        avatar={c.avatar}
                        frameType={c.frameType as FrameType | undefined}
                        primaryColor={c.primaryColor}
                        secondaryColor={c.secondaryColor}
                        profileBackgroundStyle={c.profileBackgroundStyle}
                        profileBackgroundVideoUrl={c.profileBackgroundVideoUrl}
                        profilePatternStyle={c.profilePatternStyle}
                        sideOffset={hoverSideOffset}
                        className="shrink-0"
                    >
                        <Link to={profilePath} className="shrink-0 mt-0.5">
                            {c.frameType && c.frameType !== 'default' ? (
                                <AvatarFrame
                                    src={c.avatar}
                                    alt={c.username}
                                    frameType={c.frameType as FrameType}
                                    size={avatarSize}
                                    animated={true}
                                    customOverlayUrl={c.frameCustomOverlayUrl}
                                    posterOverlayUrl={c.framePosterOverlayUrl}
                                />
                            ) : (
                                <img loading="lazy" decoding="async"
                                    src={c.avatar}
                                    alt=""
                                    className="rounded-full object-cover"
                                    style={{ width: avatarSize, height: avatarSize }}
                                />
                            )}
                        </Link>
                    </UserHoverCard>

                    {/* Icerik */}
                    <div className="min-w-0 flex-1 space-y-1">
                        {/* Ust satir */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <UserHoverCard
                                id={c.userId}
                                username={c.username}
                                avatar={c.avatar}
                                frameType={c.frameType as FrameType | undefined}
                                primaryColor={c.primaryColor}
                                secondaryColor={c.secondaryColor}
                                profileBackgroundStyle={c.profileBackgroundStyle}
                                profileBackgroundVideoUrl={c.profileBackgroundVideoUrl}
                                profilePatternStyle={c.profilePatternStyle}
                                sideOffset={hoverSideOffset}
                                className="inline-block"
                            >
                                {/* Premium yazarin isim stili (efekt / font / renk / hareket) satirdaki adda da gorunur. */}
                                <Link
                                    to={profilePath}
                                    data-testid={c.nameStyle ? `comment-thread-styled-name-${c.id}` : undefined}
                                    className={cn(
                                        'no-underline',
                                        c.nameStyle
                                            ? buildUserNameStyleProps(c.nameStyle, { guardSurfaces: nameSurfaces }).className
                                            : 'font-semibold hover:text-primary transition-colors',
                                        depth === 0 ? 'text-sm' : 'text-[13px]',
                                    )}
                                    style={c.nameStyle ? buildUserNameStyleProps(c.nameStyle, { guardSurfaces: nameSurfaces }).style : undefined}
                                >
                                    {c.username}
                                </Link>
                            </UserHoverCard>
                            <FansubIdentityTagChip tag={c.activeFansubIdentityTag} size="xs" />

                            {/* Kime yanit bilgisi sadece derin yanitlarda gorunur. */}
                            {showReplyTarget && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/60">
                                    <CornerDownRight className="size-2.5" />
                                    <UserHoverCard
                                        username={replyTargetUsername}
                                        avatar={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(replyTargetUsername)}`}
                                        sideOffset={hoverSideOffset}
                                        className="inline-block"
                                    >
                                        <Link
                                            to={`/profil/${encodeURIComponent(replyTargetUsername)}`}
                                            className="text-primary/60 font-medium no-underline hover:text-primary/80 transition-colors"
                                        >
                                            @{replyTargetUsername}
                                        </Link>
                                    </UserHoverCard>
                                </span>
                            )}

                            <span className="text-[11px] text-muted-foreground/50">.</span>
                            <span className="text-[11px] text-muted-foreground/50">{timeAgo}</span>

                            {!isReply && c.isPinned && (
                                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-1">
                                    <Pin className="size-2.5 mr-0.5" />{txa('Sabit')}
                                </Badge>
                            )}

                            {c.isSpoiler && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300">
                                    <EyeOff className="size-2.5 mr-0.5" />{txa('Spoiler')}
                                </Badge>
                            )}

                            {!isCommunity && canModerate && !isReply && onPin && onDelete && (
                                <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 pointer-coarse:opacity-100">
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onPin(c.id)} title={c.isPinned ? txa('Sabitlemeyi kaldır') : txa('Sabitle')}>
                                        <Pin className="size-2.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => onDelete(c.id)} title={txa('Sil')}>
                                        <Trash2 className="size-2.5" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Yorum metni */}
                        <div className={cn('min-w-0 text-foreground', depth === 0 ? 'text-sm' : 'text-[13px]')}>
                            {c.isSpoiler ? (
                                <CommentSpoilerBlock
                                    isRevealed={isSpoilerRevealed}
                                    onToggle={() => toggleSpoilerReveal(c.id)}
                                >
                                    <CommunityRichText
                                        text={c.text}
                                        mentionedUsers={mentionedUsers}
                                        relatedFansubs={relatedFansubs}
                                        mentionedMangas={mentionedMangas}
                                        supporterAssets={supporterAssets}
                                        unknownMentionUserLinkMode="profile"
                                        enableUserMentionHover
                                        mentionHoverSideOffset={hoverSideOffset}
                                        className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
                                    />
                                </CommentSpoilerBlock>
                            ) : (
                                <CommunityRichText
                                    text={c.text}
                                    mentionedUsers={mentionedUsers}
                                    relatedFansubs={relatedFansubs}
                                    mentionedMangas={mentionedMangas}
                                    supporterAssets={supporterAssets}
                                    unknownMentionUserLinkMode="profile"
                                    enableUserMentionHover
                                    mentionHoverSideOffset={hoverSideOffset}
                                    className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed"
                                />
                            )}
                        </div>

                        {/* Aksiyon butonlari */}
                        <div className="flex items-center gap-0.5 -ml-2">
                            <Button
                                variant="ghost" size="sm"
                                className={cn('h-6 gap-1 text-[11px] px-2', c.isLiked && 'text-red-500')}
                                onClick={() => onLike(c.id, isReply, rootId)}
                            >
                                <Heart className={cn('size-3', c.isLiked && 'fill-current')} />
                                {c.likes > 0 && c.likes}
                            </Button>
                            <Button
                                variant="ghost" size="sm"
                                className={cn('h-6 gap-1 text-[11px] px-2', c.isDisliked && 'text-blue-500')}
                                onClick={() => onDislike(c.id, isReply, rootId)}
                            >
                                <ThumbsDown className="size-3" />
                                {(c.dislikes ?? 0) > 0 && (c.dislikes ?? 0)}
                            </Button>
                            <Button
                                variant="ghost" size="sm"
                                className="h-6 gap-1 text-[11px] px-2"
                                disabled={!canReplyCurrentComment}
                                title={!canReplyCurrentComment ? replyDisabledReason : undefined}
                                onClick={() => {
                                    if (!canReplyCurrentComment) return
                                    setReplyingTo(isReplying ? null : replyKey)
                                }}
                            >
                                <Reply className="size-3" /> {canReplyCurrentComment ? txa('Yanıtla') : txa('Yanıt limiti')}
                            </Button>
                            {onReport && (allowReport || reportPassive) && (
                                <Button
                                    variant="ghost" size="sm"
                                    /*
                                     * `pointer-coarse:opacity-100` is REQUIRED: the button
                                     * was only visible on hover, and touch devices have NO hover,
                                     * so reporting a comment was unreachable on phones
                                     * (a user asked "did you remove it?"; it was not removed,
                                     * just invisible).
                                     */
                                    className={cn(
                                        'h-6 text-[11px] px-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/comment:opacity-100 pointer-coarse:opacity-100',
                                        reportPassive && 'opacity-60 group-hover/comment:opacity-100 pointer-coarse:opacity-60',
                                    )}
                                    aria-label={txa('Raporla')}
                                    data-testid={`comment-thread-report-${c.id}`}
                                    onClick={() => onReport(c.id)}
                                    title={reportPassive ? txa('Raporlama şu anda aktif değil') : txa('Raporla')}
                                >
                                    <Flag className="size-3" />
                                </Button>
                            )}
                        </div>

                        {/* Yanit formu */}
                        {isReplying && canReplyCurrentComment && (
                            <div className="mt-1.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <CornerDownRight className="size-3 text-primary/50" />
                                    <span className="font-medium text-primary/70">@{c.username}</span>
                                    <span>{txa('kullanıcısına yanıt')}</span>
                                </div>
                                <AutocompleteTextarea
                                    text={replyText}
                                    setText={setReplyText}
                                    placeholder={txa('@{username} kullanıcısına yanıt yaz...', { username: c.username })}
                                    rows={2}
                                    className="text-sm"
                                    autoFocus
                                    expressionContextFansubId={supporterAssetFansubId}
                                    supporterAssets={supporterAssets}
                                    isSpoiler={replyIsSpoiler}
                                    onToggleSpoiler={() => setReplyIsSpoiler((prev) => !prev)}
                                    maxLength={composerMaxLength}
                                />
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setReplyingTo(null); setReplyText(''); setReplyIsSpoiler(false) }}>
                                        {txa('İptal')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                            if (isReply) {
                                                submitReply(rootId, c.id, replyIsSpoiler, replyKey)
                                            } else {
                                                submitReply(c.id, undefined, replyIsSpoiler, replyKey)
                                            }
                                        }}
                                        disabled={!replyText.trim() || isReplyTooLong || Boolean(submittingReplyKey)}
                                    >
                                        {isCurrentReplySubmitting ? txa('Gönderiliyor...') : txa('Gönder')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Alt yanitlar */}
                {hasReplies && (
                    <div className={cn('mt-1', isReply ? '' : 'mt-1.5')}>
                        <div
                            className={cn('border-l-2', threadColor)}
                            style={{ marginLeft: `${(visualDepth * 24) + (avatarSize / 2)}px` }}
                        >
                            {visibleReplies.map((r) =>
                                renderComment(
                                    r,
                                    depth + 1,
                                    depth === 0 ? c.id : rootId,
                                    c.username,
                                ),
                            )}

                            {replies.length > INITIAL_VISIBLE_REPLIES && (
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(c.id)}
                                    className={cn(
                                        'flex items-center gap-1.5 py-1.5 text-[12px] font-medium text-primary/70 hover:text-primary transition-colors cursor-pointer',
                                        'bg-transparent border-none',
                                    )}
                                    style={{ marginLeft: `${Math.min(depth + 1, MAX_VISUAL_DEPTH) * 24 + 8}px` }}
                                >
                                    {isExpanded ? (
                                        <><ChevronUp className="size-3.5" /> {txa('Yanıtları gizle')}</>
                                    ) : (
                                        <><ChevronDown className="size-3.5" /> {txa('{v1} yanıt daha göster', { v1: hiddenCount })}</>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Toplam yorum sayisi (root + yanitlar, ozyinelemeli).
    const totalCommentCount = useMemo(() => {
        function countAll(list: Comment[]): number {
            let count = 0
            for (const c of list) {
                count += 1
                if (c.replies?.length) count += countAll(c.replies)
            }
            return count
        }
        return countAll(comments)
    }, [comments])

    // Limit visible root comments by pagination.
    const visibleComments = useMemo(
        () => comments.slice(0, visibleRootCount),
        [comments, visibleRootCount],
    )
    const hasMoreComments = comments.length > visibleRootCount
    const remainingCount = comments.length - visibleRootCount
    const isNewCommentTooLong = typeof composerMaxLength === 'number' && newComment.length > composerMaxLength

    const submitNewComment = () => {
        if (isSubmittingComment || !allowCommentCreate || !newComment.trim() || isNewCommentTooLong) return

        setIsSubmittingComment(true)
        void Promise.resolve()
            .then(() => onAddComment(newCommentIsSpoiler))
            .catch(() => undefined)
            .finally(() => setIsSubmittingComment(false))
    }

    const submitReply = (
        parentId: string,
        replyToReplyId: string | undefined,
        isSpoiler: boolean,
        submissionKey: string,
    ) => {
        if (submittingReplyKey || !replyText.trim()) return
        const isReplyTooLong = typeof composerMaxLength === 'number' && replyText.length > composerMaxLength
        if (isReplyTooLong) return

        setSubmittingReplyKey(submissionKey)
        void Promise.resolve()
            .then(() => onSubmitReply(parentId, replyToReplyId, isSpoiler))
            .catch(() => undefined)
            .finally(() => setSubmittingReplyKey(null))
    }

    // Reset pagination when the sort changes.
    const handleSortChange = (newSort: CommentSortBy) => {
        setVisibleRootCount(INITIAL_ROOT_COMMENTS)
        setSortDropdownOpen(false)
        onSortChange?.(newSort)
    }

    // Render

    return (
        <div className="space-y-5">
            {/* Ana yorum formu */}
            <div className="space-y-2.5">
                <div className="flex gap-2.5">
                    {currentUserFrameType && currentUserFrameType !== 'default' ? (
                        <AvatarFrame src={resolvedCurrentUserAvatar} alt="Current user" frameType={currentUserFrameType} size={36} animated={false} hoverPlayback='never' />
                    ) : (
                        <img loading="lazy" decoding="async" src={resolvedCurrentUserAvatar} alt="Current user" className="size-9 shrink-0 rounded-full object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                        <AutocompleteTextarea
                            text={newComment}
                            setText={setNewComment}
                            testId="comment-thread-input"
                            ariaLabel={txa('Yorum metni')}
                            placeholder={allowCommentCreate ? txa('Düşüncelerini paylaş... @kullanici #etiket') : commentCreateDisabledMessage}
                            rows={2}
                            disabled={!allowCommentCreate}
                            className="text-sm"
                            expressionContextFansubId={supporterAssetFansubId}
                            supporterAssets={supporterAssets}
                            isSpoiler={newCommentIsSpoiler}
                            onToggleSpoiler={() => setNewCommentIsSpoiler((prev) => !prev)}
                            maxLength={composerMaxLength}
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button size="sm" className="h-8 text-xs px-4" onClick={submitNewComment} disabled={!allowCommentCreate || !newComment.trim() || isNewCommentTooLong || isSubmittingComment}>
                        {isSubmittingComment ? txa('Gönderiliyor...') : txa('Yorum Yap')}
                    </Button>
                </div>
            </div>

            {/* Siralama ve sayac */}
            {comments.length > 0 && (
                <div className="flex items-center justify-between">
                    {/* Sol: toplam yorum sayisi */}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MessageCircle className="size-4" />
                        <span className="font-medium text-foreground">{totalCommentCount}</span>
                        <span>{txa('yorum')}</span>
                    </div>

                    {/* Sag: siralama dropdown */}
                    {onSortChange && (
                        <div className="relative">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setSortDropdownOpen((prev) => !prev)}
                            >
                                <ArrowUpDown className="size-3" />
                                {txa(SORT_OPTIONS.find((o) => o.value === sortBy)?.label || txa('Sırala'))}
                                <ChevronDown className={cn('size-3 transition-transform', sortDropdownOpen && 'rotate-180')} />
                            </Button>

                            {sortDropdownOpen && (
                                <>
                                    {/* Disari tiklaninca dropdown kapanir. */}
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setSortDropdownOpen(false)}
                                    />
                                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
                                        {SORT_OPTIONS.map((option) => {
                                            const Icon = option.icon
                                            const isActive = sortBy === option.value
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
                                                        isActive
                                                            ? 'bg-primary/10 text-primary font-medium'
                                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                                    )}
                                                    onClick={() => handleSortChange(option.value)}
                                                >
                                                    <Icon className="size-3.5" />
                                                    {txa(option.label)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Yorum listesi */}
            <div className="space-y-4 lg:pl-6 xl:pl-8">
                {visibleComments.map((c) => renderComment(c, 0, c.id))}
            </div>

            {/* "Daha fazla goster" butonu */}
            {hasMoreComments && (
                <div className="flex justify-center pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setVisibleRootCount((prev) => prev + LOAD_MORE_COUNT)}
                    >
                        <ChevronDown className="size-3.5" />
                        {remainingCount > LOAD_MORE_COUNT
                            ? txa('{count} yorum daha göster', { count: LOAD_MORE_COUNT })
                            : txa('Kalan {count} yorumu göster', { count: remainingCount })
                        }
                    </Button>
                </div>
            )}
        </div>
    )
}

export default CommentThread




