import { Link } from '@/i18n/router'
import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { BookOpen, Coins, Heart, PenLine, Settings, Sparkles, Users } from 'lucide-react'
import { Lightning as PhosphorLightning } from '@phosphor-icons/react'
import {
  FANSUB_HERO_AVATAR_SIZE_PX,
  FANSUB_HERO_BACKGROUND_HEIGHT_PX,
  FANSUB_HERO_CARD_MIN_HEIGHT_PX,
  getVisibleFansubBadges,
} from './fansubHeroStandards'
import type {
  ExtendedFansub,
  FansubDisplayedBadge,
  FansubOwnedBackground,
} from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubIdentityCardProps = {
  backgroundPlaybackMode?: 'always' | 'hover' | 'static'
  canManage: boolean
  className?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  effectiveBg: FansubOwnedBackground | null
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  effectiveFrame: FrameType
  followersCount: number
  manageHref?: string
  membersCount: number
  fansubHeaderNameClassName?: string
  fansubHeaderNameInlineStyle?: CSSProperties
  onEdit?: () => void
  onFollowToggle?: () => void
  onDonate?: () => void
  isBoostEnabled?: boolean
  boostSnapshot?: FansubBoostSnapshot | null
  ownedBadges: FansubDisplayedBadge[]
  fansub: ExtendedFansub
  isFollowing: boolean
}

function renderFansubCardBackground(bg: FansubOwnedBackground | null, allowVideoPlayback: boolean) {
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

  const resolvedVideoUrl = resolveStoreAssetUrl(bg.videoUrl) || bg.videoUrl || ''
  const backgroundSource = bg.posterBackground || bg.background || ''
  const resolvedBackgroundUrl = resolveStoreAssetUrl(backgroundSource) || backgroundSource || ''
  const bgUrl = optimizePublicImageUrl(resolvedBackgroundUrl) || resolvedBackgroundUrl

  if (bg.videoUrl && allowVideoPlayback) {
    return (
      <video
        className='absolute inset-0 h-full w-full object-cover'
        src={resolvedVideoUrl}
        autoPlay
        loop
        muted
        playsInline
        preload='none'
        aria-hidden
      />
    )
  }

  if (bg.videoUrl) {
    const hasDedicatedPoster = Boolean(
      bg.posterBackground
      && bg.background
      && bg.posterBackground !== bg.background,
    )

    if (hasDedicatedPoster) {
      if (/^(https?:|data:|blob:|\/)/i.test(bgUrl)) {
        return <img loading='lazy' decoding='async' className='absolute inset-0 h-full w-full object-cover' src={bgUrl} alt='' aria-hidden />
      }

      return <div className='absolute inset-0' style={{ background: bgUrl }} aria-hidden />
    }

    return (
      <video
        className='absolute inset-0 h-full w-full object-cover'
        src={resolvedVideoUrl}
        muted
        playsInline
        preload='auto'
        onLoadedData={(event) => {
          const target = event.currentTarget
          try {
            if (target.currentTime === 0) {
              target.currentTime = 0.05
            }
            target.pause()
          } catch {
            // Ilk kare seek desteklenmezse sessiz kal.
          }
        }}
        aria-hidden
      />
    )
  }

  if (/^(https?:|data:|blob:|\/)/i.test(bgUrl)) {
    return <img loading='lazy' decoding='async' className='absolute inset-0 h-full w-full object-cover' src={bgUrl} alt='' aria-hidden />
  }

  return <div className='absolute inset-0' style={{ background: bgUrl }} aria-hidden />
}

function FansubMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen
  label: string
  value: string
}) {
  return (
    <div className='flex items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-3'>
      <Icon className='size-4 shrink-0 text-primary' />
      <span className='min-w-0'>
        <span className='block text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>{label}</span>
        <span className='block truncate text-sm font-semibold text-foreground'>{value}</span>
      </span>
    </div>
  )
}

