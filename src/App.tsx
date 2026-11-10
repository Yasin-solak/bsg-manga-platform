import { DiagnosticsRuntime } from '@/components/common/DiagnosticsRuntime'
import { DesktopAppearanceProvider } from '@/contexts/DesktopAppearanceContext'
import { DiscordLinkReturn } from '@/components/common/DiscordLinkReturn'
import { Suspense, useEffect, useMemo } from 'react'
import { MotionConfig } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { LegacyAddressRedirect } from '@/i18n/router'
import { LOCALE_TAG, legacyPathnameRedirect, localeFromPathname, toCanonicalPathname } from '@/i18n/localizedRoutes'
import { Navigate } from '@/i18n/router'
import AppDocumentMeta from '@/components/common/AppDocumentMeta'
import { lazyRoute, preloadLazyRoutes } from '@/lib/lazyRoute'
import ClientAssetProtection from '@/components/security/ClientAssetProtection'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import { AuthProvider } from '@/contexts/AuthContext'
import { CommunityAvailabilityProvider, CommunityGate } from '@/contexts/CommunityAvailabilityContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { usePreventFileDropNavigation } from '@/hooks/usePreventFileDropNavigation'
import {
  EXPLORE_PATH,
  EXPLORE_ROUTE_SLUG,
  LEGACY_EXPLORE_ROUTE_SLUGS,
  LEGACY_ONBOARDING_PATH,
  ONBOARDING_PATH,
  ONBOARDING_ROUTE_SLUG,
} from '@/lib/routes'
import {
  COMMUNITY_RULES_PATH,
  CONTACT_PATH,
  COPYRIGHT_POLICY_PATH,
  DMCA_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
  FAQ_PATH,
  HELP_CENTER_PATH,
  KVKK_PATH,
  POLICY_HUB_PATH,
  PRIVACY_PATH,
  REFUND_POLICY_PATH,
  STORE_RULES_PATH,
  TERMS_PATH,
} from '@/lib/policyRoutes'
import ConfirmDialogHost from '@components/common/ConfirmDialog/ConfirmDialogHost'
import RequireAdminRoute from '@components/common/RequireAdminRoute'
import RequireFansubRoleRoute from '@components/common/RequireFansubRoleRoute'
import ToastContainer from '@components/common/Toast/ToastContainer'
import NameEffectStyles from '@components/common/NameEffectStyles'
import { txa } from '@/i18n/activeLocale'

