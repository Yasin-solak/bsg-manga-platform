import { useEffect, useState, type ReactNode } from 'react'
import { useMobileTopBarOverride } from './MobileTopBarOverrideContext'
import { useLocation } from 'react-router-dom'
import { Link, NavLink, LocaleSwitchLink } from '@/i18n/router'
import { useT } from '@/i18n/LocaleProvider'
import { useAuth } from '@/contexts/AuthContext'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe'
import { countChaptersPublishedToday } from '@/services/latestChapterFeedService'
import { MobileMenuPanel } from './MobileMenuPanel'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import { EXPLORE_PATH } from '@/lib/routes'
import {
  CONTACT_PATH,
  DMCA_PATH,
  HELP_CENTER_PATH,
  POLICY_HUB_PATH,
} from '@/lib/policyRoutes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Compass,
  Home,
  ListOrdered,
  Menu,
  MessageSquare,
  Shield,
  ShoppingBag,
  Users,
} from 'lucide-react'
import { useAppSidebarData } from './appSidebar/useAppSidebarData'
import EventQuestsPanel, { formatEventCountdown } from '@/components/common/EventQuestsPanel'
import { getEventTheme } from '@/lib/eventThemes'
import { groupActiveEvents } from '@/services/rewardService'
import AccountTopBarActions from './AccountTopBarActions'
import GlobalSearchCommand from './GlobalSearchCommand'
import { DesktopEventCard } from '@/components/home/desktop/DesktopEventCard'
import { DesktopHomeNav } from '@/components/home/desktop/DesktopHomeNav'
import { HomePremiumCard } from '@/components/home/HomePremiumCard'
import { txa } from '@/i18n/activeLocale'

