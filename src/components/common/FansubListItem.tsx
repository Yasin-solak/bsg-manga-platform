import { Link } from '@/i18n/router'
import { AvatarFrame, FrameType } from './AvatarFrame'
import { BookOpen, Users } from 'lucide-react'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubListItemProps {
    id?: string
    slug?: string
    name: string
    avatar: string
    description?: string
    mangaCount?: number
    followerCount?: number
    frameType?: FrameType | string
    /** Left accent border color: the fansub's primaryColor value */
    primaryColor?: string
}

/**
 * FansubListItem: Discord server discovery style list item.
 * Recognizable with a left accent border, minimal info, hover effect.
 * Video/background is not loaded here: shown only in FansubHoverCard for performance.
 */
function FansubListItem({
    id = '1',
    slug,
    name,
    avatar,
    description,
    mangaCount = 0,
    followerCount = 0,
    frameType = 'default',
    primaryColor,
}: FansubListItemProps) {
    // Sol accent rengi — fansub'un primaryColor'u veya tema primary rengi
    const accentStyle = primaryColor
        ? { borderLeftColor: primaryColor }
        : undefined
    const fansubHref = buildPublicFansubPath({ id, slug })

    return (
        <Link
            to={fansubHref}
            className={cn(
                'group relative flex items-center gap-4 rounded-lg',
                'border-l-[3px] border border-border/50',
                'bg-card/50 backdrop-blur-sm',
                'px-4 py-3',
                'no-underline',
                'transition-all duration-200 ease-out',
                // Hover effect: slight lift and border glow
                'hover:bg-accent/40 hover:border-border',
                'hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_2px_8px_-2px_hsl(var(--primary)/0.1)]',
                // Default primary if there is no accent border
                !primaryColor && 'border-l-primary/40 hover:border-l-primary',
            )}
            style={accentStyle}
        >
            {/* Avatar */}
            <div className="shrink-0">
                <AvatarFrame
                    src={avatar}
                    alt={name}
                    frameType={frameType}
                    size={44}
                    animated={true}
                />
            </div>

            {/* İsim + Açıklama */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                    {name}
                </h3>
                {description && (
                    <p className="line-clamp-1 text-xs text-muted-foreground/70 group-hover:text-muted-foreground transition-colors duration-200">
                        {description}
                    </p>
                )}
            </div>

            {/* İstatistikler — Sağ taraf */}
            <div className="flex shrink-0 items-center gap-3">
                <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors duration-200"
                    title={txa('Manga')}
                >
                    <BookOpen className="size-3.5" />
                    <span className="tabular-nums font-medium">
                        {(mangaCount ?? 0).toLocaleString(intlLocale())}
                    </span>
                </span>
                <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors duration-200"
                    title={txa('Takipçi')}
                >
                    <Users className="size-3.5" />
                    <span className="tabular-nums font-medium">
                        {(followerCount ?? 0).toLocaleString(intlLocale())}
                    </span>
                </span>
            </div>
        </Link>
    )
}

export default FansubListItem
export type { FansubListItemProps }
