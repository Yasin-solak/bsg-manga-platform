import type { CSSProperties } from 'react'
import { Link } from '@/i18n/router'
import { ExternalLink, MoreHorizontal, Sparkles, UserPlus, Users } from 'lucide-react'

import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import { UserMurekBuddy } from '@/components/murek/UserMurekBuddy'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'

import { AvatarFrame } from './AvatarFrame'
import FansubIdentityTagChip from './FansubIdentityTagChip'
import PremiumCrownBadge from './PremiumCrownBadge'
import { buildHoverCardThemeStyle, hasValidHoverCardTheme, type HoverCardThemeColors } from './hoverCardTheme'
import { formatFansubRole } from './userHoverCardShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

export interface UserHoverCardSurfaceBadge {
  id: string
  name: string
  imageUrl: string
  rarity?: string
}

export interface UserHoverCardSurfaceFansubMembership {
  fansubId: string
  fansubName: string
  fansubSlug?: string
  role: string
}

export interface UserHoverCardSurfaceProps {
  className?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  hasCustomBg?: boolean
  profileBackgroundVideoUrl?: string
  profileBackgroundStyle?: string
  shouldRenderPatternOverlay?: boolean
  profilePatternStyle?: string
  themeColors?: HoverCardThemeColors | null
  /** For the Mürek look; otherwise Mürek is not drawn. */
  userId?: string | null
  username: string
  displayName: string
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
  avatar: string
  frameType?: string
  activeNameClassName?: string
  activeNameInlineStyle?: CSSProperties
  isPremiumActive?: boolean
  sharedFansubNames?: string[]
  isBlockedByCurrentUser?: boolean
  hydrationError?: string | null
  onRetryHydration?: (() => void) | null
  followerCount?: number
  displayedBadges?: UserHoverCardSurfaceBadge[]
  bio?: string
  fansubMemberships?: UserHoverCardSurfaceFansubMembership[]
  isOwnHoverProfile?: boolean
  showHydrationSkeleton?: boolean
  isFollowStateLoading?: boolean
  isFollowActionLoading?: boolean
  isBlockStateLoading?: boolean
  isBlockActionLoading?: boolean
  isFollowingUser?: boolean
  primaryColor?: string
  secondaryColor?: string
  showActionMenu?: boolean
  actionMenuOpen?: boolean
  onActionMenuOpenChange?: (open: boolean) => void
  onActionMenuPointerDown?: (() => void) | null
  onOpenUserReport?: (() => void) | null
  onToggleBlock?: (() => void) | null
  onFollowToggle?: (() => void) | null
  profileHref?: string | null
}