const Layout = lazyRoute(() => import('@components/layout/Layout'))
const AnnouncementsPage = lazyRoute(() => import('@pages/AnnouncementsPage'))
const HomePage = lazyRoute(() => import('@pages/HomePage'))
const SettingsPage = lazyRoute(() => import('@pages/SettingsPage'))
const NotificationsPage = lazyRoute(() => import('@pages/NotificationsPage'))
const ExplorePage = lazyRoute(() => import('@pages/ExplorePage'))
const BirthDateGatePage = lazyRoute(() => import('@pages/BirthDateGatePage'))
const LibraryPage = lazyRoute(() => import('@pages/LibraryPage'))
const LuckyPickPage = lazyRoute(() => import('@pages/LuckyPickPage'))
const GamesPage = lazyRoute(() => import('@pages/GamesPage'))
const DailyCoverGamePage = lazyRoute(() => import('@pages/games/DailyCoverGamePage'))
const DailyPanelGamePage = lazyRoute(() => import('@pages/games/DailyPanelGamePage'))
const MurekRunPage = lazyRoute(() => import('@pages/games/MurekRunPage'))
const CoverMatchPage = lazyRoute(() => import('@pages/games/CoverMatchPage'))
const FansubsPage = lazyRoute(() => import('@pages/FansubsPage'))
const FansubDetailPage = lazyRoute(() => import('@pages/FansubDetailPage'))
const ProfilePage = lazyRoute(() => import('@pages/ProfilePage'))
const OnboardingPage = lazyRoute(() => import('@pages/OnboardingPage'))
const CommunityPage = lazyRoute(() => import('@pages/CommunityPage'))
const ReleaseSchedulePage = lazyRoute(() => import('@pages/ReleaseSchedulePage'))
const MangaListsPage = lazyRoute(() => import('@pages/MangaListsPage'))
const MangaListDetailPage = lazyRoute(() => import('@pages/MangaListDetailPage'))
const ShopPage = lazyRoute(() => import('@pages/ShopPage'))
const HoverThemeLabPage = lazyRoute(() => import('@pages/HoverThemeLabPage'))
const MangaDetailPage = lazyRoute(() => import('@pages/MangaDetailPage'))
const MangaReaderPage = lazyRoute(() => import('@pages/MangaReaderPage'))
const ReaderV2Page = lazyRoute(() => import('@/pages/reader/ReaderV2Page'))
const PolicyDocumentPage = lazyRoute(() => import('@pages/PolicyDocumentPage'))
const PolicyHubPage = lazyRoute(() => import('@pages/PolicyHubPage'))
const HelpCenterPage = lazyRoute(() => import('@pages/HelpCenterPage'))
const FaqPage = lazyRoute(() => import('@pages/FaqPage'))
const ContactPage = lazyRoute(() => import('@pages/ContactPage'))
const LegalRequestCenterPage = lazyRoute(() => import('@pages/LegalRequestCenterPage'))
const MangaAddPage = lazyRoute(() => import('@pages/MangaAddPage'))
const ChapterAddPage = lazyRoute(() => import('@pages/ChapterAddPage'))
const FansubYonetPage = lazyRoute(() => import('@pages/FansubYonetPage'))
const TranslationStudioPage = lazyRoute(() => import('@pages/translationStudio/TranslationStudioPage'))
const FansubTierPage = lazyRoute(() => import('@pages/FansubTierPage'))
const AdminPage = lazyRoute(() => import('@pages/AdminPage'))
const AuthPage = lazyRoute(() => import('@pages/AuthPage'))
const NotFoundPage = lazyRoute(() => import('@pages/NotFoundPage'))

const appRouteModules = [
  Layout,
  HomePage,
  ExplorePage,
  NotificationsPage,
  SettingsPage,
  BirthDateGatePage,
  LibraryPage,
  LuckyPickPage,
  GamesPage,
  DailyCoverGamePage,
  DailyPanelGamePage,
  MurekRunPage,
  CoverMatchPage,
  FansubsPage,
  FansubDetailPage,
  ProfilePage,
  OnboardingPage,
  CommunityPage,
  ReleaseSchedulePage,
  MangaListsPage,
  MangaListDetailPage,
  ShopPage,
  HoverThemeLabPage,
  MangaDetailPage,
  MangaReaderPage,
  PolicyDocumentPage,
  PolicyHubPage,
  HelpCenterPage,
  FaqPage,
  ContactPage,
  LegalRequestCenterPage,
  MangaAddPage,
  ChapterAddPage,
  FansubYonetPage,
  FansubTierPage,
  AdminPage,
  AuthPage,
  NotFoundPage,
] as const

export async function preloadAppRouteModules() {
  // During SSR and post-build prerender we resolve route modules first so Suspense fallback HTML
  // is not emitted; lazy chunk behavior is kept on the client.
  await preloadLazyRoutes(appRouteModules)
}

function RouteLoadingFallback() {
  return (
    <div className='flex min-h-[40vh] w-full items-center justify-center px-4 text-sm text-muted-foreground'>
      {txa('Sayfa yukleniyor...')}
    </div>
  )
}

