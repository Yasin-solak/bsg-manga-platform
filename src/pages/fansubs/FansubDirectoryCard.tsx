import { useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { BookOpen, Check, Crown, Users } from 'lucide-react'
import { FansubDiscoverBadge } from '@/components/common/FansubBoostChrome'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import { FansubHoverCard } from '@/components/common/UserHoverCard'
import { resolveVisibleFansubNameStyle } from '@/lib/fansubBoostCapabilityGovernance'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { FansubFollowButton } from './FansubFollowButton'
import { FansubMangaPeek } from './FansubMangaPeek'
import { FansubPlainAvatar } from './FansubPlainAvatar'
import {
  buildFansubCardBackgroundStyle,
  formatCompactCount,
  resolveFansubCardBackgroundVideoUrl,
  resolveFansubListAvatarUrl,
  type FansubShowcaseEntry,
} from './fansubsPageShared'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface FansubDirectoryCardProps {
  fansub: FansubShowcaseEntry
  currentUserId: string | null
  isFollowing: boolean
  isFollowLoading: boolean
  onToggleFollow: (fansubId: string) => void
  mangaPreview?: Manga[]
  isMangaPreviewLoading: boolean
  onEnsureMangaPreview: (fansubId: string) => void
}

export function FansubDirectoryCard({
  fansub,
  currentUserId,
  isFollowing,
  isFollowLoading,
  onToggleFollow,
  mangaPreview,
  isMangaPreviewLoading,
  onEnsureMangaPreview,
}: FansubDirectoryCardProps) {
  const navigate = useNavigate()
  const [isCardHovered, setIsCardHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const resolvedMangaCount = Math.max(0, fansub.mangaCount || 0)
  const fansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })
  const optimizedAvatarUrl = resolveFansubListAvatarUrl(fansub)
  const backgroundVideoUrl = resolveFansubCardBackgroundVideoUrl(fansub)
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

  const identityTrigger = (
    <div className="flex w-full min-w-0 items-center gap-3">
      <FansubPlainAvatar
        src={optimizedAvatarUrl}
        alt={fansub.name}
        size={72}
        className={cn(
          'transition duration-200',
          (isCardHovered || isFocusWithin) ? 'border-primary/45 shadow-[0_12px_26px_-18px_rgba(239,68,68,0.95)]' : '',
        )}
      />
      <div className="min-w-0 flex-1 pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3
            className={cn(
              'translate-y-[2px] truncate text-base font-semibold text-foreground transition group-hover:text-primary',
              fansubNamePresentation.className,
            )}
            style={fansubNamePresentation.inlineStyle}
          >
            {fansub.name}
          </h3>
          {fansub.hasDiscoverBadge ? (
            <FansubDiscoverBadge compact iconOnly className="translate-y-[2px]" />
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <article
      role="link"
      tabIndex={0}
      data-testid={`fansub-directory-card-${fansub.slug || fansub.id}`}
      data-has-discover-badge={fansub.hasDiscoverBadge === true ? 'true' : 'false'}
      data-has-gold-frame={fansub.hasGoldFrame === true ? 'true' : 'false'}
      data-name-style-mode={hasStyledName ? 'styled' : 'plain'}
      className="group relative flex h-[300px] cursor-pointer flex-col overflow-hidden rounded-lg border border-border/85 bg-card/85 transition hover:-translate-y-0.5 hover:border-primary/45 dark:border-white/10"
      onClick={openFansub}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openFansub()
        }
      }}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setIsFocusWithin(false)
      }}
    >
      <div className="relative h-[92px] shrink-0 border-b border-white/10" style={buildFansubCardBackgroundStyle(fansub, { overlay: 'none' })}>
        {backgroundVideoUrl ? (
          <video className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" autoPlay loop muted playsInline preload="metadata" aria-hidden>
            <source src={backgroundVideoUrl} />
          </video>
        ) : null}
        {fansub.isWeeklyLeader ? (
          <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Crown className="h-3 w-3" />
            {txa('Haftanın lideri')}
          </span>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col p-3">
        <div className="-mt-11 flex w-full">
          <FansubHoverCard {...fansub} className="flex w-full min-w-0" sideOffset={12}>
            {identityTrigger}
          </FansubHoverCard>
        </div>

        <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground">
          {fansub.description || txa('Düzenli bölüm çıkaran, topluluk odaklı ekip.')}
        </p>

        <div className="mt-auto grid grid-cols-3 gap-1.5 text-[11px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="shrink-0 font-semibold text-foreground">{formatCompactCount(fansub.followerCount)}</span>
            <span>{txa('Takipçi')}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <Crown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="shrink-0 font-semibold text-foreground">{formatCompactCount(fansub.totalChapterCount)}</span>
            <span>{txa('Çeviri')}</span>
          </div>
          <FansubMangaPeek
            fansubId={fansub.id}
            mangaCount={resolvedMangaCount}
            mangas={mangaPreview}
            isLoading={isMangaPreviewLoading}
            onEnsureLoaded={onEnsureMangaPreview}
            popoverAlign="left"
            triggerClassName="min-w-0 items-center gap-1 overflow-hidden rounded-none border-0 bg-transparent p-0 text-[11px] text-muted-foreground shadow-none hover:text-primary dark:bg-transparent"
            trigger={(
              <>
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-semibold text-foreground">{formatCompactCount(resolvedMangaCount)}</span>
                <span className="truncate">{txa('Seri')}</span>
              </>
            )}
          />
        </div>

        <div
          className="pt-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {currentUserId && isFollowing ? (
            <button
              type="button"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-black/25 text-sm font-medium text-foreground"
              onClick={() => onToggleFollow(fansub.id)}
              disabled={isFollowLoading}
            >
              <Check className="h-4 w-4" />
              {txa('Takiptesin')}
            </button>
          ) : (
            <FansubFollowButton
              isFollowing={false}
              isLoading={isFollowLoading}
              onToggle={() => onToggleFollow(fansub.id)}
              className="h-9 w-full rounded-md bg-primary text-sm text-primary-foreground hover:bg-primary/90"
            />
          )}
        </div>
      </div>
    </article>
  )
}
