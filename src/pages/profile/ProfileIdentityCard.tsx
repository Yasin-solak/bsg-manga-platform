/**
 * ProfileIdentityCard: the profile page's main identity card
 * Banner + Avatar + Username + Bio + Badges + Stat bar + Tab navigation
 *
 * Design decision:
 * - The stat bar is only Followers / Following / Chapters Read
 * - Badges show beside the bio (Discord style)
 * - Profile effect: plays as different surfaces on hover and on the profile
 * - Tab state is managed from outside (ProfilePage)
 */
import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import { resolveProfileSurfaceImage } from './profileMedia'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { toast } from 'sonner'
import {
  AtSign,
  BarChart3,
  Crown,
  EyeOff,
  Info,
  LayoutGrid,
  List,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Share2,
  UserPlus,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  getVisibleProfileHeroBadges,
} from './profileHeroStandards'
import { usePremiumPerk } from '@/lib/premiumPerks'
import type { MockUser, OwnedBackground, ProfileOwnedBadge } from './types'
import { ProfileLevelProgress } from './ProfileLevelProgress'
import { intlLocale, txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

/* --- Tipler --- */

export type ProfileTabId = 'overview' | 'stats' | 'lists' | 'about'

type ProfileIdentityCardProps = {
  activeTab: ProfileTabId
  canViewProfileStats: boolean
  className?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  currentUserExists: boolean
  effectiveBg: OwnedBackground | null
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  effectiveFrame: FrameType
  isFollowing: boolean
  isMutual: boolean
  isOwnProfile: boolean
  onEdit?: () => void
  onFollowersOpen?: () => void
  onFollowToggle?: () => void
  onFollowingOpen?: () => void
  onTabChange: (tab: ProfileTabId) => void
  ownedBadges: ProfileOwnedBadge[]
  profileHeaderNameClassName?: string
  profileHeaderNameInlineStyle?: CSSProperties
  user: MockUser
  variant?: 'editor' | 'profile'
}

/* --- Banner render --- */

function renderBannerBackground(
  bg: OwnedBackground | null,
  options: { enableVideoPlayback?: boolean } = {},
) {
  const { enableVideoPlayback = false } = options

  if (!bg) {
    return (
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--foreground) / 0.82), hsl(var(--foreground) / 0.58) 48%, hsl(var(--primary) / 0.72))',
        }}
      />
    )
  }

  const resolvedUrl = resolveStoreAssetUrl(bg.background) || bg.background || ''
  const bgUrl = resolveProfileSurfaceImage(resolvedUrl, 1400, 76)
    || optimizePublicImageUrl(resolvedUrl)
    || resolvedUrl
  const isVideo = bg.mediaType === 'video' || isVideoAssetUrl(bgUrl)

  if (isVideo) {
    if (!enableVideoPlayback) {
      return (
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              'linear-gradient(135deg, hsl(var(--foreground) / 0.84), hsl(var(--foreground) / 0.6) 45%, hsl(var(--primary) / 0.64))',
          }}
        />
      )
    }
    return (
      <video
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: 'center 42%' }}
        src={bgUrl}
        autoPlay loop muted playsInline preload="metadata" aria-hidden
      />
    )
  }

  if (/^(https?:|data:|blob:|\/)/i.test(bgUrl)) {
    return (
      <img
        loading="eager" decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: 'center 42%' }}
        src={bgUrl} alt="" aria-hidden
      />
    )
  }

  return <div className="absolute inset-0" style={{ background: bgUrl }} aria-hidden />
}

/* --- Stat item --- */

function StatItem({
  disabled = false,
  label,
  onClick,
  value,
}: {
  disabled?: boolean
  label: string
  onClick?: () => void
  value: string | number
}) {
  const content = (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base font-black text-foreground">
        {typeof value === 'number' ? value.toLocaleString(intlLocale()) : value}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  )

  if (!onClick) return <div className="px-3.5 py-1.5">{content}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-[8px] px-3.5 py-1.5 transition-colors hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {content}
    </button>
  )
}

/* --- Tab navigasyonu --- */

const TABS: { id: ProfileTabId; icon: ReactNode; label: string }[] = [
  { id: 'overview', icon: <LayoutGrid className="size-4" />, get label() { return txa('Genel Bakış') } },
  { id: 'stats', icon: <BarChart3 className="size-4" />, get label() { return txa('İstatistikler') } },
  { id: 'lists', icon: <List className="size-4" />, get label() { return txa('Listeler') } },
  { id: 'about', icon: <Info className="size-4" />, get label() { return txa('Hakkinda') } },
]

/* --- Main component --- */

