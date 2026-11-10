import type { CSSProperties } from 'react'
import { Link } from '@/i18n/router'
import { BookOpen, ExternalLink, MoreHorizontal, Sparkles, UserPlus, Users } from 'lucide-react'

import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'

import { AvatarFrame } from './AvatarFrame'
import { FansubDiscoverBadge, FansubGoldFrame } from './FansubBoostChrome'
import { buildHoverCardThemeStyle, hasValidHoverCardTheme, type HoverCardThemeColors } from './hoverCardTheme'
import { intlLocale, txa } from '@/i18n/activeLocale'

export interface FansubHoverCardSurfaceBadge {
  id: string
  name: string
  imageUrl: string
  rarity?: string
}

export interface FansubHoverCardSurfaceLatestContent {
  mangaId: string
  mangaSlug?: string
  mangaTitle: string
  chapterNumber?: number
  chapterTitle?: string
}

export interface FansubHoverCardSurfaceProps {
  className?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets
  themeColors?: HoverCardThemeColors | null
  hasCustomBg?: boolean
  profileBackgroundVideoUrl?: string
  profileBackgroundStyle?: string
  shouldRenderPatternOverlay?: boolean
  profilePatternStyle?: string
  name: string
  slug?: string
  fansubHref: string
  avatar: string
  frameType?: string
  /** Magaza (ozel) cercevesi overlay/poster URL'leri — onizleme tam yansisin diye. */
  frameCustomOverlayUrl?: string
  framePosterOverlayUrl?: string
  hasGoldFrame?: boolean
  hasDiscoverBadge?: boolean
  nameClassName?: string
  nameInlineStyle?: CSSProperties
  description?: string
  hydrationError?: string | null
  onRetryHydration?: (() => void) | null
  showHydrationSkeleton?: boolean
  mangaCount?: number
  followerCount?: number
  displayedBadges?: FansubHoverCardSurfaceBadge[]
  latestContent?: FansubHoverCardSurfaceLatestContent
  latestContentDateLabel?: string | null
  participationStatus?: 'active' | 'passive'
  participationUpdatedLabel?: string | null
  fansubId?: string
  canFollowFansub?: boolean
  isFollowingFansub?: boolean
  isFollowStateLoading?: boolean
  isFollowActionLoading?: boolean
  showActionMenu?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
  onActionMenuPointerDown?: (() => void) | null
  onReportFansub?: (() => void) | null
  onBlockFansub?: (() => void) | null
  onFollowToggle?: (() => void) | null
}