export default function FansubIdentityCard({
  backgroundPlaybackMode = 'static',
  canManage,
  className,
  activeProfileEffectAssets,
  effectiveBg,
  effectiveCustomFrameUrl,
  effectivePosterFrameUrl,
  effectiveFrame,
  followersCount,
  manageHref,
  membersCount,
  fansubHeaderNameClassName,
  fansubHeaderNameInlineStyle,
  onEdit,
  onFollowToggle,
  onDonate,
  isBoostEnabled = false,
  boostSnapshot = null,
  ownedBadges,
  fansub,
  isFollowing,
}: FansubIdentityCardProps) {
  const { visibleBadges, hiddenBadgeCount } = getVisibleFansubBadges(ownedBadges)
  const [isCardHovered, setIsCardHovered] = useState(false)
  const shouldPlayBackgroundVideo = backgroundPlaybackMode === 'always'
    || (backgroundPlaybackMode === 'hover' && isCardHovered)

  const tierBadgeTone = boostSnapshot
    ? ({ 1: 'blue', 2: 'violet', 3: 'amber' } as Record<number, 'blue' | 'violet' | 'amber'>)[boostSnapshot.tierLevel] ?? null
    : null

  const viewerActions = useMemo(() => {
    const actions: JSX.Element[] = []

    if (onFollowToggle) {
      actions.push(
        <button
          key='follow'
          type='button'
          onClick={onFollowToggle}
          className={cn(
            'inline-flex h-auto items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors',
            isFollowing
              ? 'border border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          <Heart className='size-4' />
          {isFollowing ? txa('Takipte') : txa('Takip Et')}
        </button>,
      )
    }

    if (onDonate) {
      actions.push(
        <button
          key='donate'
          type='button'
          onClick={onDonate}
          className='inline-flex h-auto items-center justify-center gap-2 rounded-xl bg-amber-500/12 py-3 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-300'
        >
          <Coins className='size-4' />
          {txa('Bağış Yap')}
        </button>,
      )
    }

    return actions
  }, [isFollowing, onDonate, onFollowToggle])

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[30px] border-border/80 bg-background py-0 shadow-xl',
        className,
      )}
      style={{ minHeight: `${FANSUB_HERO_CARD_MIN_HEIGHT_PX}px` }}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div className='relative z-0' style={{ height: `${FANSUB_HERO_BACKGROUND_HEIGHT_PX}px` }}>
        {renderFansubCardBackground(effectiveBg, shouldPlayBackgroundVideo)}
        <div className='absolute inset-0 bg-gradient-to-t from-black/68 via-black/25 to-transparent' aria-hidden />

        {canManage ? (
          <div className='absolute right-4 top-4 z-10 flex items-center gap-2'>
            <Button type='button' size='sm' className='rounded-full px-3 shadow-md' onClick={onEdit}>
              <PenLine className='size-3.5' />
              {txa('Düzenle')}
            </Button>
            {manageHref ? (
              <Button asChild type='button' size='sm' variant='outline' className='rounded-full border-white/20 bg-white/10 px-3 text-white shadow-md hover:bg-white/20'>
                <Link to={manageHref}>
                  <Settings className='size-3.5' />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeProfileEffectAssets ? (
        <ProfileEffectLayer assets={activeProfileEffectAssets} surface='profile' className={PROFILE_EFFECT_TOP_LAYER} />
      ) : null}

      <div className='relative z-20 -mt-12 flex items-center gap-4 px-5'>
        <div className='shrink-0'>
          <AvatarFrame
            src={fansub.avatar}
            alt={fansub.name}
            frameType={effectiveFrame}
            size={FANSUB_HERO_AVATAR_SIZE_PX}
            animated={true}
            customOverlayUrl={resolveStoreAssetUrl(effectiveCustomFrameUrl) || effectiveCustomFrameUrl}
            posterOverlayUrl={resolveStoreAssetUrl(effectivePosterFrameUrl) || effectivePosterFrameUrl}
            hoverPlayback='always'
          />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='rounded-full border-border/60 bg-background/65 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground'>
              {txa('Fansub vitrini')}
            </Badge>
            {isBoostEnabled && boostSnapshot && boostSnapshot.tierLevel > 0 ? (
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                tierBadgeTone === 'amber'
                  ? 'border-amber-400/40 bg-amber-400/15 text-amber-400'
                  : tierBadgeTone === 'violet'
                    ? 'border-violet-400/40 bg-violet-400/15 text-violet-400'
                    : tierBadgeTone === 'blue'
                      ? 'border-blue-400/40 bg-blue-400/15 text-blue-400'
                      : 'border-border/60 bg-muted/30 text-muted-foreground',
              )}>
                <PhosphorLightning size={12} weight="fill" />
                {txa('Seviye {v1}', { v1: boostSnapshot.tierLevel })}
                {typeof boostSnapshot.capabilities?.tierLabel === 'string' ? ` - ${boostSnapshot.capabilities.tierLabel}` : ''}
              </span>
            ) : null}
          </div>

          <h1
            className={cn(
              'mt-3 line-clamp-2 break-words font-bold text-foreground',
              fansubHeaderNameClassName || '',
            )}
            style={fansubHeaderNameInlineStyle}
          >
            {fansub.name}
          </h1>

          <p className='mt-2 max-w-[36ch] text-sm leading-6 text-muted-foreground'>
            {txa('Fansub kimliği, takviye seviyesi ve ekip izi bu ana kartta toplanır.')}
          </p>
        </div>
      </div>

      <div className='relative z-20 flex min-h-0 flex-1 flex-col gap-4 p-5 pt-4'>
        <div className='rounded-[24px] border border-border/70 bg-card/70 p-4'>
          <p className='m-0 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
            <Sparkles className='size-3.5 text-primary' />
            {txa('Hakkinda')}
          </p>
          <p className='mt-3 overflow-hidden break-words whitespace-pre-wrap pr-1 text-sm leading-7 text-muted-foreground'>
            {fansub.description || txa('Bu fansub henüz bir açıklama eklemedi.')}
          </p>
        </div>

        <div className='grid grid-cols-3 gap-2'>
          <FansubMetric
            icon={BookOpen}
            label={txa('Manga')}
            value={fansub.mangaCount?.toLocaleString(intlLocale()) || '0'}
          />
          <FansubMetric
            icon={Heart}
            label={txa('Takipçi')}
            value={followersCount.toLocaleString(intlLocale())}
          />
          <FansubMetric
            icon={Users}
            label={txa('Üye')}
            value={membersCount.toLocaleString(intlLocale())}
          />
        </div>

        <div className='flex flex-wrap items-center gap-2 border-t border-border/50 pt-4'>
          {visibleBadges.length > 0 ? (
            <>
              {visibleBadges.map((badge, index) => (
                <img
                  loading='lazy'
                  decoding='async'
                  key={`${badge.id}-${badge.badge_id}-${index}`}
                  src={badge.badge?.image_url || '/badges/default.png'}
                  alt={badge.badge?.name || txa('Rozet')}
                  title={badge.badge?.name || txa('Rozet')}
                  className='h-11 w-11 rounded-xl border border-border/70 bg-muted/20 p-1.5 object-contain'
                />
              ))}
              {hiddenBadgeCount > 0 ? (
                <span className='inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 px-2 text-xs font-semibold text-muted-foreground'>
                  +{hiddenBadgeCount}
                </span>
              ) : null}
            </>
          ) : (
            <div className='rounded-2xl border border-dashed border-border/70 bg-background/40 px-3 py-2 text-xs text-muted-foreground'>
              {txa('Rozet vitrini bos')}
            </div>
          )}
        </div>

        <div className='pt-1'>
          {canManage ? (
            <div className='grid grid-cols-2 gap-3'>
              {manageHref ? (
                <Button asChild type='button' variant='outline' className='h-auto rounded-xl border-border/70 bg-background/40 py-3 text-sm font-medium text-foreground'>
                  <Link to={manageHref}>
                    <Settings className='size-4' />
                    {txa('Yönet')}
                  </Link>
                </Button>
              ) : (
                <div className='inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/40 py-3 text-sm font-medium text-muted-foreground'>
                  <Settings className='size-4' />
                  {txa('Yönetici görünümü')}
                </div>
              )}

              <Button
                type='button'
                variant='ghost'
                className='h-auto rounded-xl bg-primary/10 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20'
                onClick={onEdit}
              >
                {txa('Fansub Düzenle')}
                <PenLine className='size-4' />
              </Button>
            </div>
          ) : viewerActions.length > 0 ? (
            <div className={cn(
              'grid gap-3',
              viewerActions.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
            )}>
              {viewerActions}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
