import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from '@/i18n/router'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Coins,
  Compass,
  Crown,
  Library,
  ListOrdered,
  LogOut,
  MessageSquare,
  Moon,
  PartyPopper,
  Settings,
  Shield,
  ShoppingBag,
  Sun,
  Target,
  Users,
  X, Gamepad2 } from 'lucide-react'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { useAuth } from '@/contexts/AuthContext'
import { useThemeContext } from '@/contexts/ThemeContext'
import { useNotificationCenter } from '@/components/notifications/notificationContext'
import { EXPLORE_PATH } from '@/lib/routes'
import {
  CONTACT_PATH,
  DMCA_PATH,
  HELP_CENTER_PATH,
  POLICY_HUB_PATH,
} from '@/lib/policyRoutes'
import { countChaptersPublishedToday } from '@/services/latestChapterFeedService'
import { getActivePremiumOffer, isPremiumActive } from '@/services/premiumPackagePublicService'
import type { ActiveEvent } from '@/services/rewardService/activeEvents'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Mobile menu panel (design handoff pattern).
 *
 * On a phone the menu is not a navigation list but a "who am I / what do I have / where can I
 * go" screen. It used to be the desktop sidebar squeezed into a narrow
 * drawer.
 *
 * **NO ARROWS on rows** (as in the handoff): every row in the panel already goes
 * somewhere; an arrow on each row added a 48-row column of arrows with no distinction.
 * The arrow is only on the identity card, which is a separate card,
 * not a row.
 *
 * **Bottom strip is FIXED** (handoff): Theme + Settings on the left, Sign out on the right. The middle
 * scrolls. A rare but critical action like signing out should not be searched for at the
 * bottom of a long list.
 */

interface MobileMenuPanelProps {
  /** Paneli kapatir; Sheet'in varsayilan dugmesi kimlik kartinin uzerine biniyordu. */
  onClose: () => void
  activeEvents: ActiveEvent[]
  adminFansubs: Array<{ id: string; name: string }>
  isAdmin: boolean
  /** The panel should close on every navigation; a drawer left open hides where you went. */
  onNavigate: () => void
}

interface MenuRowProps {
  to?: string
  onClick?: () => void
  icon: typeof Compass
  label: string
  badge?: string
  onNavigate: () => void
}

/** Handoff olculeri: 48px yukseklik, 13px radius, 21px ikon, 14.5px metin. */
const ROW_CLASS =
  'flex h-12 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[14.5px] font-semibold transition-colors hover:bg-muted'

function MenuRow({ to, onClick, icon: Icon, label, badge, onNavigate }: MenuRowProps) {
  const body = (
    <>
      <Icon className="size-[21px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-foreground">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-lg bg-primary/15 px-2 py-0.5 text-[10.5px] font-extrabold text-primary">
          {badge}
        </span>
      ) : null}
    </>
  )

  if (to) {
    return (
      <NavLink to={to} onClick={onNavigate} className={ROW_CLASS}>
        {body}
      </NavLink>
    )
  }
  return (
    <button type="button" onClick={() => { onClick?.(); onNavigate() }} className={ROW_CLASS}>
      {body}
    </button>
  )
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-1">
      <h3 className="px-2 pb-2 pt-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

