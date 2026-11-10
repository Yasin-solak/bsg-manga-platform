import { Link } from '@/i18n/router'
import AvatarFrame from '@components/common/AvatarFrame/AvatarFrame'
import { UserHoverCard } from '@components/common/UserHoverCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Heart, ThumbsDown, MessageCircle, Flag, Pin, Trash2 } from 'lucide-react'
import type { Comment } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface CommentItemProps {
    comment: Comment
    isAdmin: boolean
    currentUserId: string | null
    isReportsEnabled: boolean
    replyingTo: string | null
    replyText: string
    onLike: (id: string, isReply?: boolean, parentId?: string) => void
    onDislike: (id: string, isReply?: boolean, parentId?: string) => void
    onReply: (commentId: string, replyId?: string) => void
    onSubmitReply: (parentId: string, replyId?: string) => void
    onSetReplyText: (text: string) => void
    onCancelReply: () => void
    onPin: (id: string, pinned: boolean) => void
    onDelete: (id: string, userId?: string) => void
    onReport: (id: string) => void
    getProfilePath: (username?: string, fallbackId?: string) => string
    /** Is it a reply (nested)? */
    isReply?: boolean
    parentCommentId?: string
}

/**
 * MangaCommentItem: renders a single comment/reply.
 * Reused for main comments and replies.
 */
function MangaCommentItem({
    comment,
    isAdmin,
    currentUserId,
    isReportsEnabled,
    replyingTo,
    replyText,
    onLike,
    onDislike,
    onReply,
    onSubmitReply,
    onSetReplyText,
    onCancelReply,
    onPin,
    onDelete,
    onReport,
    getProfilePath,
    isReply = false,
    parentCommentId,
}: CommentItemProps) {
    const avatarSize = isReply ? 32 : 44
    const isOwner = currentUserId != null && currentUserId === comment.userId
    const canModerate = isAdmin || isOwner
    const replyKey = isReply && parentCommentId ? `${parentCommentId}-${comment.id}` : comment.id
    const isReplying = replyingTo === replyKey

    return (
        <div className={cn(
            'flex gap-3',
            !isReply && comment.isPinned && 'rounded-lg border border-primary/20 bg-primary/[0.03] p-3',
            !isReply && !comment.isPinned && 'py-1',
        )}>
            <UserHoverCard
                id={comment.userId}
                username={comment.username}
                avatar={comment.avatar}
                frameType={comment.frameType}
                primaryColor={comment.primaryColor}
                secondaryColor={comment.secondaryColor}
                profileBackgroundStyle={comment.profileBackgroundStyle}
                profileBackgroundVideoUrl={comment.profileBackgroundVideoUrl}
                profilePatternStyle={comment.profilePatternStyle}
            >
                <Link to={getProfilePath(comment.username, comment.userId)} className="shrink-0">
                    {comment.frameType && comment.frameType !== 'default' ? (
                        <AvatarFrame src={comment.avatar} alt={comment.username} frameType={comment.frameType} size={avatarSize} animated={false} hoverPlayback='never' />
                    ) : (
                        <img loading="lazy" decoding="async" src={comment.avatar} alt={comment.username} className={cn('rounded-full border border-border object-cover', isReply ? 'h-8 w-8' : 'h-11 w-11')} />
                    )}
                </Link>
            </UserHoverCard>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* Başlık */}
                <div className="flex flex-wrap items-center gap-2">
                    <UserHoverCard
                        id={comment.userId}
                        username={comment.username}
                        avatar={comment.avatar}
                        frameType={comment.frameType}
                        primaryColor={comment.primaryColor}
                        secondaryColor={comment.secondaryColor}
                        profileBackgroundStyle={comment.profileBackgroundStyle}
                        profileBackgroundVideoUrl={comment.profileBackgroundVideoUrl}
                        profilePatternStyle={comment.profilePatternStyle}
                        className="inline-block"
                    >
                        <Link
                            to={getProfilePath(comment.username, comment.userId)}
                            className="text-sm font-semibold hover:text-primary transition-colors"
                        >
                            {comment.username}
                        </Link>
                    </UserHoverCard>
                    <span className="text-xs text-muted-foreground">{comment.date}</span>
                    {comment.isPinned && <Badge variant="outline" className="h-5 gap-1 text-[10px]"><Pin className="h-2.5 w-2.5" /> {txa('Sabit')}</Badge>}
                </div>

                {/* Metin */}
                <p className={cn('text-sm leading-relaxed', isReply ? 'text-foreground/90' : 'text-foreground')}>{comment.text}</p>

                {/* Aksiyonlar */}
                <div className="flex items-center gap-1 -ml-1.5">
                    <button className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors', comment.isLiked ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')} onClick={() => onLike(comment.id, isReply, parentCommentId)}>
                        <Heart className={cn('h-3.5 w-3.5', comment.isLiked && 'fill-primary')} /> {comment.likes}
                    </button>
                    <button className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors', comment.isDisliked ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground')} onClick={() => onDislike(comment.id, isReply, parentCommentId)}>
                        <ThumbsDown className="h-3.5 w-3.5" /> {comment.dislikes ?? 0}
                    </button>
                    {!isReply && (
                        <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => onReply(comment.id)}>
                            <MessageCircle className="h-3.5 w-3.5" /> {txa('Yanıtla')}
                        </button>
                    )}
                    {isReply && parentCommentId && (
                        <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => onReply(parentCommentId, comment.id)}>
                            <MessageCircle className="h-3.5 w-3.5" /> {txa('Yanıtla')}
                        </button>
                    )}
                    {isReportsEnabled && (
                        <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors" onClick={() => onReport(comment.id)} title={txa('Raporla')}>
                            <Flag className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {canModerate && (
                        <>
                            {isAdmin && (
                                <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-primary transition-colors" onClick={() => onPin(comment.id, !!comment.isPinned)} title={comment.isPinned ? txa('Sabitlemeyi Kaldır') : txa('Sabitle')}>
                                    <Pin className="h-3.5 w-3.5" /> {comment.isPinned ? txa('Kaldır') : txa('Sabitle')}
                                </button>
                            )}
                            <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors" onClick={() => onDelete(comment.id, comment.userId)} title={txa('Sil')}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Yanıt formu */}
                {isReplying && (
                    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
                        <textarea
                            className="min-h-[60px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            placeholder={txa('Yanıtınızı yazın...')} value={replyText}
                            onChange={(e) => onSetReplyText(e.target.value)} rows={2}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={onCancelReply}>{txa('İptal')}</Button>
                            <Button size="sm" onClick={() => onSubmitReply(parentCommentId || comment.id, isReply ? comment.id : undefined)} disabled={!replyText.trim()}>{txa('Yanıtla')}</Button>
                        </div>
                    </div>
                )}

                {/* Nested yanıtlar (sadece ana yorumlar için) */}
                {!isReply && comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 space-y-3 border-l-2 border-border/50 pl-4">
                        {comment.replies.map((reply) => (
                            <MangaCommentItem
                                key={reply.id} comment={reply} isAdmin={isAdmin} currentUserId={currentUserId}
                                isReportsEnabled={isReportsEnabled} replyingTo={replyingTo} replyText={replyText}
                                onLike={onLike} onDislike={onDislike} onReply={onReply} onSubmitReply={onSubmitReply}
                                onSetReplyText={onSetReplyText} onCancelReply={onCancelReply} onPin={onPin}
                                onDelete={onDelete} onReport={onReport} getProfilePath={getProfilePath}
                                isReply parentCommentId={comment.id}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default MangaCommentItem
