/**
 * ProfileIdentityShowcase: profile identity card (v6, aligned exactly with HoverCard)
 *
 * User request: make the vertical format match the hover card exactly in lengths,
 * widths, background and avatar positions; similar to the hover
 * but clearly a profile.
 *
 * Source reference: `src/components/common/UserHoverCardSurface.tsx`
 *
 * Values adopted exactly:
 * - Card: `h-[640px]`, vertical, `rounded` Card, `overflow-hidden`
 * - Banner: `h-36` (144px), top darkening gradient (`from-black/80`)
 * - Profile effect: `surface='hover'`, `inset-0 z-[1]` (covers the card)
 * - Avatar: size 56, content section hangs over the banner edge with `-mt-10`
 * - Content p-4, flex-col, gap-3
 * - Stats: followers + posts (horizontal, with icons)
 * - About: Sparkles + bio max-h-24 scrollable
 *
 * Profile-specific differences (to feel like a profile):
 * - Action: NO "View profile" (already on the profile)
 * - Own profile: one wide "Edit profile" + Share/More
 * - Other profile: 'Follow' + "Message" (2 columns)
 * - Social link strip (Discord/X/Instagram): not on hover, small chips on the profile
 * - Premium CTA (own profile + no premium)
 * - A tiny top badge marked "PROFILE": makes clear this is a profile
 */
import { useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import {
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Share2,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'

import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { buildHoverCardThemeStyle, hasValidHoverCardTheme, type HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import PremiumCrownBadge from '@/components/common/PremiumCrownBadge'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import { PROFILE_EFFECT_TOP_LAYER } from '@/components/profileEffects/layering'
import { UserMurekBuddy } from '@/components/murek/UserMurekBuddy'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'

import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { resolveProfileSurfaceImage } from './profileMedia'
import { getVisibleProfileHeroBadges } from './profileHeroStandards'
import type { MockUser, OwnedBackground, ProfileOwnedBadge } from './types'
import { intlLocale, txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

/* --- Social platform server dictionary --- */
const SOCIAL_PLATFORM_PRESETS: Record<string, { label: string; urlBuilder: (handle: string) => string; mark: string }> = {
  discord: { get label() { return txa('Discord') }, urlBuilder: (handle) => `https://discord.com/users/${handle}`, mark: 'DC' },
  twitter: { label: 'X', urlBuilder: (handle) => `https://x.com/${handle}`, mark: 'X' },
  x: { label: 'X', urlBuilder: (handle) => `https://x.com/${handle}`, mark: 'X' },
  instagram: { get label() { return txa('Instagram') }, urlBuilder: (handle) => `https://instagram.com/${handle}`, mark: 'IG' },
}

type ProfileIdentityShowcaseProps = {
  className?: string
  activeProfileEffectAssets?: StoreProfileEffectAssets | null
  canViewProfileStats: boolean
  currentUserExists: boolean
  effectiveBg?: OwnedBackground | null
  effectiveCustomFrameUrl?: string
  effectivePosterFrameUrl?: string
  effectiveFrame: FrameType
  isFollowing: boolean
  /** Gizli hesaba gonderilmis, onay bekleyen takip istegi. */
  isRequested?: boolean
  isMutual: boolean
  isOwnProfile: boolean
  onEdit?: () => void
  onFollowersOpen?: () => void
  onFollowToggle?: () => void
  onFollowingOpen?: () => void
  ownedBadges: ProfileOwnedBadge[]
  profileHeaderNameClassName?: string
  profileHeaderNameInlineStyle?: CSSProperties
  themeColors?: HoverCardThemeColors | null
  user: MockUser
  variant?: 'editor' | 'profile'
}

/* --- Banner BG render (same layer language as the hover card) --- */
function renderBannerLayer(bg: OwnedBackground | null | undefined) {
  if (!bg) return null

  const resolvedUrl = resolveStoreAssetUrl(bg.background) || bg.background || ''
  const bgUrl = resolveProfileSurfaceImage(resolvedUrl, 800, 78)
    || optimizePublicImageUrl(resolvedUrl)
    || resolvedUrl
  const isVideo = bg.mediaType === 'video' || isVideoAssetUrl(bgUrl)

  if (isVideo) {
    return (
      <video
        className="absolute inset-0 h-full w-full object-cover"
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
        src={bgUrl} alt="" aria-hidden
      />
    )
  }

  return <div className="absolute inset-0" style={{ background: bgUrl }} aria-hidden />
}

export default function ProfileIdentityShowcase({
  className,
  activeProfileEffectAssets,
  canViewProfileStats,
  currentUserExists,
  effectiveBg,
  effectiveCustomFrameUrl,
  effectivePosterFrameUrl,
  effectiveFrame,
  isFollowing,
  isRequested = false,
  isMutual,
  isOwnProfile,
  onEdit,
  onFollowersOpen,
  onFollowToggle,
  onFollowingOpen,
  ownedBadges,
  profileHeaderNameClassName,
  profileHeaderNameInlineStyle,
  themeColors = null,
  user,
  variant = 'profile',
}: ProfileIdentityShowcaseProps) {
  const isEditorPreview = variant === 'editor'
  const isThemed = hasValidHoverCardTheme(themeColors)
  const avatarUrl = resolveProfileSurfaceImage(user.avatar, 200, 82) || user.avatar
  const [actionMenuOpen, setActionMenuOpen] = useState(false)

  // Badges (same as hover: max 3 + extra)
  const { visibleBadges } = getVisibleProfileHeroBadges(ownedBadges)
  const displayedBadges = visibleBadges.slice(0, 3)
  const totalDisplayedBadgeCount = ownedBadges.filter((b) => b.is_displayed).length
  const hiddenBadgeCount = Math.max(0, totalDisplayedBadgeCount - displayedBadges.length)

  // Social links
  const socialLinks = user.socialLinks.filter((link) => Boolean(link.username))

  // Profile share URL
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
        await navigator.share({ title: `${user.displayName || user.username} profili`, url: profileUrl })
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
    window.setTimeout(() => window.location.assign(localizeHref('/topluluk', getActiveLocale())), 350)
  }

  return (
    <Card
      className={cn(
        // Exactly like the hover card: 640px height, vertical, overflow-hidden
        'relative flex h-[640px] flex-col gap-0 overflow-hidden border-border/80 bg-background py-0 shadow-xl',
        className,
      )}
      style={buildHoverCardThemeStyle(themeColors, undefined, { hasCustomBackground: Boolean(effectiveBg) })}
    >
      {/* KATMAN 1: Profile effect (hover karttaki ile aynı, surface='hover') */}
      {activeProfileEffectAssets ? (
        <ProfileEffectLayer
          assets={activeProfileEffectAssets}
          surface="hover"
          active
          className={PROFILE_EFFECT_TOP_LAYER}
        />
      ) : null}

      {/* ÜST KART İŞARETİ: profil olduğunu net belirten chip
          Hover kartta yoktur (orada hover olduğu zaten bağlamdan belli);
          profilde sayfa rolünü vurgulamak için sade bir etiket koyuyoruz. */}
      <div className="absolute left-3 top-3 z-30 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/85 backdrop-blur">
        <Sparkles className="size-2.5" />
        {txa('Profil')}
      </div>

      {/* SAĞ ÜST: Daha fazla menüsü (hover karttaki MoreHorizontal ile aynı pozisyon) */}
      {!isEditorPreview ? (
        <DropdownMenu modal={false} open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute right-3 top-3 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              aria-label={txa('Daha fazla')}
              aria-expanded={actionMenuOpen}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[420] w-44">
            <DropdownMenuItem onClick={() => { void copyProfileUrl() }}>
              {txa('Profil linkini kopyala')}
            </DropdownMenuItem>
            {isOwnProfile ? (
              <DropdownMenuItem onClick={onEdit}>{txa('Profili düzenle')}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleMessageClick}>{txa('Mesaj gönder')}</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.reload()}>
              {txa('Profili yenile')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* BANNER: h-36 (hover karttaki ile birebir) */}
      <div
        className={cn(
          'relative z-0 h-36',
          !effectiveBg && !isThemed && 'bg-gradient-to-b from-muted/10 via-background to-background',
        )}
      >
        {renderBannerLayer(effectiveBg)}
        {/* Alt karartı gradient: hover karttaki ile birebir; temada Ana renge akar */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--hover-card-banner-fade, rgb(0 0 0 / 0.8)), var(--hover-card-banner-fade-mid, rgb(0 0 0 / 0.4)), transparent)',
          }}
        />
        {/* Murek: kullanicinin Dolap'tan kusandigi maskot, icerigin ust kenarina basar */}
        <UserMurekBuddy userId={user.id} isOwn={isOwnProfile} interactive={!isEditorPreview} className="bottom-[38px] right-4" />
      </div>

      {/* İÇERİK: -mt-10 sarkma (hover karttaki ile birebir) */}
      <div className="relative z-10 -mt-10 flex min-h-0 flex-1 flex-col overflow-visible p-4">
        {/* Avatar + İsim grubu
            v8: avatar yukarıda banner kenarına oturur (items-start) ve isim
            grubu `pt-3` ile biraz aşağı kayar — kullanıcı isteği:
            "ismi biraz daha aşagı alalım". `items-center` olsaydı isim
            avatarın ortasıyla hizalı; v8'de isim avatarın alt yarısı
            seviyesinde başlasın. */}
        <div className="flex items-start gap-3">
          <div className="relative z-20 shrink-0">
            <AvatarFrame
              src={avatarUrl}
              alt={user.displayName || user.username}
              frameType={effectiveFrame}
              size={56}
              animated={true}
              hoverActive
              customOverlayUrl={effectiveCustomFrameUrl}
              posterOverlayUrl={effectivePosterFrameUrl}
              disableStoreLookup
              hoverPlayback="always"
            />
          </div>

          <div className="min-w-0 flex-1 pt-5">
            {/* İsim satırı v8:
                - Gorunen ad ana element
                - Hemen yanında (sağa doğru): FansubIdentityTagChip (varsa)
                - Sonra: PremiumCrownBadge (premium ise)
                İsim uzarsa `line-clamp-2` ile 2 satıra düşer; chip/rozet
                `flex-wrap` sayesinde alt satıra geçer ama hep ismin sağ
                takipçisidir. `items-center` ile dikey hizalı dururlar. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <h3
                className={cn(
                  'line-clamp-2 break-words font-semibold',
                  profileHeaderNameClassName || 'text-foreground',
                )}
                style={profileHeaderNameInlineStyle}
              >
                {user.displayName || user.username}
              </h3>
              {user.activeFansubIdentityTag ? (
                <FansubIdentityTagChip tag={user.activeFansubIdentityTag} size="xs" />
              ) : null}
              {user.isPremiumActive ? (
                <PremiumCrownBadge size={18} />
              ) : null}
            </div>
            <p className="max-w-full truncate text-xs text-muted-foreground">@{user.username}</p>
          </div>
        </div>

        {/* STATS şeridi (hover karttaki ile birebir: border-t pt-3) */}
        <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-3">
          <div className="flex flex-1 items-center gap-4">
            {canViewProfileStats ? (
              <>
                <button
                  type="button"
                  onClick={isEditorPreview ? undefined : onFollowersOpen}
                  disabled={isEditorPreview}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:hover:text-muted-foreground"
                >
                  <Users className="size-3.5" />
                  <span>
                    <span className="font-semibold text-foreground">{user.stats.followers.toLocaleString(intlLocale())}</span>
                    {' '}{txa('takipci')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={isEditorPreview ? undefined : onFollowingOpen}
                  disabled={isEditorPreview}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:hover:text-muted-foreground"
                >
                  <MessageCircle className="size-3.5" />
                  <span>
                    <span className="font-semibold text-foreground">{(user.stats.following ?? 0).toLocaleString(intlLocale())}</span>
                    {' '}{txa('takipte')}
                  </span>
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs italic text-muted-foreground">
                {txa('İstatistikler gizli')}
              </span>
            )}
          </div>
          {displayedBadges.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {displayedBadges.map((badge) => (
                <img
                  key={badge.id}
                  src={badge.badge?.image_url || '/badges/default.png'}
                  alt={badge.badge?.name || txa('Rozet')}
                  title={badge.badge?.name || txa('Rozet')}
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

        {/* HAKKINDA (hover karttaki ile birebir) */}
        <div className="mt-3 border-t border-border/50 pt-3">
          <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3" />
            {txa('Hakkinda')}
          </p>
          <p className="mt-2 max-h-24 overflow-y-auto break-words whitespace-pre-wrap pr-1 text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]">
            {user.bio?.trim() || txa('Bu kullanici henuz kendisi hakkinda bir aciklama eklemedi.')}
          </p>
        </div>

        {/* AKSİYON BUTONLARI (mt-auto: hover karttaki ile birebir) */}
        <div className="mt-auto space-y-3 pt-3">
          {/* === BAĞLI HESAPLAR (v8 yer değişti) ===
              v7'de Hakkında'dan sonra ayrı bir bölümdü; v8'de kullanıcı
              isteğiyle aksiyon butonlarının hemen üstüne taşındı —
              "Profili Duzenle" butonuna en yakın bağlam burada. Bilgi yoksa
              blok hiç render edilmez. */}
          {socialLinks.length > 0 ? (
            <div className="border-t border-border/50 pt-3">
              <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <ExternalLink className="size-3" />
                {txa('Bağlı hesaplar')}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {socialLinks.slice(0, 3).map((link, index) => {
                  const platformKey = link.platform.toLowerCase()
                  const preset = SOCIAL_PLATFORM_PRESETS[platformKey]
                  const platformLabel = preset?.label || link.platform
                  const mark = preset?.mark || platformLabel.slice(0, 2).toUpperCase()
                  const url = preset?.urlBuilder(link.username)
                  const inner = (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-muted/30 text-[10px] font-bold text-foreground/85">
                        {mark}
                      </span>
                      <span className="max-w-full truncate text-[10px] font-medium text-foreground/80">
                        {link.username}
                      </span>
                    </div>
                  )
                  return url ? (
                    <a
                      key={`${platformKey}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${platformLabel}: ${link.username}`}
                      className="rounded-md border border-border/60 bg-background/40 px-1.5 py-1.5 transition-colors hover:border-primary/40"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div
                      key={`${platformKey}-${index}`}
                      title={`${platformLabel}: ${link.username}`}
                      className="rounded-md border border-border/60 bg-background/40 px-1.5 py-1.5"
                    >
                      {inner}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* === KARŞILIKLI ROZETİ (v8) ===
              Fansub etiketi v8'de isim yanına taşındığı için "kimlik etiketleri
              şeridi" v7'deki yapısını kaybetti; şimdi sadece ziyaretçi
              senaryosunda gösterilen "Karsilikli" rozetini barındırır. Kendi
              profilinde hiç görünmez. */}
          {isMutual && !isOwnProfile ? (
            <div className="flex justify-end">
              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {txa('Karşılıklı')}
              </span>
            </div>
          ) : null}

          {/* v8: Premium'a Gec CTA kaldirildi — kullanici istegi. Premium
              uyelik magazada ve ana sayfa kanallarinda zaten one cikarilir;
              kimlik kartinda yer israfi yapiyordu. */}

          {isOwnProfile ? (
            // MY OWN PROFILE: one wide Edit button + Share
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={onEdit}
                disabled={isEditorPreview}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-primary/45 bg-primary/15 px-2 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-65"
              >
                <PenLine className="size-3" />
                {txa('Profili Düzenle')}
              </button>
              <button
                type="button"
                onClick={() => { void copyProfileUrl() }}
                disabled={isEditorPreview}
                aria-label={txa('Profili paylaş')}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 px-3 py-2 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-65"
              >
                <Share2 className="size-3.5" />
              </button>
            </div>
          ) : currentUserExists ? (
            // OTHER PROFILE: Follow + Message (instead of the hover card's Follow + View profile)
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onFollowToggle}
                disabled={isEditorPreview}
                className={cn(
                  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                  isFollowing || isRequested
                    ? 'border-primary/45 bg-primary/15 text-primary hover:bg-primary/20'
                    : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/30 hover:text-primary',
                  isEditorPreview ? 'cursor-not-allowed opacity-65' : '',
                )}
              >
                <UserPlus className="size-3" />
                {isFollowing ? txa('Takipte') : isRequested ? txa('İstek gönderildi') : txa('Takip Et')}
              </button>
              <button
                type="button"
                onClick={handleMessageClick}
                disabled={isEditorPreview}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary/10 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-65"
              >
                <MessageCircle className="size-3" />
                {txa('Mesaj Gönder')}
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-center text-[11px] text-muted-foreground">
              {txa('Etkileşim için giriş yap.')}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
