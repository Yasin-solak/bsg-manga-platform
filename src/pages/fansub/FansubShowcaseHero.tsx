import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { buildHoverCardThemeStyle, type HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import {
  canRenderFansubDiscoverBadge,
  canRenderFansubGoldFrame,
} from '@/lib/fansubBoostCapabilityGovernance'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { FANSUB_RADIUS } from './fansubDesignTokens'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { normalizeBioText } from '@/components/common/userHoverCardShared'
import { BookOpen, Coins, Crown, Heart, PenLine, Settings, Sparkles, Star, Users } from 'lucide-react'
import { Lightning as PhosphorLightning } from '@phosphor-icons/react'
import type {
  ExtendedFansub,
  FansubChapterPreview,
  FansubDisplayedBadge,
  FansubOwnedBackground,
} from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

// Same size as the user profile showcase card (380 x 640).
export const FANSUB_SHOWCASE_WIDTH_PX = 380
export const FANSUB_SHOWCASE_HEIGHT_PX = 640
const FANSUB_SHOWCASE_VISIBLE_BADGE_LIMIT = 3
const FANSUB_SHOWCASE_BADGE_SIZE_PX = 32
const FANSUB_SHOWCASE_BADGE_GAP_PX = 6
const FANSUB_SHOWCASE_BADGE_RAIL_WIDTH_PX =
  (FANSUB_SHOWCASE_VISIBLE_BADGE_LIMIT * FANSUB_SHOWCASE_BADGE_SIZE_PX)
  + ((FANSUB_SHOWCASE_VISIBLE_BADGE_LIMIT - 1) * FANSUB_SHOWCASE_BADGE_GAP_PX)
  + 26

type FansubShowcaseCardProps = {
  fansub: ExtendedFansub
  canManage: boolean
  isFollowing: boolean
  followersCount: number
  chapterPreviews?: FansubChapterPreview[]
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  effectiveBg: FansubOwnedBackground | null
  effectiveFrame: FrameType
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  fansubHeaderNameClassName?: string
  fansubHeaderNameInlineStyle?: CSSProperties
  isBoostEnabled?: boolean
  boostSnapshot?: FansubBoostSnapshot | null
  ownedBadges: FansubDisplayedBadge[]
  manageHref?: string
  onEdit?: () => void
  onFollowToggle?: () => void
  onDonate?: () => void
  onBoost?: () => void
  onMangaClick?: () => void
  onFollowerClick?: () => void
  className?: string
  forceInteractivePreview?: boolean
  /** Fansub theme (boost: canUseHoverTheme); paints the card body as on the profile card. */
  themeColors?: HoverCardThemeColors | null
}

function renderFansubShowcaseBackground(
  bg: FansubOwnedBackground | null,
  options: { enableVideoPlayback?: boolean } = {},
) {
  const { enableVideoPlayback = false } = options

  if (!bg) {
    return (
      <div
        className='absolute inset-0'
        aria-hidden
        style={{
          background:
            'radial-gradient(circle at top left, hsl(var(--primary) / 0.26), transparent 34%), radial-gradient(circle at top right, hsl(var(--secondary) / 0.24), transparent 40%), linear-gradient(145deg, #0f172a 0%, #172033 46%, #0b1220 100%)',
        }}
      />
    )
  }

  const resolvedBackgroundUrl = resolveStoreAssetUrl(bg.background) || bg.background || ''
  const bgUrl = optimizePublicImageUrl(resolvedBackgroundUrl) || resolvedBackgroundUrl
  const isVideo = bg.mediaType === 'video' || isVideoAssetUrl(bgUrl)

  if (isVideo) {
    if (!enableVideoPlayback) {
      return (
        <div
          className='absolute inset-0'
          aria-hidden
          style={{
            background:
              'radial-gradient(circle at top left, hsl(var(--primary) / 0.2), transparent 34%), radial-gradient(circle at top right, hsl(var(--secondary) / 0.18), transparent 42%), linear-gradient(145deg, #111827 0%, #1f2937 46%, #0b1220 100%)',
          }}
        />
      )
    }

    return (
      <video
        className='absolute inset-0 h-full w-full object-cover'
        src={bgUrl}
        autoPlay
        loop
        muted
        playsInline
        preload='metadata'
        aria-hidden
      />
    )
  }

  if (/^(https?:|data:|blob:|\/)/i.test(bgUrl)) {
    return (
      <img
        loading='lazy'
        decoding='async'
        className='absolute inset-0 h-full w-full object-cover'
        src={bgUrl}
        alt=''
        aria-hidden
      />
    )
  }

  return <div className='absolute inset-0' style={{ background: bgUrl }} aria-hidden />
}

function getVisibleFansubBadges(ownedBadges: FansubDisplayedBadge[]) {
  const displayedBadges = ownedBadges
    .filter((badge) => badge.is_displayed)
    .sort((a, b) => a.display_order - b.display_order)

  return {
    visibleBadges: displayedBadges.slice(0, FANSUB_SHOWCASE_VISIBLE_BADGE_LIMIT),
    hiddenBadgeCount: Math.max(0, displayedBadges.length - FANSUB_SHOWCASE_VISIBLE_BADGE_LIMIT),
  }
}

function resolveLatestContent(chapterPreviews: FansubChapterPreview[] | undefined) {
  const latestChapter = chapterPreviews?.[0]
  if (!latestChapter) return null

  return {
    chapterId: latestChapter.chapterId,
    mangaId: latestChapter.mangaId,
    mangaSlug: latestChapter.mangaSlug,
    mangaTitle: latestChapter.mangaTitle,
    chapterNumber: latestChapter.chapterNumber,
    chapterTitle: latestChapter.title || undefined,
    createdAt: latestChapter.publishAt || latestChapter.createdAt,
  }
}

function truncateFansubDescription(description: string, maxLength = 150) {
  const trimmed = description.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export default function FansubShowcaseCard({
  fansub,
  canManage,
  isFollowing,
  followersCount,
  chapterPreviews,
  activeProfileEffectAssets,
  effectiveBg,
  effectiveFrame,
  effectiveCustomFrameUrl,
  effectivePosterFrameUrl,
  fansubHeaderNameClassName,
  fansubHeaderNameInlineStyle,
  isBoostEnabled = false,
  boostSnapshot,
  ownedBadges,
  manageHref,
  onEdit,
  onFollowToggle,
  onDonate,
  onBoost,
  onMangaClick,
  onFollowerClick,
  className,
  forceInteractivePreview = false,
  themeColors = null,
}: FansubShowcaseCardProps) {
  const [isCardHovered, setIsCardHovered] = useState(false)
  const [hasActivatedBackgroundVideo, setHasActivatedBackgroundVideo] = useState(false)
  const shouldPlayBackgroundVideo = forceInteractivePreview || isCardHovered || hasActivatedBackgroundVideo

  const { visibleBadges, hiddenBadgeCount } = getVisibleFansubBadges(ownedBadges)
  const latestContent = useMemo(() => resolveLatestContent(chapterPreviews), [chapterPreviews])
  const normalizedDescription = truncateFansubDescription(normalizeBioText(fansub.description))
  const hasDiscoverBadge = canRenderFansubDiscoverBadge(
    boostSnapshot?.capabilities,
    boostSnapshot ? 'resolved' : 'unknown',
  ) && boostSnapshot?.capabilities?.hasDiscoverBadge === true
  const hasGoldFrame = canRenderFansubGoldFrame(
    boostSnapshot?.capabilities,
    boostSnapshot ? 'resolved' : 'unknown',
  ) && boostSnapshot?.capabilities?.hasGoldFrame === true

  const actionButtons = useMemo(() => {
    const buttons: JSX.Element[] = []

    if (onFollowToggle) {
      buttons.push(
        <button
          key='follow'
          type='button'
          onClick={onFollowToggle}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1 text-xs font-medium transition-colors',
            FANSUB_RADIUS.button,
            isFollowing
              ? 'border border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          <Heart className={cn('size-3.5', isFollowing && 'fill-current')} />
          {isFollowing ? txa('Takipte') : txa('Takip Et')}
        </button>,
      )
    }

    if (onDonate) {
      buttons.push(
        <button
          key='donate'
          type='button'
          onClick={onDonate}
          className={cn('inline-flex h-9 items-center justify-center gap-1 border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/15 dark:text-amber-400', FANSUB_RADIUS.button)}
        >
          <Coins className='size-3.5' />
          {txa('Bağış Yap')}
        </button>,
      )
    }

    if (isBoostEnabled && onBoost) {
      const tierLevel = boostSnapshot?.tierLevel ?? 0
      buttons.push(
        <button
          key='boost'
          type='button'
          onClick={onBoost}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1 text-xs font-medium text-white transition-colors',
            FANSUB_RADIUS.button,
            tierLevel === 3
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/20'
              : tierLevel === 2
                ? 'bg-gradient-to-r from-violet-500 to-purple-500 shadow-md shadow-violet-500/20'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-md shadow-blue-500/20',
          )}
        >
          <PhosphorLightning size={14} weight="fill" />
          {txa('Takviye')}
        </button>,
      )
    }

    return buttons
  }, [boostSnapshot?.tierLevel, isBoostEnabled, isFollowing, onBoost, onDonate, onFollowToggle])

  return (
    <Card
      data-testid="fansub-showcase-hero"
      data-has-discover-badge={hasDiscoverBadge ? 'true' : 'false'}
      data-has-gold-frame={hasGoldFrame ? 'true' : 'false'}
      className={cn(
        'relative flex flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl',
        className,
      )}
      style={buildHoverCardThemeStyle(
        themeColors,
        // Full width on narrow screens, the same 380 px as the profile card on wide ones.
        { width: '100%', maxWidth: `${FANSUB_SHOWCASE_WIDTH_PX}px`, height: `${FANSUB_SHOWCASE_HEIGHT_PX}px`, isolation: 'isolate' },
        { hasCustomBackground: Boolean(effectiveBg) },
      )}
      data-themed={themeColors ? 'true' : 'false'}
      onMouseEnter={() => {
        setIsCardHovered(true)
        setHasActivatedBackgroundVideo(true)
      }}
      onMouseLeave={() => setIsCardHovered(false)}
      onPointerDown={() => setHasActivatedBackgroundVideo(true)}
    >
      {activeProfileEffectAssets ? (
        <ProfileEffectLayer assets={activeProfileEffectAssets} surface='hover' className={PROFILE_EFFECT_TOP_LAYER} />
      ) : null}

      <div className='relative z-0 h-36'>
        {renderFansubShowcaseBackground(effectiveBg, { enableVideoPlayback: shouldPlayBackgroundVideo })}
        <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent' aria-hidden />

        <div className='absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/85 backdrop-blur-sm'>
          <Sparkles className='size-3' />
          {txa('Fansub vitrini')}
        </div>

        {canManage ? (
          <div className='absolute right-3 top-3 z-10 flex items-center gap-2'>
            {onEdit ? (
              <Button
                type='button'
                size='sm'
                onClick={onEdit}
                className='h-7 rounded-full bg-white/15 px-2.5 text-xs text-white shadow-lg backdrop-blur-md hover:bg-white/25'
              >
                <PenLine className='size-3' />
                {txa('Düzenle')}
              </Button>
            ) : null}
            {manageHref ? (
              <Button
                asChild
                type='button'
                size='sm'
                variant='outline'
                className='h-7 rounded-full border-white/20 bg-white/10 px-2 text-white shadow-lg backdrop-blur-md hover:bg-white/20'
              >
                <Link to={manageHref}>
                  <Settings className='size-3' />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn('relative z-10 flex min-h-0 flex-1 flex-col overflow-visible p-4', '-mt-2')}>
        <div className='flex items-start gap-3'>
          <div
            className={cn(
              'relative z-20 shrink-0 -mt-10',
              hasGoldFrame && 'rounded-full bg-[linear-gradient(135deg,rgba(251,191,36,0.98)_0%,rgba(245,158,11,0.9)_45%,rgba(253,230,138,0.98)_100%)] p-[2px] shadow-[0_0_0_1px_rgba(251,191,36,0.24),0_18px_38px_-24px_rgba(245,158,11,0.95)]',
            )}
          >
            {hasGoldFrame ? (
              <>
                <div
                  className='pointer-events-none absolute inset-0 rounded-full opacity-80'
                  style={{ background: 'radial-gradient(circle at 28% 24%, rgba(255,248,196,0.9), transparent 36%)' }}
                  aria-hidden
                />
                <div
                  className='pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] bg-[length:200%_100%] animate-[shimmer_3s_ease-in-out_infinite]'
                  aria-hidden
                />
                <span className='absolute -right-1 -top-1 z-20 inline-flex size-5 items-center justify-center rounded-full border border-amber-200/60 bg-amber-500 text-[10px] text-white shadow-lg shadow-amber-500/35'>
                  <Crown className='size-3' />
                </span>
              </>
            ) : null}
            <div className={cn('relative rounded-full', hasGoldFrame && 'bg-background/90 p-[2px] backdrop-blur-sm')}>
              <AvatarFrame
                src={fansub.avatar}
                alt={fansub.name}
                frameType={effectiveFrame}
                size={56}
                animated={true}
                hoverActive
                customOverlayUrl={resolveStoreAssetUrl(effectiveCustomFrameUrl) || effectiveCustomFrameUrl}
                posterOverlayUrl={resolveStoreAssetUrl(effectivePosterFrameUrl) || effectivePosterFrameUrl}
                hoverPlayback='always'
              />
            </div>
          </div>

          <div className='min-w-0 flex-1'>
            <h1
              title={fansub.name}
              className={cn('truncate whitespace-nowrap pr-2 font-semibold text-foreground', fansubHeaderNameClassName)}
              style={fansubHeaderNameInlineStyle}
            >
              {fansub.name}
            </h1>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              {fansub.slug ? (
                <p className='m-0 max-w-full truncate text-xs text-muted-foreground'>@{fansub.slug}</p>
              ) : null}
              {hasDiscoverBadge ? (
                <Badge
                  variant='secondary'
                  className='rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300'
                >
                  <Star className='mr-1 size-3' />
                  {txa('Topluluk destekli')}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className='mt-4 flex items-center gap-4 border-t border-border/50 pt-3'>
          <div className='flex flex-1 items-center gap-4'>
            <button
              type='button'
              onClick={onMangaClick}
              className='flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-primary'
            >
              <span>{(fansub.mangaCount ?? 0).toLocaleString(intlLocale())} manga</span>
              <BookOpen className='size-3.5' />
            </button>
            <button
              type='button'
              onClick={onFollowerClick}
              className='flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-primary'
            >
              <span>{txa('{v1} takipci', { v1: followersCount.toLocaleString(intlLocale()) })}</span>
              <Users className='size-3.5' />
            </button>
          </div>
          <div
            className='flex h-8 shrink-0 items-center justify-end gap-1.5'
            style={{ width: `${FANSUB_SHOWCASE_BADGE_RAIL_WIDTH_PX}px` }}
          >
            {visibleBadges.length > 0 ? (
              <>
              {visibleBadges.map((badge, index) => (
                <img
                  key={`${badge.id}-${badge.badge_id}-${index}`}
                  src={badge.badge?.image_url || '/badges/default.png'}
                  alt={badge.badge?.name || txa('Rozet')}
                  title={badge.badge?.name || txa('Rozet')}
                  className='h-8 w-8 object-contain drop-shadow-[0_2px_8px_rgba(15,23,42,0.18)]'
                  loading='lazy'
                />
              ))}
              {hiddenBadgeCount > 0 ? (
                <span
                  title={txa('{v1} ek rozet', { v1: hiddenBadgeCount })}
                  className='inline-flex w-5 justify-center text-xs font-semibold text-muted-foreground'
                >
                  +{hiddenBadgeCount}
                </span>
              ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className='mt-3 border-t border-border/50 pt-3'>
          <p className='m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            <Sparkles className='size-3' />
            {txa('Hakkinda')}
          </p>
          <p className='mt-2 line-clamp-4 break-words whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground'>
            {normalizedDescription || txa('Bu fansub henüz bir açıklama eklemedi.')}
          </p>
        </div>

        <div className='mt-auto border-t border-border/50 pt-3'>
          <p className='m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            <BookOpen className='size-3' />
            {txa('Son içerik')}
          </p>

          {latestContent ? (
            <div className='mt-2 space-y-1'>
              <Link
                to={
                  latestContent.chapterNumber != null
                    ? buildPublicChapterPath({
                      mangaId: latestContent.mangaId,
                      mangaSlug: latestContent.mangaSlug,
                      mangaTitle: latestContent.mangaTitle,
                      chapterId: latestContent.chapterId,
                      chapterNumber: latestContent.chapterNumber,
                      fansubId: fansub.id,
                      fansubSlug: fansub.slug,
                      forceVersionQuery: Boolean(latestContent.chapterId && (fansub.id || fansub.slug)),
                    })
                    : buildPublicMangaPath({ id: latestContent.mangaId, slug: latestContent.mangaSlug, title: latestContent.mangaTitle })
                }
                className='block truncate text-xs font-semibold text-primary hover:underline'
              >
                {latestContent.mangaTitle}
              </Link>
              <p className='m-0 truncate text-[11px] text-muted-foreground'>
                {latestContent.chapterNumber != null
                  ? `${txa('Bolum {v1}', { v1: latestContent.chapterNumber })}${latestContent.chapterTitle ? ` - ${latestContent.chapterTitle}` : ''}`
                  : txa('Yeni manga eklendi')}
              </p>
            </div>
          ) : (
            <p className='m-0 mt-2 text-xs text-muted-foreground'>
              {txa('Son içerik bilgisi bulunamadı.')}
            </p>
          )}
        </div>

        {actionButtons.length > 0 ? (
          <div
            className={cn(
              'mt-3 border-t border-border/50 pt-4',
            )}
          >
            <div
              className={cn(
                'grid gap-2',
                actionButtons.length === 1 ? 'grid-cols-1' : actionButtons.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
              )}
            >
              {actionButtons}
            </div>
          </div>
        ) : null}

      </div>
    </Card>
  )
}