export function FansubHoverCardSurface({
  className,
  activeProfileEffectAssets,
  themeColors = null,
  hasCustomBg = false,
  profileBackgroundVideoUrl,
  profileBackgroundStyle,
  shouldRenderPatternOverlay = false,
  profilePatternStyle,
  name,
  slug,
  fansubHref,
  avatar,
  frameType = 'default',
  frameCustomOverlayUrl,
  framePosterOverlayUrl,
  hasGoldFrame = false,
  hasDiscoverBadge = false,
  nameClassName,
  nameInlineStyle,
  description,
  hydrationError = null,
  onRetryHydration,
  showHydrationSkeleton = false,
  mangaCount = 0,
  followerCount = 0,
  displayedBadges = [],
  latestContent,
  latestContentDateLabel,
  participationStatus = 'passive',
  participationUpdatedLabel,
  fansubId,
  canFollowFansub = false,
  isFollowingFansub = false,
  isFollowStateLoading = false,
  isFollowActionLoading = false,
  showActionMenu = true,
  onActionMenuOpenChange,
  onActionMenuPointerDown,
  onReportFansub,
  onBlockFansub,
  onFollowToggle,
}: FansubHoverCardSurfaceProps) {
  const displayedBadgesPreview = displayedBadges.slice(0, 3)
  const hiddenBadgeCount = Math.max(0, displayedBadges.length - displayedBadgesPreview.length)
  const isParticipationActive = participationStatus === 'active'
  const isThemed = hasValidHoverCardTheme(themeColors)

  return (
    <Card
      className={cn('flex h-[640px] flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl', className)}
      style={buildHoverCardThemeStyle(themeColors, undefined, { hasCustomBackground: hasCustomBg })}
    >
      {activeProfileEffectAssets ? (
        <ProfileEffectLayer assets={activeProfileEffectAssets} surface='hover' active className={PROFILE_EFFECT_TOP_LAYER} />
      ) : null}
      <div
        data-testid="fansub-hover-cover"
        className={cn('relative z-0 h-36 shrink-0 overflow-hidden', !isThemed && 'bg-background', !hasCustomBg && 'border-b border-border/50')}
      >
        {profileBackgroundVideoUrl ? (
          <video className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline>
            <source src={profileBackgroundVideoUrl} />
          </video>
        ) : null}
        {profileBackgroundStyle && !profileBackgroundVideoUrl ? (
          <div className="absolute inset-0" style={{ background: profileBackgroundStyle }} />
        ) : null}
        {shouldRenderPatternOverlay ? (
          <div className="absolute inset-0 opacity-40" style={{ background: profilePatternStyle }} />
        ) : null}
        {hasCustomBg ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, var(--hover-card-banner-fade, rgb(0 0 0 / 0.8)), var(--hover-card-banner-fade-mid, rgb(0 0 0 / 0.4)), transparent)',
            }}
          />
        ) : null}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible p-4">
        {showActionMenu ? (
          <DropdownMenu modal={false} onOpenChange={onActionMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onPointerDown={() => onActionMenuPointerDown?.()}
                className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                aria-label={txa('Daha fazla')}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[420] w-40">
              <DropdownMenuItem className="opacity-75" onSelect={() => onReportFansub?.()}>
                {txa('Fansubu Bildir')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive opacity-75 focus:text-destructive" onSelect={() => onBlockFansub?.()}>
                {txa('Fansubu Engelle')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="flex items-start gap-3">
          <div className="relative z-20 -mt-10 shrink-0">
            <FansubGoldFrame active={hasGoldFrame} badgeClassName='size-5'>
              <AvatarFrame
                src={avatar}
                alt={name}
                frameType={frameType}
                size={56}
                animated={true}
                hoverActive
                customOverlayUrl={frameCustomOverlayUrl}
                posterOverlayUrl={framePosterOverlayUrl}
              />
            </FansubGoldFrame>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className={cn('line-clamp-2 break-words pr-8 font-semibold text-foreground', nameClassName)}
              style={nameInlineStyle}
            >
              {name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {slug ? (
                <p className="max-w-full truncate text-xs text-muted-foreground">@{slug}</p>
              ) : null}
              {hasDiscoverBadge ? <FansubDiscoverBadge compact iconOnly /> : null}
            </div>
          </div>
        </div>

        {hydrationError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-[11px] text-destructive">{hydrationError}</p>
              {onRetryHydration ? (
                <button
                  type="button"
                  onClick={onRetryHydration}
                  className="inline-flex shrink-0 items-center rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
                >
                  {txa('Tekrar Dene')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-3">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen className="size-3.5" />
              <span>{txa('{v1} seri', { v1: mangaCount.toLocaleString(intlLocale()) })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              <span>{txa('{v1} takipci', { v1: followerCount.toLocaleString(intlLocale()) })}</span>
            </div>
          </div>
          {showHydrationSkeleton ? (
            <div className="flex animate-pulse items-center gap-1.5">
              <span className="h-7 w-7 rounded-md bg-muted/35" />
              <span className="h-7 w-7 rounded-md bg-muted/30" />
            </div>
          ) : displayedBadgesPreview.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {displayedBadgesPreview.map((badge) => (
                <img
                  key={badge.id}
                  src={badge.imageUrl}
                  alt={txa(badge.name)}
                  title={txa(badge.name)}
                  className="h-7 w-7 rounded-md border border-border/70 bg-muted/20 object-contain p-0.5"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = '/badges/default.png'
                  }}
                />
              ))}
              {hiddenBadgeCount > 0 ? (
                <span
                  title={txa('{v1} ek rozet', { v1: hiddenBadgeCount })}
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/70 bg-background/60 px-1.5 text-[10px] font-semibold text-muted-foreground"
                >
                  +{hiddenBadgeCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-3 border-t border-border/50 pt-3">
          <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3" />
            {txa('Hakkinda')}
          </p>
          {showHydrationSkeleton ? (
            <div className="mt-2 space-y-1.5 animate-pulse">
              <div className="h-2.5 w-full rounded bg-muted/40" />
              <div className="h-2.5 w-[88%] rounded bg-muted/35" />
              <div className="h-2.5 w-[72%] rounded bg-muted/30" />
            </div>
          ) : (
            <p className="mt-2 max-h-20 overflow-y-auto break-words whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]">
              {description || txa('Bu fansub henüz bir açıklama eklemedi.')}
            </p>
          )}
        </div>

        <div className="mt-auto space-y-3 pt-3">
          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <BookOpen className="size-3" />
                {txa('Son içerik')}
              </p>
              <span
                className={cn(
                  'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  isParticipationActive
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-border/70 bg-muted/20 text-muted-foreground',
                )}
              >
                {isParticipationActive ? txa('Aktif') : txa('Pasif')}
              </span>
            </div>

            {showHydrationSkeleton ? (
              <div className="mt-2 space-y-1.5 animate-pulse">
                <div className="h-2.5 w-[85%] rounded bg-muted/40" />
                <div className="h-2.5 w-[70%] rounded bg-muted/35" />
                <div className="h-2.5 w-[45%] rounded bg-muted/30" />
              </div>
            ) : latestContent ? (
              <div className="mt-2 space-y-1">
                <Link
                  to={
                    latestContent.chapterNumber != null
                      ? buildPublicChapterPath({
                        mangaId: latestContent.mangaId,
                        mangaSlug: latestContent.mangaSlug,
                        mangaTitle: latestContent.mangaTitle,
                        chapterNumber: latestContent.chapterNumber,
                        fansubId,
                        fansubSlug: slug,
                      })
                      : buildPublicMangaPath({ id: latestContent.mangaId, slug: latestContent.mangaSlug, title: latestContent.mangaTitle })
                  }
                  className="block truncate text-xs font-semibold text-primary hover:underline"
                >
                  {latestContent.mangaTitle}
                </Link>
                <p className="m-0 truncate text-[11px] text-muted-foreground">
                  {latestContent.chapterNumber != null
                    ? `${txa('Bolum {v1}', { v1: latestContent.chapterNumber })}${latestContent.chapterTitle ? ` - ${latestContent.chapterTitle}` : ''}`
                    : txa('Yeni manga eklendi')}
                </p>
                <p className="m-0 text-[11px] text-muted-foreground/85">
                  {latestContentDateLabel || txa('Tarih bilgisi yok')}
                </p>
              </div>
            ) : (
              <p className="m-0 mt-2 text-xs text-muted-foreground">
                {txa('Son içerik bilgisi bulunamadı.')}
              </p>
            )}

            {participationUpdatedLabel ? (
              <p className="m-0 mt-2 text-[11px] text-muted-foreground/80">
                {txa('Katılım güncelleme: {v1}', { v1: participationUpdatedLabel })}
              </p>
            ) : null}
          </div>

          {(fansubId || slug) ? (
            <div className="grid grid-cols-2 gap-2">
              {canFollowFansub ? (
                <button
                  type="button"
                  onClick={() => onFollowToggle?.()}
                  disabled={isFollowStateLoading || isFollowActionLoading}
                  className={cn(
                    'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                    isFollowingFansub
                      ? 'border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-primary',
                    (isFollowStateLoading || isFollowActionLoading) ? 'cursor-not-allowed opacity-65' : '',
                  )}
                >
                  <UserPlus className="size-3" />
                  {isFollowActionLoading ? txa('İşleniyor...') : isFollowingFansub ? txa('Takipte') : txa('Takip Et')}
                </button>
              ) : null}
              <Link
                to={fansubHref}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium text-primary transition-colors',
                  'bg-primary/10 hover:bg-primary/20',
                  canFollowFansub ? '' : 'col-span-2',
                )}
              >
                {txa('Fansub Sayfası')}
                <ExternalLink className="size-3" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