export function UserHoverCardSurface({
  className,
  activeProfileEffectAssets,
  hasCustomBg = false,
  profileBackgroundVideoUrl,
  profileBackgroundStyle,
  shouldRenderPatternOverlay = false,
  profilePatternStyle,
  themeColors = null,
  userId = null,
  username,
  displayName,
  activeFansubIdentityTag,
  avatar,
  frameType = 'default',
  activeNameClassName = '',
  activeNameInlineStyle,
  isPremiumActive = false,
  sharedFansubNames = [],
  isBlockedByCurrentUser = false,
  hydrationError = null,
  onRetryHydration,
  followerCount = 0,
  displayedBadges = [],
  bio,
  fansubMemberships = [],
  isOwnHoverProfile = false,
  showHydrationSkeleton = false,
  isFollowStateLoading = false,
  isFollowActionLoading = false,
  isBlockStateLoading = false,
  isBlockActionLoading = false,
  isFollowingUser = false,
  primaryColor,
  secondaryColor,
  showActionMenu = true,
  actionMenuOpen = false,
  onActionMenuOpenChange,
  onActionMenuPointerDown,
  onOpenUserReport,
  onToggleBlock,
  onFollowToggle,
  profileHref,
}: UserHoverCardSurfaceProps) {
  const displayedBadgesPreview = displayedBadges.slice(0, 3)
  const hiddenBadgeCount = Math.max(0, displayedBadges.length - displayedBadgesPreview.length)
  const hasFollowAction = Boolean(onFollowToggle) && !isOwnHoverProfile
  const followDisabled = isFollowStateLoading || isFollowActionLoading || isBlockStateLoading || isBlockedByCurrentUser || !onFollowToggle
  const isThemed = hasValidHoverCardTheme(themeColors)
  const followLabel = isBlockStateLoading
    ? txa('Kontrol...')
    : isBlockedByCurrentUser
      ? txa('Engelli')
      : isFollowActionLoading
        ? txa('İşleniyor...')
        : isFollowingUser
          ? txa('Takipte')
          : txa('Takip Et')

  return (
    <Card
      className={cn('relative flex h-[640px] flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl', className)}
      style={buildHoverCardThemeStyle(themeColors, undefined, { hasCustomBackground: hasCustomBg })}
    >
      {activeProfileEffectAssets ? (
        <ProfileEffectLayer assets={activeProfileEffectAssets} surface='hover' active className={PROFILE_EFFECT_TOP_LAYER} />
      ) : null}
      {showActionMenu && username ? (
        <DropdownMenu modal={false} onOpenChange={onActionMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              onPointerDown={() => onActionMenuPointerDown?.()}
              className='absolute right-3 top-3 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary'
              aria-label={txa('Daha fazla')}
              aria-expanded={actionMenuOpen}
            >
              <MoreHorizontal className='size-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='z-[420] w-40'>
            <DropdownMenuItem className='opacity-75' onSelect={() => onOpenUserReport?.()}>
              {txa('Kullanıcıyı Bildir')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className='text-destructive opacity-75 focus:text-destructive' onSelect={() => onToggleBlock?.()}>
              {isBlockActionLoading ? txa('İşleniyor...') : isBlockedByCurrentUser ? txa('Engeli Kaldır') : txa('Kullanıcıyı Engelle')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div className={cn('relative z-0 h-36', !hasCustomBg && !isThemed && 'bg-gradient-to-b from-muted/10 via-background to-background')}>
        {profileBackgroundVideoUrl ? (
          <video className='absolute inset-0 h-full w-full object-cover' autoPlay loop muted playsInline>
            <source src={profileBackgroundVideoUrl} />
          </video>
        ) : null}
        {profileBackgroundStyle && !profileBackgroundVideoUrl ? (
          <div className='absolute inset-0' style={{ background: profileBackgroundStyle }} />
        ) : null}
        {shouldRenderPatternOverlay && profilePatternStyle ? (
          <div className='absolute inset-0 opacity-40' style={{ background: profilePatternStyle }} />
        ) : null}
        <div
          className='absolute inset-0'
          style={{
            background:
              'linear-gradient(to top, var(--hover-card-banner-fade, rgb(0 0 0 / 0.8)), var(--hover-card-banner-fade-mid, rgb(0 0 0 / 0.4)), transparent)',
          }}
        />
        {userId ? <UserMurekBuddy userId={userId} isOwn={isOwnHoverProfile} className='bottom-[38px] right-4' /> : null}
      </div>

      <div className='relative z-10 -mt-10 flex min-h-0 flex-1 flex-col overflow-visible p-4'>
        <div className='flex items-start gap-3'>
          <div className='relative z-20 shrink-0'>
            <AvatarFrame src={avatar} alt={displayName} frameType={frameType} size={56} animated={true} hoverActive />
          </div>

          <div className='min-w-0 flex-1 pt-5'>
            {/* Isim satiri: ad ana eleman; FansubIdentityTagChip ve PremiumCrownBadge
                ismin saginda takipci olarak flex-wrap ile akar — vitrin (ProfileIdentityShowcase)
                ile birebir ayni yapi. */}
            <div className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
              <h3 className={cn('line-clamp-2 break-words font-semibold', activeNameClassName || 'text-foreground')} style={activeNameInlineStyle}>
                {displayName}
              </h3>
              {activeFansubIdentityTag ? (
                <FansubIdentityTagChip tag={activeFansubIdentityTag} size='xs' />
              ) : null}
              {isPremiumActive ? <PremiumCrownBadge size={18} /> : null}
            </div>
            <p className='max-w-full truncate text-xs text-muted-foreground'>@{username}</p>
            {!showHydrationSkeleton && sharedFansubNames.length > 0 ? (
              <p title={sharedFansubNames.join(', ')} className='mt-1 max-w-full truncate text-[11px] font-medium text-primary'>
                {txa('Ortak fansub:')}{' '}{sharedFansubNames[0]}{sharedFansubNames.length > 1 ? ` +${sharedFansubNames.length - 1}` : ''}
              </p>
            ) : null}
            {!showHydrationSkeleton && isBlockedByCurrentUser ? (
              <p className='mt-1 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700'>
                {txa('Engellediniz')}
              </p>
            ) : null}
          </div>
        </div>

        {isBlockedByCurrentUser ? (
          <div className='mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2'>
            <p className='m-0 text-[11px] leading-relaxed text-amber-800'>
              {txa('Bu kullanıcının gönderileri ve yorumları size gizlenir. Engeli aynı menüden kaldırabilirsiniz.')}
            </p>
          </div>
        ) : null}

        {hydrationError ? (
          <div className='mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2'>
            <div className='flex items-center justify-between gap-2'>
              <p className='m-0 text-[11px] text-destructive'>{hydrationError}</p>
              {onRetryHydration ? (
                <button
                  type='button'
                  onClick={onRetryHydration}
                  className='inline-flex shrink-0 items-center rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15'
                >
                  {txa('Tekrar Dene')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className='mt-4 flex items-center gap-4 border-t border-border/50 pt-3'>
          <div className='flex flex-1 items-center gap-4'>
            <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <Users className='size-3.5' />
              <span>{txa('{v1} takipci', { v1: followerCount.toLocaleString(intlLocale()) })}</span>
            </div>
          </div>
          {displayedBadgesPreview.length > 0 ? (
            <div className='flex items-center gap-1.5'>
              {displayedBadgesPreview.map((badge) => (
                <img
                  key={badge.id}
                  src={badge.imageUrl}
                  alt={txa(badge.name)}
                  title={txa(badge.name)}
                  className='h-7 w-7 rounded-md border border-border/70 bg-muted/20 object-contain p-0.5'
                  loading='lazy'
                  onError={(event) => {
                    event.currentTarget.src = '/badges/default.png'
                  }}
                />
              ))}
              {hiddenBadgeCount > 0 ? (
                <span title={txa('{v1} ek rozet', { v1: hiddenBadgeCount })} className='inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/70 bg-background/60 px-1.5 text-[10px] font-semibold text-muted-foreground'>
                  +{hiddenBadgeCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className='mt-3 border-t border-border/50 pt-3'>
          <p className='m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            <Sparkles className='size-3' />
            {txa('Hakkinda')}
          </p>
          {showHydrationSkeleton ? (
            <div className='mt-2 space-y-1.5 animate-pulse'>
              <div className='h-2.5 w-full rounded bg-muted/40' />
              <div className='h-2.5 w-[92%] rounded bg-muted/35' />
              <div className='h-2.5 w-[76%] rounded bg-muted/30' />
            </div>
          ) : (
            <p className='mt-2 max-h-24 overflow-y-auto break-words whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]'>
              {bio || txa('Bu kullanici henuz kendisi hakkinda bir aciklama eklemedi.')}
            </p>
          )}
        </div>

        <div className='mt-auto space-y-3 pt-3'>
          {showHydrationSkeleton ? (
            <div className='border-t border-border/50 pt-3'>
              <p className='m-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{txa('Fansub Rolleri')}</p>
              <div className='mt-2 space-y-1.5 animate-pulse'>
                <div className='h-7 w-full rounded-md bg-muted/35' />
                <div className='h-7 w-full rounded-md bg-muted/30' />
              </div>
            </div>
          ) : fansubMemberships.length > 0 ? (
            <div className='border-t border-border/50 pt-3'>
              <p className='m-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{txa('Fansub Rolleri')}</p>
              <div className='mt-2 space-y-1.5'>
                {fansubMemberships.slice(0, 3).map((membership) => {
                  const roleLabel = formatFansubRole(membership.role)
                  const publicFansubHref = buildPublicFansubPath({
                    id: membership.fansubId,
                    slug: membership.fansubSlug,
                  })
                  return profileHref ? (
                    <Link
                      key={`${membership.fansubId}-${membership.role}`}
                      to={publicFansubHref}
                      className='group flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 transition-colors hover:border-primary/40'
                    >
                      <span title={roleLabel} className='max-w-[90px] shrink-0 truncate rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground/90'>
                        {roleLabel}
                      </span>
                      <span title={membership.fansubName} className='min-w-0 flex-1 truncate text-xs text-foreground transition-colors group-hover:text-primary'>
                        {membership.fansubName}
                      </span>
                      <ExternalLink className='size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary' />
                    </Link>
                  ) : (
                    <div
                      key={`${membership.fansubId}-${membership.role}`}
                      className='group flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5'
                    >
                      <span title={roleLabel} className='max-w-[90px] shrink-0 truncate rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground/90'>
                        {roleLabel}
                      </span>
                      <span title={membership.fansubName} className='min-w-0 flex-1 truncate text-xs text-foreground'>
                        {membership.fansubName}
                      </span>
                    </div>
                  )
                })}
              </div>
              {fansubMemberships.length > 3 ? (
                <p className='mt-2 text-[11px] text-muted-foreground'>{txa('+{v1} ek fansub rolü', { v1: fansubMemberships.length - 3 })}</p>
              ) : null}
            </div>
          ) : null}

          {username ? (
            <div className='grid grid-cols-2 gap-2'>
              {hasFollowAction ? (
                <button
                  type='button'
                  onClick={() => onFollowToggle?.()}
                  disabled={followDisabled}
                  className={cn(
                    'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                    isFollowingUser
                      ? 'border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
                      : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-primary',
                    followDisabled ? 'cursor-not-allowed opacity-65' : '',
                  )}
                >
                  <UserPlus className='size-3' />
                  {followLabel}
                </button>
              ) : null}
              {profileHref ? (
                <Link
                  to={profileHref}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium text-primary transition-colors',
                    'bg-primary/10 hover:bg-primary/20',
                    isOwnHoverProfile || !hasFollowAction ? 'col-span-2' : '',
                    primaryColor || secondaryColor ? 'ring-1 ring-primary/20' : '',
                  )}
                >
                  {txa('Profili Goruntule')}
                  <ExternalLink className='size-3' />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}