export default function ProfileIdentityCard({
  activeTab,
  canViewProfileStats,
  className,
  activeProfileEffectAssets,
  currentUserExists,
  effectiveBg,
  effectiveCustomFrameUrl,
  effectivePosterFrameUrl,
  effectiveFrame,
  isFollowing,
  isMutual,
  isOwnProfile,
  onEdit,
  onFollowersOpen,
  onFollowToggle,
  onFollowingOpen,
  onTabChange,
  ownedBadges,
  profileHeaderNameClassName,
  profileHeaderNameInlineStyle,
  user,
  variant = 'profile',
}: ProfileIdentityCardProps) {
  const isEditorPreview = variant === 'editor'
  const avatarUrl = resolveProfileSurfaceImage(user.avatar, 160, 76) || user.avatar
  const avatarSize = isEditorPreview ? 80 : 120
  const premiumBadgeVisible = usePremiumPerk('premium_badge')
  const [isCardHovered, setIsCardHovered] = useState(false)
  const [hasActivatedBackgroundVideo, setHasActivatedBackgroundVideo] = useState(false)
  // On the profile page video always plays, no need to wait for hover
  const shouldPlayVideo = isEditorPreview || variant === 'profile' || isCardHovered || hasActivatedBackgroundVideo

  // Badge display
  const { visibleBadges } = getVisibleProfileHeroBadges(ownedBadges)
  const profileUrl = typeof window === 'undefined'
    ? `/profil/${encodeURIComponent(user.username)}`
    : `${window.location.origin}${localizeHref(`/profil/${encodeURIComponent(user.username)}`, getActiveLocale())}`

  const copyProfileUrl = async () => {
    if (typeof navigator === 'undefined') return

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileUrl)
        toast.success(txa('Profil linki kopyalandı.'))
        return
      }

      if (navigator.share) {
        await navigator.share({
          title: `${user.displayName || user.username} profili`,
          url: profileUrl,
        })
        return
      }

      toast.info(txa('Profil linki kopyalanamadı; tarayıcı pano izni vermedi.'))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(txa('Profil linki paylaşılamadı.'))
    }
  }

  const handleMessageClick = () => {
    if (isOwnProfile) {
      toast.info(txa('Kendi profiline mesaj gönderemezsin.'))
      return
    }

    toast.info(txa('Mesaj merkezi topluluk sayfasından açılıyor.'))
    window.setTimeout(() => {
      window.location.assign(localizeHref('/topluluk', getActiveLocale()))
    }, 350)
  }

  useEffect(() => {
    setHasActivatedBackgroundVideo(false)
  }, [effectiveBg?.background, effectiveBg?.mediaType])

  // Values shown in the stat bar
  const totalChapters = user.stats.totalChaptersRead ?? user.stats.reading

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-[24px] border border-border/60 bg-card shadow-sm', className)}
      onMouseEnter={() => { setIsCardHovered(true); setHasActivatedBackgroundVideo(true) }}
      onMouseLeave={() => setIsCardHovered(false)}
      onPointerDown={() => setHasActivatedBackgroundVideo(true)}
    >
      {/* === BANNER — Discord tarzı dramatik sahne === */}
      <div className={cn(
        'relative z-0 overflow-hidden',
        isEditorPreview ? 'h-[160px] sm:h-[180px]' : 'h-[260px] sm:h-[300px]',
      )}>
        {renderBannerBackground(effectiveBg, { enableVideoPlayback: shouldPlayVideo })}

        {/* Profil efekti: profile surface — banner içinde, sayfa açıldığında otomatik oynar */}
        {activeProfileEffectAssets ? (
          <ProfileEffectLayer
            assets={activeProfileEffectAssets}
            surface="profile"
            className={PROFILE_EFFECT_TOP_LAYER}
          />
        ) : null}

        {/* Banner alt gradient — efektin üstünde, içerikle yumuşak geçiş */}
        <div className="absolute inset-0 z-[3] bg-gradient-to-t from-card via-card/25 to-transparent" aria-hidden />
      </div>

      {/* === İÇERİK === */}
      <div className="relative z-20 px-5 pb-0 sm:px-7">
        {/* Avatar + İsim + Meta */}
        <div className={cn(
          'flex flex-col gap-3 md:flex-row md:items-end md:gap-5',
          isEditorPreview ? '-mt-12 sm:-mt-14' : '-mt-16 sm:-mt-[76px]',
        )}>
          {/* Avatar — Discord tarzı banner kenarından dramatik sarkma */}
          <div className="relative z-30 shrink-0 rounded-full border-[5px] border-card bg-card shadow-xl shadow-black/10">
            <AvatarFrame
              src={avatarUrl}
              alt={user.displayName || user.username}
              frameType={effectiveFrame}
              size={avatarSize}
              animated
              customOverlayUrl={effectiveCustomFrameUrl}
              posterOverlayUrl={effectivePosterFrameUrl}
              disableStoreLookup
              hoverPlayback="always"
            />
          </div>

          {/* İsim + Seviye + Rozetler */}
          <div className="min-w-0 flex-1 pb-1">
            {/* İsim satırı */}
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className={cn(
                  'max-w-full break-words text-[28px] font-black leading-[1.05] tracking-tight text-foreground sm:text-[36px]',
                  profileHeaderNameClassName || '',
                )}
                style={profileHeaderNameInlineStyle}
              >
                {user.displayName || user.username}
              </h1>
              <Badge className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                {user.progression
                  ? txa('Seviye {v1} · {v2}', { v1: user.progression.levelNumber, v2: txa(user.progression.title) })
                  : `Seviye ${user.level}`}
              </Badge>
              {user.isPremiumActive && premiumBadgeVisible ? (
                <Badge variant="outline" className="rounded-full border-amber-400/40 bg-amber-400/12 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                  <Crown className="mr-1 size-3" />
                  {txa('Premium')}
                </Badge>
              ) : null}
              <FansubIdentityTagChip tag={user.activeFansubIdentityTag} size="sm" showAudienceLabel />
              {isMutual && !isOwnProfile ? (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {txa('Karşılıklı takip')}
                </Badge>
              ) : null}
              {/* Rozetler - Discord tarzı isim satırı yanında */}
              {visibleBadges.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  {visibleBadges.map((badge, index) => (
                    <img
                      key={`${badge.id}-${index}`}
                      src={badge.badge?.image_url || '/badges/default.png'}
                      alt={badge.badge?.name || txa('Rozet')}
                      title={badge.badge?.name || txa('Rozet')}
                      loading="lazy" decoding="async"
                      className="size-7 rounded-[6px] object-contain transition-transform hover:scale-110"
                    />
                  ))}
                  {ownedBadges.filter(b => b.is_displayed).length > visibleBadges.length ? (
                    <span className="flex size-7 items-center justify-center rounded-[6px] bg-muted/30 text-[10px] font-bold text-muted-foreground">
                      +{ownedBadges.filter(b => b.is_displayed).length - visibleBadges.length}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Benzersiz @kullanici etiketi */}
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <AtSign className="size-3.5" />
                {user.username}
              </span>
            </div>
            {user.progression ? <ProfileLevelProgress progression={user.progression} /> : null}
          </div>
        </div>

        {/* === İSTATİSTİK BAR + AKSİYONLAR === */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          {/* Sol: Stat bar */}
          {canViewProfileStats ? (
            <div className="flex items-center rounded-[14px] border border-border/40 bg-card/60 backdrop-blur-md">
              <StatItem
                label={txa('Takipçi')}
                value={user.stats.followers}
                onClick={isEditorPreview ? undefined : onFollowersOpen}
                disabled={isEditorPreview}
              />
              <div className="h-5 w-px bg-border/30" />
              <StatItem
                label={txa('Takip Edilen')}
                value={user.stats.following ?? 0}
                onClick={isEditorPreview ? undefined : onFollowingOpen}
                disabled={isEditorPreview}
              />
              <div className="h-5 w-px bg-border/30" />
              <StatItem label={txa('Okunan Bölüm')} value={totalChapters} />
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-[12px] bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
              <EyeOff className="size-3.5" />
              {txa('İstatistikler gizli')}
            </div>
          )}

          {/* Sağ: Aksiyon butonları */}
          <div className="flex items-center gap-2">
            {isOwnProfile ? (
              <Button
                type="button"
                className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={onEdit}
              >
                <PenLine className="mr-1.5 size-4" />
                {txa('Profili Düzenle')}
              </Button>
            ) : currentUserExists ? (
              <Button
                type="button"
                variant={isFollowing ? 'secondary' : 'default'}
                className="h-10 rounded-full px-5 font-semibold"
                onClick={onFollowToggle}
              >
                <UserPlus className="mr-1.5 size-4" />
                {isFollowing ? txa('Takipte') : txa('Takip Et')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 rounded-full border-border/40 bg-card/60 backdrop-blur-sm"
              aria-label={txa('Profili paylaş')}
              onClick={() => { void copyProfileUrl() }}
            >
              <Share2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 rounded-full border-border/40 bg-card/60 backdrop-blur-sm"
              aria-label={isOwnProfile ? txa('Kendi profiline mesaj gönderilemez') : txa('Mesaj gönder')}
              disabled={isOwnProfile}
              onClick={handleMessageClick}
            >
              <MessageCircle className="size-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-full border-border/40 bg-card/60 backdrop-blur-sm"
                  aria-label={txa('Profil seçenekleri')}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => { void copyProfileUrl() }}>
                  {txa('Profil linkini kopyala')}
                </DropdownMenuItem>
                {isOwnProfile ? (
                  <DropdownMenuItem onClick={onEdit}>
                    {txa('Profili düzenle')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleMessageClick}>
                    {txa('Mesaj gönder')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.reload()}>
                  {txa('Profili yenile')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* === TAB NAVİGASYONU === */}
        <div className="mt-5 border-t border-border/30">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={txa('Profil sekmeleri')}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-1.5 px-4 py-3 text-[13px] font-semibold transition-colors',
                  activeTab === tab.id
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.icon}
                {tab.label}
                {/* Aktif tab alt çizgi — Discord tarzı kalın vurgu */}
                {activeTab === tab.id ? (
                  <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-primary" />
                ) : null}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