export function MobileMenuPanel({
  onClose,
  activeEvents,
  adminFansubs,
  isAdmin,
  onNavigate,
}: MobileMenuPanelProps) {
  const { enabled: communityEnabled } = useCommunityAvailability()
  const { currentUser, signOut } = useAuth()
  const { resolvedTheme, toggleTheme } = useThemeContext()
  const notificationCenter = useNotificationCenter()
  const navigate = useNavigate()

  /*
   * The schedule badge uses the REAL count: chapters published today.
   * If zero or unknown the badge is NOT shown: "0" is as noisy as an empty
   * badge, and a wrong number is worse.
   */
  const [todayCount, setTodayCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    countChaptersPublishedToday()
      .then((count) => { if (!cancelled) setTodayCount(count) })
      .catch(() => { if (!cancelled) setTodayCount(0) })
    return () => { cancelled = true }
  }, [])

  // Duration and access hours are not hardcoded: they come from the real offer.
  const [offerLine, setOfferLine] = useState(() => txa('Erken erişim ve profil ayrıcalıkları'))
  useEffect(() => {
    let cancelled = false
    void getActivePremiumOffer()
      .then(({ data }) => {
        if (!cancelled && data) setOfferLine(`${txa('{hours} saat erken erişim', { hours: data.publicUnlockDelayHours })} · ${txa('{days} gün Premium', { days: data.durationDays })}`)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const premium = isPremiumActive(currentUser?.premiumExpiresAt)
  const event = activeEvents[0]
  const claimable = activeEvents.reduce((total, item) => total + (item.claimableCount || 0), 0)
  const unreadNotifications = notificationCenter.counts?.all ?? 0

  return (
    <div className="flex h-full flex-col" data-testid="mobile-menu-panel">
      {/*
        Baslik satiri (handoff): logo solda, kapatma sagda 44px dugme.
        Sheet'in varsayilan kapatma dugmesi sag ust kosede duruyor ve kimlik
        kartinin uzerine biniyordu; kapali.
      */}
      <div className="flex shrink-0 items-center gap-2.5 pb-1 pl-4 pr-3 pt-2">
        <Link to="/" onClick={onNavigate} className="flex items-center">
          <img
            src="/assets/promo/logo.png"
            alt={txa('BSG Manga')}
            className="h-[30px] w-auto object-contain"
            loading="eager"
            decoding="async"
          />
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={txa('Menüyü kapat')}
          className="grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
          data-testid="mobile-menu-close"
        >
          <X className="size-[22px]" aria-hidden="true" />
        </button>
      </div>

      {/* Ust blok sabit: kimlik ve Premium kaydirmayla gozden kaybolmamali. */}
      <div className="shrink-0 space-y-2 px-3 pb-3">
        {currentUser ? (
          <Link
            to={`/profil/${encodeURIComponent(currentUser.username)}`}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            data-testid="mobile-menu-identity"
          >
            <img
              src={currentUser.avatar}
              alt=""
              className="size-11 rounded-full border border-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-black text-foreground">
                @{currentUser.username}
              </p>
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                <Coins className="size-3.5 text-primary" aria-hidden="true" />
                {currentUser.stones.toLocaleString(intlLocale())}{' '}{txa('Coin')}
              </span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        ) : (
          <Link
            to="/giris"
            onClick={onNavigate}
            className="flex min-h-[46px] items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground"
          >
            {txa('Giriş yap')}
          </Link>
        )}

        {/*
          Premium MOR (handoff): primary teal degil. Menudeki tek "urun" satiri
          oldugu icin gezinme renginden ayrilmasi bilincli.
          txa('Keşfet') cipi TERS renkte — koyu temada acik zemin/koyu yazi, acik
          temada siyah zemin/beyaz yazi. `bg-foreground text-background` bunu
          tema basina kendiliginden dogru yapar.
        */}
        <Link
          to="/magaza/premium"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-500/25 via-amber-400/[0.07] to-card p-3"
        >
          <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-violet-500/30">
            <Crown className="size-[19px] text-violet-200 dark:text-violet-200" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-black tracking-tight text-foreground">{txa('Premium')}</p>
            <p className="m-0 mt-0.5 truncate text-[11.5px] font-semibold text-muted-foreground">
              {premium ? txa('Üyeliğin aktif') : offerLine}
            </p>
          </div>
          <span className="shrink-0 rounded-[10px] bg-foreground px-2.5 py-1.5 text-[11.5px] font-black text-background">
            {premium ? txa('Yönet') : txa('Keşfet')}
          </span>
        </Link>
      </div>

      {/* Orta alan kayar; alt serit sabit kalir. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <MenuSection title={txa('Keşif')}>
          <MenuRow to={EXPLORE_PATH} icon={Compass} label={txa('Keşfet')} onNavigate={onNavigate} />
          <MenuRow
            to="/yayin-takvimi"
            icon={CalendarDays}
            label={txa('Takvim')}
            badge={todayCount > 0 ? txa('Bugün {count}', { count: todayCount }) : undefined}
            onNavigate={onNavigate}
          />
          <MenuRow to="/listeler" icon={ListOrdered} label={txa('Listeler')} onNavigate={onNavigate} />
          <MenuRow to="/fansublar" icon={Users} label={txa('Fansublar')} onNavigate={onNavigate} />
          {communityEnabled && <MenuRow to="/topluluk" icon={MessageSquare} label={txa('Topluluk')} onNavigate={onNavigate} />}
          <MenuRow to="/magaza" icon={ShoppingBag} label={txa('Mağaza')} onNavigate={onNavigate} />
          <MenuRow to="/oyunlar" icon={Gamepad2} label={txa('Oyunlar')} onNavigate={onNavigate} />
        </MenuSection>

        {currentUser ? (
          <MenuSection title={txa('Sen')}>
            {/*
              Kutuphane "Kesif" degil txa('Sen'): kesif katalogu gezmek, kutuphane
              kendi okuma durumun. Grubun ilk satiri, cunku gunluk donulen yer.
            */}
            <MenuRow
              to="/kutuphane"
              icon={Library}
              label={txa('Kütüphane')}
              /*
               * NO badge: the unread count needs three queries and would run each time the menu
               * opens. The home strip already shows the same number in a
               * more visible place.
               */
              onNavigate={onNavigate}
            />
            {notificationCenter.enabled ? (
              <MenuRow
                to="/bildirimler"
                icon={Bell}
                label={txa('Bildirimler')}
                badge={unreadNotifications > 0 ? txa('{count} okunmamış', { count: unreadNotifications > 99 ? '99+' : unreadNotifications }) : undefined}
                onNavigate={onNavigate}
              />
            ) : null}
            {/* Gorevler bir rota degil, hizli panel; zaten var olan pencere olayi. */}
            <MenuRow
              icon={Target}
              label={txa('Görevler')}
              badge={claimable > 0 ? txa('{count} hazır', { count: claimable }) : undefined}
              onClick={() => window.dispatchEvent(new CustomEvent('mz:open-quests'))}
              onNavigate={onNavigate}
            />
          </MenuSection>
        ) : null}

        {/*
          Etkinlik karti handoff'ta BANNER: 74px kapak gorseli, uzerine
          soldan saga koyulasan gradyan ve beyaz baslik. Duz bir satir olarak
          basmak, etkinligi diger gezinme satirlarindan ayirmiyordu.
          Gorsel yoksa gradyan zemin kullanilir — kart yine cikar, cunku
          etkinligin KENDISI bilgi, gorsel susu degil.
        */}
        {event ? (
          <>
            <div className="mx-2 my-3 h-px bg-border" />
            <h3 className="px-2 pb-2 text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
              {txa('Aktif etkinlik')}
            </h3>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('mz:open-quests'))
                onNavigate()
              }}
              className="relative mx-1 block w-[calc(100%-0.5rem)] overflow-hidden rounded-[14px] border border-amber-400/25"
              data-testid="mobile-menu-event"
            >
              {event.banner ? (
                <img
                  src={event.banner}
                  alt=""
                  loading="lazy"
                  className="block h-[74px] w-full object-cover"
                />
              ) : (
                <div className="block h-[74px] w-full bg-gradient-to-br from-amber-500/40 to-violet-500/30" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/[0.86] to-black/25" />
              <div className="absolute inset-x-3 top-3 text-left">
                <p className="m-0 truncate text-[12.5px] font-extrabold text-white">
                  {event.title}
                </p>
                <p className="m-0 mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-white/75">
                  <PartyPopper className="size-3" aria-hidden="true" />
                  {txa('{v1} görev', { v1: event.quests.length })}
                  {claimable > 0 ? ` · ${txa('{count} ödül hazır', { count: claimable })}` : ''}
                </p>
              </div>
            </button>
          </>
        ) : null}

        {isAdmin || adminFansubs.length > 0 ? (
          <MenuSection title={txa('Yönetim')}>
            {isAdmin ? (
              <MenuRow to="/admin" icon={Shield} label={txa('Admin Paneli')} onNavigate={onNavigate} />
            ) : null}
            {adminFansubs.map((fansub) => (
              <MenuRow
                key={fansub.id}
                to={`/fansub/${fansub.id}/yonet`}
                icon={Users}
                label={fansub.name}
                onNavigate={onNavigate}
              />
            ))}
          </MenuSection>
        ) : null}

        {/*
          Destek ve yasal: footer'in bag listesi mobilde gizlendi ama
          KVKK/DMCA/Kullanim Sartlari erisilebilirligi yasal bir gereklilik.
        */}
        <MenuSection title={txa('Destek ve yasal')}>
          {[
            { to: HELP_CENTER_PATH, label: txa('Yardım Merkezi') },
            { to: CONTACT_PATH, label: txa('İletişim ve Hata Bildir') },
            { to: POLICY_HUB_PATH, label: txa('Kurallar ve politikalar') },
            { to: DMCA_PATH, label: txa('DMCA Bildirimi') },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </MenuSection>
      </div>

      {/*
        SABIT alt serit (handoff): Tema + Ayarlar solda, Cikis sagda.
        Cikis seyrek ama kritik; uzun bir listenin dibinde aranmamali ve
        yanlislikla basilmamasi icin diger ikisinden bosluklu duruyor.
      */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-11 items-center gap-2 rounded-xl bg-muted px-3 text-[13px] font-bold text-foreground"
          data-testid="mobile-menu-theme"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="size-[18px]" aria-hidden="true" />
          ) : (
            <Sun className="size-[18px]" aria-hidden="true" />
          )}
          {txa('Tema')}
        </button>

        {currentUser ? (
          <button
            type="button"
            aria-label={txa('Ayarlar')}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('mz:open-security'))
              onNavigate()
            }}
            className="grid size-11 place-items-center rounded-xl bg-muted text-foreground"
          >
            <Settings className="size-[19px]" aria-hidden="true" />
          </button>
        ) : null}

        <div className="flex-1" />

        {currentUser ? (
          <button
            type="button"
            aria-label={txa('Çıkış yap')}
            onClick={() => {
              void signOut()
              onNavigate()
              navigate('/')
            }}
            className={cn(
              'grid size-11 place-items-center rounded-xl bg-muted',
              'text-destructive',
            )}
            data-testid="mobile-menu-signout"
          >
            <LogOut className="size-[19px]" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
