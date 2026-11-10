import { useState } from 'react'
import { Link, useNavigate } from '@/i18n/router'
import { BookOpen, Check, Crown, ExternalLink, Mail, Users } from 'lucide-react'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import { FansubHoverCard } from '@/components/common/UserHoverCard'
import { resolveVisibleFansubNameStyle } from '@/lib/fansubBoostCapabilityGovernance'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { FansubMangaPeek } from './FansubMangaPeek'
import { FansubPlainAvatar } from './FansubPlainAvatar'
import {
  buildFansubCardBackgroundStyle,
  formatCompactCount,
  hasFansubCardBackgroundMedia,
  resolveFansubCardBackgroundVideoUrl,
  resolveFansubListAvatarUrl,
  type FansubShowcaseEntry,
} from './fansubsPageShared'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface FansubShowcaseRailProps {
  items: FansubShowcaseEntry[]
  currentUserId: string | null
  followStateByFansubId: Record<string, boolean>
  followActionByFansubId: Record<string, boolean>
  mangaPreviewByFansubId: Record<string, Manga[]>
  mangaPreviewLoadingByFansubId: Record<string, boolean>
  onToggleFollow: (fansubId: string) => void
  onEnsureMangaPreview: (fansubId: string) => void
}

function WeeklyLeaderCard({
  fansub,
  currentUserId,
  followStateByFansubId,
  followActionByFansubId,
  mangaPreviewByFansubId,
  mangaPreviewLoadingByFansubId,
  onToggleFollow,
  onEnsureMangaPreview,
}: {
  fansub: FansubShowcaseEntry
  currentUserId: string | null
  followStateByFansubId: Record<string, boolean>
  followActionByFansubId: Record<string, boolean>
  mangaPreviewByFansubId: Record<string, Manga[]>
  mangaPreviewLoadingByFansubId: Record<string, boolean>
  onToggleFollow: (fansubId: string) => void
  onEnsureMangaPreview: (fansubId: string) => void
}) {
  const navigate = useNavigate()
  const [isMangaPeekOpen, setIsMangaPeekOpen] = useState(false)
  const resolvedMangaCount = Math.max(0, fansub.mangaCount || 0)
  const fansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })
  const optimizedAvatarUrl = resolveFansubListAvatarUrl(fansub)
  const backgroundVideoUrl = resolveFansubCardBackgroundVideoUrl(fansub)
  const hasBackgroundMedia = hasFansubCardBackgroundMedia(fansub)
  const visibleNameStyle = resolveVisibleFansubNameStyle(
    fansub.activeNameStyle,
    { hasFullNameStyle: fansub.hasFullNameStyle },
    'resolved',
  )
  const fansubNamePresentation = resolveFansubNameStylePresentation(visibleNameStyle)
  const hasStyledName = Boolean(visibleNameStyle)

  const openFansub = () => {
    navigate(fansubHref)
  }

  return (
    <article
      role="link"
      tabIndex={0}
      data-testid="weekly-chapter-leader-card"
      data-has-discover-badge={fansub.hasDiscoverBadge === true ? 'true' : 'false'}
      data-has-gold-frame={fansub.hasGoldFrame === true ? 'true' : 'false'}
      data-name-style-mode={hasStyledName ? 'styled' : 'plain'}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card text-card-foreground shadow-[0_18px_52px_-40px_rgba(0,0,0,0.75)] transition hover:border-primary/45 dark:border-white/10 lg:h-[300px]',
        isMangaPeekOpen ? 'z-[80]' : 'z-0',
      )}
      style={buildFansubCardBackgroundStyle(fansub, { overlay: 'none' })}
      onClick={openFansub}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openFansub()
        }
      }}
    >
      {backgroundVideoUrl ? (
        <video className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" autoPlay loop muted playsInline preload="metadata" aria-hidden>
          <source src={backgroundVideoUrl} />
        </video>
      ) : null}
      <div className="relative z-10 flex min-h-[300px] flex-col gap-5 p-5 lg:block lg:h-full lg:min-h-0">
        <div className="shrink-0 lg:absolute lg:left-8 lg:top-1/2 lg:-translate-y-1/2">
          <FansubHoverCard {...fansub} className="inline-flex w-auto" sideOffset={12}>
            <FansubPlainAvatar
              src={optimizedAvatarUrl}
              alt={fansub.name}
              size={112}
              className="border-2 border-white/20 shadow-[0_18px_42px_-22px_rgba(0,0,0,0.9)]"
            />
          </FansubHoverCard>
        </div>

        <div className="min-w-0 lg:absolute lg:left-[220px] lg:right-6 lg:top-10">
          <FansubHoverCard {...fansub} className="inline-flex max-w-full min-w-0" sideOffset={12}>
            <div
              className={cn(
                'flex max-w-full items-center gap-2 text-2xl font-semibold leading-tight transition group-hover:text-primary lg:text-3xl',
                hasBackgroundMedia
                  ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]'
                  : 'text-foreground',
                fansubNamePresentation.className,
              )}
              style={fansubNamePresentation.inlineStyle}
            >
              <span className="truncate">{fansub.name}</span>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </div>
          </FansubHoverCard>
          <p
            className={cn(
              'mt-3 line-clamp-3 max-w-none text-sm leading-5',
              hasBackgroundMedia
                ? 'text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]'
                : 'text-muted-foreground',
            )}
          >
            {fansub.description || txa('Düzenli bölüm akışı ve güçlü takipçi kitlesiyle öne çıkan ekip.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-white lg:absolute lg:bottom-[42px] lg:left-[220px] lg:right-[220px] xl:flex-nowrap xl:gap-x-2">
          <div className="inline-flex min-w-[74px] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 shadow-[0_8px_22px_-16px_rgba(0,0,0,0.95)]">
            <Users className="h-4 w-4 text-white/85" />
            <span className="text-sm font-semibold text-white">{formatCompactCount(fansub.followerCount)}</span>
            <span className="text-[11px] font-medium text-white/90">{txa('Takipçi')}</span>
          </div>
          <div className="inline-flex min-w-[74px] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 shadow-[0_8px_22px_-16px_rgba(0,0,0,0.95)]">
            <Crown className="h-4 w-4 text-white/85" />
            <span className="text-sm font-semibold text-white">{formatCompactCount(fansub.totalChapterCount)}</span>
            <span className="text-[11px] font-medium text-white/90">{txa('Çeviri')}</span>
          </div>
          <FansubMangaPeek
            fansubId={fansub.id}
            mangaCount={resolvedMangaCount}
            mangas={mangaPreviewByFansubId[fansub.id]}
            isLoading={Boolean(mangaPreviewLoadingByFansubId[fansub.id])}
            onEnsureLoaded={onEnsureMangaPreview}
            onOpenChange={setIsMangaPeekOpen}
            popoverAlign="left"
            triggerClassName="min-w-[68px] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-white shadow-[0_8px_22px_-16px_rgba(0,0,0,0.95)]"
            trigger={(
              <>
                <Mail className="h-4 w-4 text-white/85" />
                <span className="text-sm font-semibold text-white">{formatCompactCount(resolvedMangaCount)}</span>
                <span className="text-[11px] font-medium text-white/90">{txa('Seri')}</span>
              </>
            )}
          />
          <div className="inline-flex min-w-[82px] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 shadow-[0_8px_22px_-16px_rgba(0,0,0,0.95)]">
            <BookOpen className="h-4 w-4 text-white/85" />
            <span className="truncate text-sm font-semibold text-white">{fansub.monthlyChapterCount}</span>
            <span className="text-[11px] font-medium text-white/90">{txa('30 Gün')}</span>
          </div>
        </div>

        <div
          className="mt-auto flex shrink-0 flex-col gap-2 sm:flex-row lg:absolute lg:bottom-6 lg:right-5 lg:mt-0 lg:w-[178px] lg:flex-col"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Link
            to={fansubHref}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground no-underline shadow-[0_14px_30px_-18px_rgba(0,0,0,0.9)] transition hover:bg-primary/90"
          >
            {txa('Fansuba Git')}
            <ExternalLink className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 bg-black/45 px-4 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(0,0,0,0.9)] transition hover:border-primary/35"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggleFollow(fansub.id)
            }}
            disabled={Boolean(followActionByFansubId[fansub.id])}
          >
            <Check className="h-4 w-4" />
            {currentUserId && followStateByFansubId[fansub.id] ? txa('Takiptesin') : txa('Takip Et')}
          </button>
        </div>
      </div>
    </article>
  )
}

export function FansubShowcaseRail({
  items,
  currentUserId,
  followStateByFansubId,
  followActionByFansubId,
  mangaPreviewByFansubId,
  mangaPreviewLoadingByFansubId,
  onToggleFollow,
  onEnsureMangaPreview,
}: FansubShowcaseRailProps) {
  const weeklyLeader = items[0]
  if (!weeklyLeader) return null

  return (
    <section className="relative isolate overflow-visible">
      <WeeklyLeaderCard
        fansub={weeklyLeader}
        currentUserId={currentUserId}
        followStateByFansubId={followStateByFansubId}
        followActionByFansubId={followActionByFansubId}
        mangaPreviewByFansubId={mangaPreviewByFansubId}
        mangaPreviewLoadingByFansubId={mangaPreviewLoadingByFansubId}
        onToggleFollow={onToggleFollow}
        onEnsureMangaPreview={onEnsureMangaPreview}
      />
    </section>
  )
}
