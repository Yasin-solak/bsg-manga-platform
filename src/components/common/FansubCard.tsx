import { Link } from '@/i18n/router'
import { AvatarFrame, FrameType } from './AvatarFrame'
import { Card } from '@/components/ui/card'
import { BookOpen, Users } from 'lucide-react'
import { buildPublicFansubPath } from '@/lib/routes'
import { resolveVisibleFansubBackground } from '@/lib/fansubBoostCapabilityGovernance'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type { FrameType }

interface FansubCardProps {
    id?: string
    slug?: string
    name: string
    avatar: string
    description?: string
    mangaCount?: number
    followerCount?: number
    frameType?: FrameType | string
    primaryColor?: string
    secondaryColor?: string
    /** Gradient / URL background: card background */
    profileBackgroundStyle?: string
    /** Video arka plan URL */
    profileBackgroundVideoUrl?: string
    /** Pattern overlay */
    profilePatternStyle?: string
    canUploadStaticBackground?: boolean
    canUploadVideoBackground?: boolean
}

/**
 * FansubCard: same height and layout as CommunityCard.
 * The background covers the card, content sits at the bottom over a gradient overlay.
 * Avatar is small (40px), next to the name; stats are in a compact icon+number format.
 */
function FansubCard({
    id = '1',
    slug,
    name,
    avatar,
    description,
    mangaCount = 0,
    followerCount = 0,
    frameType = 'default',
    profileBackgroundStyle,
    profileBackgroundVideoUrl,
    profilePatternStyle,
    canUploadStaticBackground,
    canUploadVideoBackground,
}: FansubCardProps) {
    const resolvedBackground = resolveVisibleFansubBackground(
        profileBackgroundStyle || profileBackgroundVideoUrl
            ? {
                background: profileBackgroundStyle || profileBackgroundVideoUrl || '',
                mediaType: profileBackgroundVideoUrl ? 'video' : 'image',
                videoUrl: profileBackgroundVideoUrl,
            }
            : null,
        {
            canUploadStaticBackground,
            canUploadVideoBackground,
        },
        'resolved',
    )
    const resolvedProfileBackgroundStyle = resolvedBackground?.background || undefined
    const resolvedProfileBackgroundVideoUrl = resolvedBackground?.videoUrl || undefined
    const backgroundMode = resolvedProfileBackgroundVideoUrl
        ? 'video'
        : resolvedProfileBackgroundStyle
            ? 'image'
            : 'default'
    const hasCustomBg = !!(resolvedProfileBackgroundStyle || resolvedProfileBackgroundVideoUrl)
    const shouldRenderPatternOverlay = !!(profilePatternStyle && !hasCustomBg)
    const fansubHref = buildPublicFansubPath({ id, slug })

    return (
        <Card
            data-testid={`fansub-card-${slug || id}`}
            data-background-mode={backgroundMode}
            className="group relative h-[260px] overflow-hidden border-border py-0 gap-0 hover:border-primary/40 transition-all duration-300 hover:shadow-lg"
        >
            <Link to={fansubHref} className="flex h-full flex-col">

                {/* ===== ARKAPLAN KATMANLARI ===== */}
                {resolvedProfileBackgroundVideoUrl && (
                    <video
                        className="absolute inset-0 z-[1] h-full w-full object-cover"
                        autoPlay loop muted playsInline preload="metadata" aria-hidden
                    >
                        <source src={resolvedProfileBackgroundVideoUrl} />
                    </video>
                )}

                {resolvedProfileBackgroundStyle && !resolvedProfileBackgroundVideoUrl && (
                    <div className="absolute inset-0 z-[1]" style={{ background: resolvedProfileBackgroundStyle }} aria-hidden />
                )}

                {shouldRenderPatternOverlay && (
                    <div className="absolute inset-0 z-[2] opacity-40" style={{ background: profilePatternStyle }} aria-hidden />
                )}

                {/* Koyu gradient overlay — metin okunabilirliği */}
                {hasCustomBg && (
                    <div className="absolute inset-0 z-[3] bg-gradient-to-t from-black/90 via-black/50 to-transparent" aria-hidden />
                )}

                {/* ===== SPACER — İçeriği alta iter ===== */}
                <div className="flex-1" />

                {/* ===== ALT İÇERİK — Avatar + İsim + Açıklama ===== */}
                <div className="relative z-10 space-y-2 px-3 pb-2">
                    {/* Avatar + İsim */}
                    <div className="flex items-center gap-2.5">
                        <div className="shrink-0">
                            <AvatarFrame
                                src={avatar}
                                alt={name}
                                frameType={frameType}
                                size={40}
                                animated={true}
                            />
                        </div>
                        <div className="min-w-0">
                            <h3 className={`text-sm font-semibold truncate ${hasCustomBg ? 'text-white drop-shadow-md' : ''}`}>
                                {name}
                            </h3>
                            {description && (
                                <p className={`text-xs line-clamp-1 mt-0.5 ${hasCustomBg ? 'text-white/60' : 'text-muted-foreground'}`}>
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== İSTATİSTİK BARI ===== */}
                <div className={`relative z-10 flex items-center gap-4 border-t px-3 py-2 ${hasCustomBg ? 'border-white/10 bg-black/40 backdrop-blur-sm' : 'border-border/50 bg-card/80 backdrop-blur-sm'}`}>
                    <span className={`flex items-center gap-1 text-xs ${hasCustomBg ? 'text-white/70' : 'text-muted-foreground'}`} title={txa('Manga')}>
                        <BookOpen className="h-3.5 w-3.5" />
                        {(mangaCount ?? 0).toLocaleString(intlLocale())}
                    </span>
                    <span className={`flex items-center gap-1 text-xs ${hasCustomBg ? 'text-white/70' : 'text-muted-foreground'}`} title={txa('Takipçi')}>
                        <Users className="h-3.5 w-3.5" />
                        {(followerCount ?? 0).toLocaleString(intlLocale())}
                    </span>
                </div>
            </Link>
        </Card>
    )
}

export default FansubCard