function App() {
  // App-wide: an image file dropped outside a target should not navigate the
  // browser to that file and feel like a page reload.
  usePreventFileDropNavigation()

  // The real address is converted to the canonical path for the route tree;
  // the locale context converts links back.
  const location = useLocation()
  const locale = localeFromPathname(location.pathname)
  const routeLocation = useMemo(
    () => ({ ...location, pathname: toCanonicalPathname(location.pathname) }),
    [location],
  )
  useEffect(() => {
    document.documentElement.lang = LOCALE_TAG[locale]
  }, [locale])

  const legacyPathname = legacyPathnameRedirect(location.pathname)
  if (legacyPathname) return <LegacyAddressRedirect pathname={legacyPathname} />

  return (
    <LocaleProvider locale={locale}>
    <MotionConfig reducedMotion='user'>
    <ThemeProvider>
    <DesktopAppearanceProvider>
    <AuthProvider>
    <CommunityAvailabilityProvider>
    <DiagnosticsRuntime />
    <DiscordLinkReturn />
    <NotificationProvider>
      <AppDocumentMeta />
      <ClientAssetProtection />
      <TooltipProvider>
        <ToastContainer />
        <NameEffectStyles />
        <ConfirmDialogHost />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes location={routeLocation}>
            <Route path='/' element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path={EXPLORE_ROUTE_SLUG} element={<ExplorePage />} />
              <Route path='ayarlar' element={<SettingsPage />} />
              <Route path='bildirimler' element={<NotificationsPage />} />
              <Route path='bildirimler/ayarlar' element={<NotificationsPage />} />
              <Route path='dogum-tarihi' element={<BirthDateGatePage />} />
              <Route path='kutuphane' element={<LibraryPage />} />
              <Route path='sans' element={<LuckyPickPage />} />
              <Route path='oyunlar' element={<GamesPage />} />
              <Route path='oyunlar/gunun-kapagi' element={<DailyCoverGamePage />} />
              <Route path='oyunlar/panel-avi' element={<DailyPanelGamePage />} />
              <Route path='oyunlar/murek-kosusu' element={<MurekRunPage />} />
              <Route path='oyunlar/kapak-esle' element={<CoverMatchPage />} />
              {LEGACY_EXPLORE_ROUTE_SLUGS.map((legacySlug) => (
                <Route key={legacySlug} path={legacySlug} element={<Navigate to={EXPLORE_PATH} replace />} />
              ))}
              <Route path='fansublar' element={<FansubsPage />} />
              <Route path='fansub-tier' element={<FansubTierPage />} />
              <Route path='fansub/:id' element={<FansubDetailPage />} />
              <Route
                path='fansub/:id/yonet'
                element={(
                  <RequireFansubRoleRoute allowedRoles={['admin']} requiredPermission='panel.erisim'>
                    <FansubYonetPage />
                  </RequireFansubRoleRoute>
                )}
              />
              <Route
                path='fansub/:id/studyo/*'
                element={(
                  <RequireFansubRoleRoute allowedRoles={['admin']} requiredPermission='ceviri.gor'>
                    <TranslationStudioPage />
                  </RequireFansubRoleRoute>
                )}
              />
              <Route
                path='fansub/:id/manga/ekle'
                element={(
                  <RequireFansubRoleRoute allowedRoles={['admin']}>
                    <MangaAddPage />
                  </RequireFansubRoleRoute>
                )}
              />
              <Route
                path='fansub/:id/bolum/ekle'
                element={(
                  <RequireFansubRoleRoute allowedRoles={['admin']}>
                    <ChapterAddPage />
                  </RequireFansubRoleRoute>
                )}
              />
              <Route path='duyurular' element={<AnnouncementsPage />} />
              <Route path='duyurular/:id' element={<AnnouncementsPage />} />
              <Route path='topluluk' element={<CommunityGate><CommunityPage /></CommunityGate>} />
              <Route path='yayin-takvimi' element={<ReleaseSchedulePage />} />
              {/* Eski gonderi akisi kaldirildi; eski baglantilar yeni topluluga gider. */}
              <Route path='discussion/*' element={<Navigate to='/topluluk' replace />} />
              <Route path='listeler' element={<MangaListsPage />} />
              <Route path='listeler/:id' element={<MangaListDetailPage />} />
              {/* Magaza v3: vitrin, katalog, urun, sezon, premium; eski yollar ShopPage icinde yonlendirilir. */}
              <Route path='magaza/*' element={<ShopPage />} />
              {/* Neden RequireAdminRoute: test/lab sandbox sayfalari tasarim dogrulamasi
                  icindir; mock veri chunk'lariyla birlikte herkese acik kalmamali.
                  ?e2e=1 akisi bozulmaz cunku e2e mock kullanicisi admin roluyle gelir. */}
              <Route path='test' element={<Navigate to='/test/hover-temalari' replace />} />
              <Route path='test/hover-temalari' element={<RequireAdminRoute><HoverThemeLabPage /></RequireAdminRoute>} />
              <Route path='profil/:username' element={<ProfilePage />} />
              <Route path={ONBOARDING_ROUTE_SLUG} element={<OnboardingPage />} />
              <Route path={LEGACY_ONBOARDING_PATH.slice(1)} element={<Navigate to={ONBOARDING_PATH} replace />} />
              <Route path='manga/:id' element={<MangaDetailPage />} />
              <Route path='manga/:id/bolum/:chapterNumber' element={<MangaReaderPage />} />
              <Route path='manga/:id/bolum/:chapterNumber/:fansubKey' element={<MangaReaderPage />} />
              <Route path='manga/:id/chapter/:chapterNumber' element={<MangaReaderPage />} />
              {/* Okuyucu v2 (yeni): /oku altinda sifirdan kuruluyor. Ustteki
                  v1 rotalari dokunulmadan yedekte kalir; ikisi yan yana
                  karsilastirilabilsin diye ayni bolume ayni parametrelerle
                  ulasilir. Plan: docs/okuyucu-v2-gelistirme-plani-2026-07-29.md */}
              <Route path='oku/:mangaKey/:chapterNumber' element={<ReaderV2Page />} />
              <Route path='oku/:mangaKey/:chapterNumber/:fansubKey' element={<ReaderV2Page />} />
              <Route path={POLICY_HUB_PATH.slice(1)} element={<PolicyHubPage />} />
              <Route path={HELP_CENTER_PATH.slice(1)} element={<HelpCenterPage />} />
              <Route path={FAQ_PATH.slice(1)} element={<FaqPage />} />
              <Route path={CONTACT_PATH.slice(1)} element={<ContactPage />} />
              <Route path={TERMS_PATH.slice(1)} element={<PolicyDocumentPage documentKey='terms' />} />
              <Route path={PRIVACY_PATH.slice(1)} element={<PolicyDocumentPage documentKey='privacy' />} />
              <Route path={KVKK_PATH.slice(1)} element={<PolicyDocumentPage documentKey='kvkk' />} />
              <Route path={COMMUNITY_RULES_PATH.slice(1)} element={<PolicyDocumentPage documentKey='community-rules' />} />
              <Route path={FANSUB_RULES_PATH.slice(1)} element={<PolicyDocumentPage documentKey='fansub-rules' />} />
              <Route path={STORE_RULES_PATH.slice(1)} element={<PolicyDocumentPage documentKey='store-rules' />} />
              <Route path={REFUND_POLICY_PATH.slice(1)} element={<PolicyDocumentPage documentKey='refund' />} />
              <Route path={ENFORCEMENT_POLICY_PATH.slice(1)} element={<PolicyDocumentPage documentKey='enforcement' />} />
              <Route path={COPYRIGHT_POLICY_PATH.slice(1)} element={<LegalRequestCenterPage defaultType='copyright' />} />
              <Route path={DMCA_PATH.slice(1)} element={<LegalRequestCenterPage defaultType='dmca' />} />
              <Route
                path='admin/*'
                element={(
                  <RequireAdminRoute>
                    <AdminPage />
                  </RequireAdminRoute>
                )}
              />
              <Route path='giris' element={<AuthPage />} />
              <Route path='404' element={<NotFoundPage />} />
              <Route path='*' element={<Navigate to='/404' replace />} />
            </Route>
          </Routes>
        </Suspense>
      </TooltipProvider>
    </NotificationProvider>
    </CommunityAvailabilityProvider>
    </AuthProvider>
    </DesktopAppearanceProvider>
    </ThemeProvider>
    </MotionConfig>
    </LocaleProvider>
  )
}

export default App
