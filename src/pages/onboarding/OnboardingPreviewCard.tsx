import { ExternalLink, ListOrdered, MessageCircle, Sparkles, Users } from 'lucide-react'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface OnboardingPreviewCardProps {
    username: string
    displayName?: string
    avatar: string
    bio?: string
    frameType?: string | null
    className?: string
}

function normalizeBioText(value?: string) {
    return (value || '')
        .replace(/\r\n/g, '\n')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function OnboardingPreviewCard({
    username,
    displayName,
    avatar,
    bio,
    frameType = 'default',
    className,
}: OnboardingPreviewCardProps) {
    const normalizedBio = normalizeBioText(bio)
    const resolvedFrameType = frameType || 'default'

    return (
        <div className={cn('mt-5 w-full', className)}>
            <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {txa('Onizleme')}
            </p>
            <Card className="flex flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl">
                <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible p-4">
                    <div className="flex items-start gap-3">
                        <div className="relative z-20 shrink-0">
                            <AvatarFrame
                                src={avatar}
                                alt={displayName || username}
                                frameType={resolvedFrameType}
                                size={56}
                                animated={true}
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 break-words font-semibold text-foreground">
                                {displayName || username}
                            </h3>
                            <p className="max-w-full truncate text-xs text-muted-foreground">@{username}</p>
                            <p className="mt-1 text-[11px] font-medium text-primary">
                                {txa('Onboarding icinde canli kart onizlemesi')}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-3">
                        <div className="flex flex-1 items-center gap-4">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Users className="size-3.5" />
                                <span>{txa('0 takipci')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MessageCircle className="size-3.5" />
                                <span>{txa('0 gonderi')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 border-t border-border/50 pt-3">
                        <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            <Sparkles className="size-3" />
                            {txa('Hakkinda')}
                        </p>
                        <p className="mt-2 max-h-24 overflow-y-auto break-words whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]">
                            {normalizedBio || txa('Bu kullanici henuz kendisi hakkinda bir aciklama eklemedi.')}
                        </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/40 py-2 text-xs font-medium text-muted-foreground">
                            <ListOrdered className="size-3" />
                            {txa('Liste')}
                        </div>
                        <div className="flex items-center justify-center gap-1.5 rounded-md bg-primary/10 py-2 text-xs font-medium text-primary">
                            {txa('Profili Goruntule')}
                            <ExternalLink className="size-3" />
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}

export default OnboardingPreviewCard
