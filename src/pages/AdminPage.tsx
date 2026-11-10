import { Suspense, lazy, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import { AdminPageShell } from '@/components/admin/shared/AdminPageShell'
import { AdminSidebarNav } from '@/components/admin/shared/AdminSidebarNav'
import { AdminSectionSkeleton } from '@/components/admin/shared/AdminSectionSkeleton'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { AdminCommunitySection } from '@/components/admin/sections/AdminCommunitySection'
import { AdminCommentModerationSection } from '@/components/admin/sections/AdminCommentModerationSection'
import { AdminLegalRequestsSection } from '@/components/admin/sections/AdminLegalRequestsSection'
import { AdminReportsSection } from '@/components/admin/sections/AdminReportsSection'
import { AnnouncementManager } from '@/components/admin/announcements/AnnouncementManager'
import { AdminSettingsSection } from '@/components/admin/sections/AdminSettingsSection'
import { buildAdminNavItems } from './admin/adminNavigation'
import type { AdminSection } from './admin/adminPageUtils'
import { ADMIN_DEFAULT_SECTION, isKnownAdminPath, sectionFromAdminPath, sectionToAdminPath } from './admin/adminRoutes'
import { useAdminDashboardSnapshot } from './admin/useAdminDashboardSnapshot'
import { useAdminPageState } from './admin/useAdminPageState'
import { usePendingSeriesDraftCount } from '@/hooks/usePendingSeriesDraftCount'
import { useOpenSupportRequestCount } from '@/hooks/useOpenSupportRequestCount'
import { useOpenCommunityReportCount } from '@/hooks/useOpenCommunityReportCount'
import { SHOP_DESK_TABS, type ShopAdminTab } from '@components/admin/shop/shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

const AdminSupportSection = lazy(() => import('@/components/admin/sections/AdminSupportSection'))
const AdminDiagnosticsSection = lazy(() => import('@/components/admin/sections/AdminDiagnosticsSection'))
const AdminDashboardSection = lazy(() => import('@components/admin/AdminDashboardSection'))
const AdminPendingSection = lazy(() => import('@components/admin/AdminPendingSection'))
const AdminUsersSection = lazy(() => import('@components/admin/AdminUsersSection'))
const MangaManagementSection = lazy(() => import('@components/admin/MangaManagementSection'))
const AdminMangaListsSection = lazy(() => import('@components/admin/AdminMangaListsSection'))
const AdminSeriesRequestsSection = lazy(() => import('@components/admin/AdminSeriesRequestsSection'))
const AdminTranslationStudioSection = lazy(() => import('@components/admin/AdminTranslationStudioSection'))
const AdminShopSection = lazy(() => import('@components/admin/shop/AdminShopSection'))
const CoinCodeManagementSection = lazy(() => import('@components/admin/CoinCodeManagementSection'))
const AdminRewardsSection = lazy(() => import('@components/admin/AdminRewardsSection'))
const AdminGamesSection = lazy(() => import('@components/admin/games/AdminGamesSection'))
const AdminTextTranslationsSection = lazy(() => import('@components/admin/sections/AdminTextTranslationsSection'))
const FansubManagementSection = lazy(() => import('@components/admin/FansubManagementSection'))
const AdminOpsSection = lazy(() => import('@components/admin/AdminOpsSection'))
const AdminBoostSection = lazy(() => import('@/components/admin/sections/AdminBoostSection'))
const AdminSupporterAssetsSection = lazy(() => import('@/components/admin/sections/AdminSupporterAssetsSection'))

/** Sections with a list + detail desk: fixed to screen height at xl and up. */
const DESK_SECTIONS: ReadonlySet<AdminSection> = new Set<AdminSection>(['pending', 'community', 'comments', 'lists', 'announcements', 'mangas', 'fansubs', 'users', 'coin_codes', 'support', 'legal_requests', 'diagnostics'])

function AdminSectionLoadingCard({ variant = 'cards' }: { variant?: 'cards' | 'table' | 'dashboard' }) {
  return <AdminSectionSkeleton variant={variant} />
}

function AdminPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const routeSection = useMemo(
    () => sectionFromAdminPath(location.pathname),
    [location.pathname],
  )

  const {
    currentUser,
    activeSection,
    loading,
    isOperationsCenterEnabled,
    featureFlagsResolved,
    isReportsFeatureEnabled,
    stats,
    pendingItems,
    announcements,
    settings,
    lastUpdatedAt,
    reports,
    legalRequests,
    reportStatusFilter,
    reportStats,
    setReportStatusFilter,
    setSettings,
    handleApprove,
    handleReject,
    handleSaveSettings,
    refreshReports,
    refreshLegalRequests,
    handleUpdateLegalRequest,
  } = useAdminPageState({ requestedSection: routeSection })

  const dashboardSnapshot = useAdminDashboardSnapshot(activeSection === 'dashboard')
  const seriesRequestCount = usePendingSeriesDraftCount(activeSection)
  const supportOpenCount = useOpenSupportRequestCount(activeSection)
  const [communityOpenReports, setCommunityOpenReports] = useOpenCommunityReportCount(activeSection)

  const navItems = buildAdminNavItems({
    isReportsFeatureEnabled,
    isOperationsCenterEnabled,
    pendingCount: pendingItems.length,
    seriesRequestPendingCount: seriesRequestCount,
    communityOpenReportCount: communityOpenReports,
    legalRequestPendingCount: legalRequests.filter((request) => request.status === 'new').length,
    reportPendingCount: reportStats.pending,
    supportOpenCount,
  })
  const activeNavItem = navItems.find((item) => item.id === activeSection)

  const navigateToSection = (section: AdminSection, replace = false) => {
    const targetPath = sectionToAdminPath(section)
    if (location.pathname === targetPath) return
    navigate(targetPath, { replace })
  }

  const handleSectionSelect = (section: AdminSection) => {
    if (section === 'operations' && !isOperationsCenterEnabled) {
      showInactiveFeatureToast(txa('Operasyon merkezi'))
      navigateToSection(ADMIN_DEFAULT_SECTION, true)
      return
    }
    if (section === 'reports' && !isReportsFeatureEnabled) {
      showInactiveFeatureToast(txa('Rapor yonetimi'))
      navigateToSection(ADMIN_DEFAULT_SECTION, true)
      return
    }
    navigateToSection(section)
  }

  useEffect(() => {
    if (isKnownAdminPath(location.pathname)) return
    navigate(sectionToAdminPath(ADMIN_DEFAULT_SECTION), { replace: true })
  }, [location.pathname, navigate])

  /*
   * No redirect BEFORE the flag RESOLVES.
   *
   * Since the flag starts `false` and loads asynchronously, an admin coming directly to
   * `/admin/operasyon` was sent to the dashboard on every cold start,
   * and also saw an "inactive" notice. The section worked; its address
   * just could not be reached.
   */
  useEffect(() => {
    if (!featureFlagsResolved) return
    if (routeSection === 'operations' && !isOperationsCenterEnabled) {
      showInactiveFeatureToast(txa('Operasyon merkezi'))
      navigate(sectionToAdminPath(ADMIN_DEFAULT_SECTION), { replace: true })
      return
    }
    if (routeSection === 'reports' && !isReportsFeatureEnabled) {
      showInactiveFeatureToast(txa('Rapor yonetimi'))
      navigate(sectionToAdminPath(ADMIN_DEFAULT_SECTION), { replace: true })
    }
  }, [featureFlagsResolved, routeSection, isOperationsCenterEnabled, isReportsFeatureEnabled, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
        <p className="py-16 text-center text-foreground">{txa('Yukleniyor...')}</p>
      </div>
    )
  }

  // Desk-layout sections (list + details) are fixed to screen height; see AdminPageShell fill.
  // In Shop only desk tabs (Products, Bundles, Orders) are fixed to the screen.
  const shopTab = new URLSearchParams(location.search).get('sekme')
  const fillDesk = DESK_SECTIONS.has(activeSection)
    || (activeSection === 'store' && SHOP_DESK_TABS.includes(shopTab as ShopAdminTab))

  return (
    <AdminPageShell
      fill={fillDesk}
      mobileTitle={activeNavItem?.label}
      sidebar={(
        <AdminSidebarNav
          items={navItems}
          activeItemId={activeSection}
          onSelect={handleSectionSelect}
          identity={{
            username: currentUser?.username || 'yonetici',
            avatarUrl: currentUser?.avatar || null,
            roleLabel: currentUser?.role === 'moderator' ? txa('Moderatör') : txa('Site yöneticisi'),
          }}
        />
      )}
    >
      <main className={fillDesk ? 'min-w-0 space-y-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col' : 'min-w-0 space-y-4'}>
        {activeSection === 'support' && <Suspense fallback={<AdminSectionLoadingCard />}><AdminSupportSection /></Suspense>}
        {activeSection === 'diagnostics' && <Suspense fallback={<AdminSectionLoadingCard />}><AdminDiagnosticsSection /></Suspense>}
        {activeSection === 'dashboard' && stats && (
          <Suspense fallback={<AdminSectionLoadingCard variant="dashboard" />}>
            <AdminDashboardSection
              snapshot={dashboardSnapshot.snapshot}
              isLoading={dashboardSnapshot.isLoading}
              isRefreshing={dashboardSnapshot.isRefreshing}
              error={dashboardSnapshot.error}
              period={dashboardSnapshot.period}
              stats={stats}
              pendingItems={pendingItems}
              lastUpdatedAt={lastUpdatedAt}
              reportStats={reportStats}
              reports={reports}
              legalRequests={legalRequests}
              isReportsEnabled={isReportsFeatureEnabled}
              announcements={announcements}
              onNavigate={handleSectionSelect}
              onPeriodChange={dashboardSnapshot.onPeriodChange}
              onRefresh={dashboardSnapshot.onRefresh}
            />
          </Suspense>
        )}

        {activeSection === 'boost' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="dashboard" />}>
            <AdminBoostSection />
          </Suspense>
        )}

        {activeSection === 'supporter_assets' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="dashboard" />}>
            <AdminSupporterAssetsSection />
          </Suspense>
        )}

        {activeSection === 'pending' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="cards" />}>
            <AdminPendingSection
              items={pendingItems}
              onApprove={handleApprove}
              onReject={handleReject}
              toolbarExtra={seriesRequestCount > 0 ? (
                // Ceviri Studyosu seri talepleri ayri kuyrukta; burada gozden kacmasin.
                <button
                  type="button"
                  onClick={() => navigateToSection('series_requests')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-primary/15"
                  data-testid="admin-pending-series-requests"
                >
                  {txa('Seri talepleri')}
                  <span className="rounded-full bg-primary/20 px-1.5 text-[11px] tabular-nums">{seriesRequestCount}</span>
                  <span className="text-primary">→</span>
                </button>
              ) : null}
            />
          </Suspense>
        )}

        {activeSection === 'community' && (
          <AdminCommunitySection
            flagsHref={isOperationsCenterEnabled ? `${sectionToAdminPath('operations')}#feature-flags` : null}
            onOpenReportsChange={setCommunityOpenReports}
          />
        )}

        {activeSection === 'comments' && (
          <AdminCommentModerationSection />
        )}

        {activeSection === 'legal_requests' && (
          <AdminLegalRequestsSection
            legalRequests={legalRequests}
            onRefreshLegalRequests={refreshLegalRequests}
            onUpdateLegalRequest={handleUpdateLegalRequest}
          />
        )}

        {activeSection === 'reports' && isReportsFeatureEnabled && (
          <AdminReportsSection
            reportStatusFilter={reportStatusFilter}
            onReportStatusFilterChange={setReportStatusFilter}
            reportStats={reportStats}
            reports={reports}
            onRefreshReports={refreshReports}
          />
        )}

        {activeSection === 'announcements' && (
          <AnnouncementManager />
        )}

        {activeSection === 'users' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminUsersSection currentUserId={currentUser?.id} />
          </Suspense>
        )}

        {activeSection === 'mangas' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="cards" />}>
            <MangaManagementSection />
          </Suspense>
        )}

        {activeSection === 'lists' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminMangaListsSection />
          </Suspense>
        )}

        {activeSection === 'series_requests' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminSeriesRequestsSection />
          </Suspense>
        )}

        {activeSection === 'translation_studio' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminTranslationStudioSection />
          </Suspense>
        )}

        {activeSection === 'store' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminShopSection />
          </Suspense>
        )}


        {activeSection === 'coin_codes' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <CoinCodeManagementSection />
          </Suspense>
        )}

        {activeSection === 'rewards' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="cards" />}>
            <AdminRewardsSection />
          </Suspense>
        )}

        {activeSection === 'text_translations' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="cards" />}>
            <AdminTextTranslationsSection />
          </Suspense>
        )}

        {activeSection === 'games' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="dashboard" />}>
            <AdminGamesSection />
          </Suspense>
        )}

        {activeSection === 'fansubs' && (
          <Suspense fallback={<AdminSectionLoadingCard variant="cards" />}>
            <FansubManagementSection />
          </Suspense>
        )}

        {activeSection === 'operations' && isOperationsCenterEnabled && (
          <Suspense fallback={<AdminSectionLoadingCard variant="table" />}>
            <AdminOpsSection />
          </Suspense>
        )}

        {activeSection === 'settings' && settings && (
          <AdminSettingsSection
            settings={settings}
            setSettings={setSettings}
            onSave={handleSaveSettings}
          />
        )}

      </main>
    </AdminPageShell>
  )
}

export default AdminPage