function AppSidebar({ hideMobileTopBar = false }: { hideMobileTopBar?: boolean }) {
  const { enabled: communityEnabled } = useCommunityAvailability()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  /*
   * The schedule badge shows the same number on the desktop sidebar and the mobile menu;
   * different numbers on two surfaces would make it unclear which
   * is right.
   */
  const [todayChapterCount, setTodayChapterCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    countChaptersPublishedToday()
      .then((count) => { if (!cancelled) setTodayChapterCount(count) })
      .catch(() => { if (!cancelled) setTodayChapterCount(0) })
    return () => { cancelled = true }
  }, [])

  const scrolledAway = useHideOnScroll()
  /*
   * Edge gesture: reaching the menu should not require the top bar to be visible.
   * Since the top bar hides on scroll, opening the menu otherwise meant
   * "scroll up first, then tap".
   */
  useEdgeSwipe({
    enabled: !isMobileMenuOpen,
    onOpen: () => setIsMobileMenuOpen(true),
  })
  // The bar DOES NOT HIDE while the menu is open: if the opened panel's trigger vanishes,
  // the user loses what opened the panel and how to close it.
  const topBarHidden = scrolledAway && !isMobileMenuOpen
  const mobileTopBarOverride = useMobileTopBarOverride()
  const [eventPanelOpen, setEventPanelOpen] = useState(false)
  const { currentUser, isAdmin, updateCurrentUser } = useAuth()
  const t = useT()
  const { isAdminResolved } = useResolvedAdminAccess(currentUser)
  const location = useLocation()

  const sidebarData = useAppSidebarData({
    currentUser,
    isAdmin: isAdminResolved || isAdmin,
    updateCurrentUser,
  })

  const activeEventGroups = groupActiveEvents(sidebarData.activeEvents)
  const openEventPanel = () => setEventPanelOpen(true)

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.hash, location.pathname, location.search])

  const navCls = (mini: boolean) => ({ isActive }: { isActive: boolean }) => cn(
    'flex items-center rounded-xl text-sm font-semibold transition-colors',
    mini ? 'h-11 w-11 justify-center' : 'w-full gap-3 px-3 py-2.5',
    isActive
      ? 'bg-sidebar-accent text-sidebar-primary'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
  )

  const TipWrap = ({ show, label, children }: { show: boolean; label: string; children: ReactNode }) => (
    show ? (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
      </Tooltip>
    ) : <>{children}</>
  )

  const renderSidebar = (mini: boolean, enableSearchHotkey = false) => (
    <div className={cn("flex h-full flex-col bg-sidebar", enableSearchHotkey && "desktop-home-sidebar")}>
      <div className={cn('flex h-[74px] shrink-0 items-center border-b border-sidebar-border', mini ? 'justify-center px-2' : 'gap-2.5 px-4')}>
        <Link
          to="/"
          className={cn('flex items-center', mini ? 'justify-center' : '')}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <img
            src="/assets/promo/logo.png"
            alt={txa('BSG Manga')}
            className={cn('object-contain', mini ? 'h-8 w-8' : 'h-14 w-auto max-w-[150px]')}
            loading="eager"
            decoding="async"
          />
        </Link>
      </div>

      <ScrollArea className={cn('min-h-0 flex-1 py-5', mini ? 'px-1' : 'px-4')}>
        {enableSearchHotkey ? <DesktopHomeNav username={currentUser?.username} todayCount={todayChapterCount} /> : <nav className={cn('space-y-1.5', mini && 'flex flex-col items-center')}>
          <TipWrap show={mini} label={t('nav.home')}>
            <NavLink to="/" end className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <Home className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.home')}`}
            </NavLink>
          </TipWrap>
          <TipWrap show={mini} label={t('nav.explore')}>
            <NavLink to={EXPLORE_PATH} className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <Compass className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.explore')}`}
            </NavLink>
          </TipWrap>
          <TipWrap show={mini} label={t('nav.fansubs')}>
            <NavLink to="/fansublar" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <Users className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.fansubs')}`}
            </NavLink>
          </TipWrap>
          {communityEnabled && <TipWrap show={mini} label={t('nav.community')}>
            <NavLink to="/topluluk" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <MessageSquare className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.community')}`}
            </NavLink>
          </TipWrap>}
          <TipWrap show={mini} label={t('nav.calendar')}>
            <NavLink to="/yayin-takvimi" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <CalendarDays className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.calendar')}`}
              {/* Rozet GERCEK sayidan: bugun yayinlanan bolum. Sifirsa hic
                  basilmaz — "0" gostermek bos bir rozet kadar gurultu. */}
              {!mini && todayChapterCount > 0 ? (
                <span className="ml-auto rounded-lg bg-primary/15 px-2 py-0.5 text-[10.5px] font-extrabold text-primary">
                  {t('nav.today', { count: todayChapterCount })}
                </span>
              ) : null}
            </NavLink>
          </TipWrap>
          <TipWrap show={mini} label={t('nav.lists')}>
            <NavLink to="/listeler" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <ListOrdered className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.lists')}`}
            </NavLink>
          </TipWrap>
          <TipWrap show={mini} label={t('nav.shop')}>
            <NavLink to="/magaza" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
              <ShoppingBag className="h-5 w-5 shrink-0" />{!mini && ` ${t('nav.shop')}`}
            </NavLink>
          </TipWrap>
        </nav>}

        {/*
          Destek ve yasal baglantilar — YALNIZCA mobil menude.
          Footer'in bag listesi telefonda gizlendi (her kaydirmanin sonunda bir
          ekran boyu yer kapliyordu); ama KVKK/DMCA/Kullanim Sartlari
          erisilebilirligi yasal bir gereklilik. Baglantilarin gidecek bir yeri
          olmadan footer'i kisaltmak, onlari erisilemez yapardi.
        */}
        {!mini ? (
          <div className="mt-6 space-y-1 border-t border-border pt-4 lg:hidden">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('nav.supportLegal')}
            </p>
            {[
              { to: HELP_CENTER_PATH, label: t('nav.helpCenter') },
              { to: CONTACT_PATH, label: t('nav.contact') },
              { to: POLICY_HUB_PATH, label: t('nav.policies') },
              { to: DMCA_PATH, label: t('nav.dmca') },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <LocaleSwitchLink
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            />
          </div>
        ) : null}

        {/* v9: eski kutuphane kisayollari (okuma gecmisi + favoriler linkleri)
            sidebar'dan kaldirildi (Devam Et bilgisi profil sayfasinin sticky sag
            sidebar'inda zaten var). Yerine asagidaki aktif etkinlik yuzeyi geldi. */}
        {currentUser && enableSearchHotkey ? activeEventGroups.map(event => <DesktopEventCard key={event.id} event={event} onOpen={openEventPanel} />) : currentUser && activeEventGroups.length > 0 ? (
          <>
            <Separator className="my-5" />
            {!mini ? (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
                {txa('Etkinlik')}
              </p>
            ) : null}
            <div className={cn('space-y-1.5', mini && 'flex flex-col items-center')}>
              {activeEventGroups.map((ev) => {
                const theme = getEventTheme(ev.theme)
                const EvIcon = theme.icon
                return (
                  <TipWrap key={ev.id} show={mini} label={ev.title}>
                    {ev.banner ? (
                      // With a banner uploaded: the image fills the area; NO icon/name, only the countdown.
                      <button
                        type="button"
                        onClick={() => { openEventPanel(); setIsMobileMenuOpen(false) }}
                        className={cn('group relative block overflow-hidden rounded-xl bg-muted shadow-sm ring-1 transition-shadow hover:shadow-md', theme.ring, mini ? 'h-11 w-11' : 'aspect-video w-full')}
                      >
                        <img src={ev.banner} alt={ev.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        {!mini ? (
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-2 py-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                              <Clock className="h-2.5 w-2.5" /> {ev.endsAt ? formatEventCountdown(new Date(ev.endsAt).getTime() - Date.now()) : txa('Aktif')}
                            </span>
                            {ev.claimableCount > 0 ? <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">{txa('{v1} ödül', { v1: ev.claimableCount })}</span> : null}
                          </span>
                        ) : ev.claimableCount > 0 ? (
                          <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      // Without a banner: theme icon + name + countdown.
                      <button
                        type="button"
                        onClick={() => { openEventPanel(); setIsMobileMenuOpen(false) }}
                        className={cn(
                          'group relative flex items-center overflow-hidden rounded-xl text-left ring-1 transition-shadow hover:shadow-md',
                          theme.ring,
                          'bg-gradient-to-br', theme.soft,
                          mini ? 'h-11 w-11 justify-center' : 'w-full gap-2.5 px-2.5 py-2',
                        )}
                      >
                        <span className={cn('pointer-events-none absolute -right-4 -top-5 h-14 w-14 rounded-full opacity-30 blur-2xl bg-gradient-to-br', theme.gradient)} />
                        <span className={cn('relative flex shrink-0 items-center justify-center rounded-lg text-white shadow-sm bg-gradient-to-br', theme.gradient, mini ? 'h-8 w-8' : 'h-9 w-9')}>
                          <EvIcon className={cn(mini ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
                        </span>
                        {!mini ? (
                          <span className="relative min-w-0 flex-1 overflow-hidden">
                            <span className="block truncate pr-3 text-sm font-bold text-sidebar-foreground">{ev.title}</span>
                            <span className={cn('flex items-center gap-1 text-[11px] font-semibold', theme.accent)}>
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {ev.endsAt ? formatEventCountdown(new Date(ev.endsAt).getTime() - Date.now()) : txa('Aktif')}
                                {ev.claimableCount > 0 ? ` · ${txa('{count} ödül!', { count: ev.claimableCount })}` : ''}
                              </span>
                            </span>
                          </span>
                        ) : null}
                        {ev.claimableCount > 0 ? (
                          <span className={cn('absolute flex h-2.5 w-2.5', mini ? 'right-1 top-1' : 'right-2 top-2')}>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                          </span>
                        ) : null}
                      </button>
                    )}
                  </TipWrap>
                )
              })}
            </div>
          </>
        ) : null}

        {enableSearchHotkey && !mini ? <HomePremiumCard /> : null}

        {currentUser && ((isAdminResolved || isAdmin) || sidebarData.adminFansubs.length > 0) ? (
          <>
            <Separator className="my-5" />
            {!mini ? (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
                {txa('Yönetim')}
              </p>
            ) : null}
            <nav className={cn('space-y-1.5', mini && 'flex flex-col items-center')}>
              {(isAdminResolved || isAdmin) ? (
                <TipWrap show={mini} label={t('nav.adminPanel')}>
                  <NavLink to="/admin" className={navCls(mini)} onClick={() => setIsMobileMenuOpen(false)}>
                    <Shield className="h-5 w-5 shrink-0" />{!mini && txa(' Admin Paneli')}
                  </NavLink>
                </TipWrap>
              ) : null}
              {sidebarData.adminFansubs.map((fansub) => (
                <TipWrap key={fansub.id} show={mini} label={fansub.name}>
                  <NavLink
                    to={`/fansub/${fansub.id}/yonet`}
                    className={navCls(mini)}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <ChevronRight className="h-5 w-5 shrink-0" />{!mini && ` ${fansub.name}`}
                  </NavLink>
                </TipWrap>
              ))}
            </nav>
          </>
        ) : null}

      </ScrollArea>

      {/* Eski ust bardan tasinan blok: arama + kullanici cipi (bildirim/mesaj sagda) */}
      <div className={cn('shrink-0 space-y-1.5 border-t border-sidebar-border', mini ? 'p-2' : 'p-3')}>
        <GlobalSearchCommand variant="sidebar" enableHotkey={enableSearchHotkey} />
        <AccountTopBarActions variant="sidebar" showCoinShortcut={enableSearchHotkey} />
      </div>
    </div>
  )

  return (
    <>
      <aside className={cn(
        'hidden border-r border-sidebar-border lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-60 lg:flex-col',
      )}>
        {renderSidebar(false, true)}
      </aside>

      {/* Asagi kaydirinca gizlenir (tasarim handoff deseni). `sticky`
          KORUNUYOR: `fixed`e cevirmek cubugu akistan cikarip altindaki
          icerigi 56px yukari kaydirirdi. */}
      <div
        data-testid="mobile-top-bar"
        data-hidden={topBarHidden ? 'true' : 'false'}
        className={cn(
          "sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-lg lg:hidden",
          // ONLY a slide; opacity DOES NOT CHANGE. Fading while sliding
          // felt like "it vanished"; a bar sliding under the top edge reads as
          // "stepped aside" and clearly returns. Duration went from 200 to 280,
          // with a curve soft at both ends instead of ease-out.
          "transition-transform duration-[280ms] [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] will-change-transform",
          topBarHidden && "-translate-y-full",
          hideMobileTopBar && "hidden sm:flex",
        )}
      >
        {mobileTopBarOverride ? mobileTopBarOverride.content : (
        <>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          {/* Varsayilan kapatma dugmesi KAPALI: sag ust kosede duruyor ve kimlik
              kartinin uzerine biniyordu. Handoff'ta kapatma, logolu bir
              baslik satirinin sagindaki 44px dugme. */}
          <SheetContent side="left" showCloseButton={false} className="w-[84vw] max-w-[340px] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{t('nav.menu')}</SheetTitle>
              <SheetDescription>{t('nav.menuDescription')}</SheetDescription>
            </SheetHeader>
            {/*
              Mobilde masaustu sidebar'i DEGIL, kendi paneli.
              Ayni link listesini dar bir cekmeceye sikistirmak, telefonda
              menunun asil isini (kimlik + bakiye + gruplanmis yollar)
              yapmiyordu.
            */}
            <MobileMenuPanel
              onClose={() => setIsMobileMenuOpen(false)}
              activeEvents={activeEventGroups}
              adminFansubs={sidebarData.adminFansubs}
              isAdmin={isAdminResolved || isAdmin}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/assets/promo/logo.png"
            alt={txa('BSG Manga')}
            className="h-8 w-auto"
            loading="eager"
            decoding="async"
          />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <GlobalSearchCommand variant="icon" />
          <AccountTopBarActions />
        </div>
        </>
        )}
      </div>

      {/* Etkinlik paneli - AppSidebar tarafindan TEK sahipli (cift-acilma onlenir) */}
      <Dialog open={eventPanelOpen} onOpenChange={setEventPanelOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-3.5">
            <DialogTitle>{txa('Etkinlik')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[76vh] px-4 py-4">
            <EventQuestsPanel
              currentUserId={currentUser?.id}
              onBalanceChange={(stones) => updateCurrentUser({ stones })}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AppSidebar
