/**
 * FansubYonetPage: Fansub Studio orchestrator.
 *
 * Keeps existing management modules, but no longer behaves as a tab page inside the
 * general site chrome: it runs within its own studio shell and sidebar information
 * architecture.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Link, useNavigate } from '@/i18n/router'
import { Button } from '@/components/ui/button'
import { FansubMembershipPanel } from '@/components/fansub/FansubMembershipPanel'
import { FansubRolesPanel } from '@/components/fansub/FansubRolesPanel'
import FansubManageMangaSection from '@/components/fansub/FansubManageMangaSection'
import FansubYonetTasksTab from '@/pages/fansubYonet/FansubYonetTasksTab'
import MangaCreateDialog from '@/components/fansub/mangaCreate/MangaCreateDialog'
import ChapterCreateDialog from '@/components/fansub/chapterCreate/ChapterCreateDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useFansubPermissions } from '@/hooks/useFansubPermissions'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import {
  getFansubManageAnalyticsSummary,
  getFansubManageCommunityV2,
  type FansubCommunityV2Summary,
  type FansubManageAnalyticsSummary,
} from '@/services/fansubManageService'
import { resolveVisibleFansubNameStyle } from '@/lib/fansubBoostCapabilityGovernance'
import { getMyFansubRole, listFansubJoinRequestsForManagement } from '@/services/fansubMembershipService'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { getPublicFansubBoostSnapshot, type FansubBoostSnapshot } from '@/services/fansubBoostService'
import { getFansubById, getFansubCoinBalance } from '@/services/fansubService'
import type { Fansub } from '@/types'
import FansubYonetChapterCreditTab from './fansubYonet/FansubYonetChapterCreditTab'
import FansubYonetChaptersTab from './fansubYonet/FansubYonetChaptersTab'
import FansubReportedContentPanel from './fansubYonet/FansubReportedContentPanel'
import FansubYonetHeader from './fansubYonet/FansubYonetHeader'
import FansubYonetNoticesTab from './fansubYonet/FansubYonetNoticesTab'
import FansubYonetOverviewTab from './fansubYonet/FansubYonetOverviewTab'
import FansubYonetCommunityTab from './fansubYonet/FansubYonetCommunityTab'
import FansubYonetSupporterAssetsTab from './fansubYonet/FansubYonetSupporterAssetsTab'
import FansubYonetStatsTab from './fansubYonet/FansubYonetStatsTab'
import FansubYonetKasaTab from './fansubYonet/FansubYonetKasaTab'
import FansubYonetBoostTab from './fansubYonet/FansubYonetBoostTab'
import { FansubStudioShell } from './fansubYonet/FansubStudioShell'
import { FansubStudioSidebarNav } from './fansubYonet/FansubStudioSidebarNav'
import { canOpenFansubTab, findFansubStudioNavItem } from './fansubYonet/fansubStudioNavigation'
import {
  FANSUB_YONET_DEFAULT_TAB,
  normalizeFansubYonetTab,
  toErrorText,
  type FansubRole,
  type FansubYonetTab,
} from './fansubYonet/useFansubYonetState'
import { txa } from '@/i18n/activeLocale'

/** Takviye cercevesi stilini avatar halkasi rengine cevirir. */
const BOOST_FRAME_RING: Record<string, string> = {
  gold: 'ring-amber-400/80',
  rose: 'ring-rose-400/80',
  violet: 'ring-violet-400/80',
  sapphire: 'ring-sky-400/80',
  emerald: 'ring-emerald-400/80',
}

function GuardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * KeepAliveTab: mounts a content tab on first visit and afterward keeps it alive by
 * hiding with CSS. So returning to a tab does not refetch data or cause a
 * "loading" jump; state and list are kept.
 *
 * Used only for data-heavy list tabs (manga, chapters, community);
 * heavy/rare tabs keep mounting on demand.
 */
function KeepAliveTab({ active, children }: { active: boolean; children: ReactNode }) {
  const [hasMounted, setHasMounted] = useState(active)

  useEffect(() => {
    if (active && !hasMounted) setHasMounted(true)
  }, [active, hasMounted])

  if (!hasMounted) return null

  return (
    <div hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  )
}

function FansubYonetPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const { isAdminResolved, resolvingAdminAccess } = useResolvedAdminAccess(currentUser)

  const [fansub, setFansub] = useState<Fansub | null>(null)
  const [myRole, setMyRole] = useState<FansubRole>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FansubYonetTab>(() => normalizeFansubYonetTab(location.hash.replace(/^#/, '')))
  const [isBoostEnabled, setIsBoostEnabled] = useState(false)
  const [isTranslationStudioEnabled, setIsTranslationStudioEnabled] = useState(false)
  const [isBoostManageTabEnabled, setIsBoostManageTabEnabled] = useState(false)
  const [boostSnapshot, setBoostSnapshot] = useState<FansubBoostSnapshot | null>(null)
  const [studioSummary, setStudioSummary] = useState<FansubManageAnalyticsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [pendingJoinRequests, setPendingJoinRequests] = useState(0)
  // Community v2 server summary: Server tab, overview and sidebar badge.
  const [community, setCommunity] = useState<FansubCommunityV2Summary | null>(null)
  const [communityError, setCommunityError] = useState<string | null>(null)
  // Fansub vault balance: synced when the fansub loads, updated live on quest claim.
  const [fansubCoinBalance, setFansubCoinBalance] = useState(0)
  // In-studio add modals: work without a separate route or remount.
  const [activeCreateDialog, setActiveCreateDialog] = useState<'manga' | 'chapter' | null>(null)
  const [chapterDefaultMangaId, setChapterDefaultMangaId] = useState<string | undefined>(undefined)
  // The nonce is used as a key to mount the form from scratch (remount) when reopening the same modal.
  const [createDialogNonce, setCreateDialogNonce] = useState(0)
  // List refresh trigger: refreshes the related tab's data in place after adding.
  const [contentReloadToken, setContentReloadToken] = useState(0)

  // The vault balance is not in the public fansub record; the studio reads it separately.
  const refreshCoinBalance = useCallback(async () => {
    if (!id) return
    try {
      setFansubCoinBalance(await getFansubCoinBalance(id))
    } catch {
      // Bakiye okunamazsa son bilinen deger kalir; kasa sekmesi kendi hatasini gosterir.
    }
  }, [id])

  useEffect(() => {
    if (fansub) void refreshCoinBalance()
  }, [fansub, refreshCoinBalance])

  const isSiteAdmin = currentUser?.role === 'admin' || isAdminResolved
  // Panel access and tabs come from fansub permissions (Roles and Permissions tab).
  const { permissions, loading: permissionsLoading, reload: reloadPermissions } = useFansubPermissions(id, Boolean(currentUserId))
  const canManageContent = isSiteAdmin || permissions.has('panel.erisim')
  // Roller sekmesi: fansub admini ya da "Rolleri yonet" izni (sira kurali DB'de).
  const canManageRoles = isSiteAdmin || myRole === 'admin' || (permissions.has('panel.erisim') && permissions.has('ekip.roller'))
  const canCreateContent = isSiteAdmin || myRole === 'admin'
  const shouldShowBoostManageTab = isBoostEnabled && isBoostManageTabEnabled
  const canViewCommunity = isSiteAdmin || (permissions.has('panel.erisim') && permissions.has('panel.topluluk'))

  // Panel shortcuts point only to tabs that can open.
  const canOpenTab = useCallback((tab: FansubYonetTab) => {
    if (tab === 'takviye' && !shouldShowBoostManageTab) return false
    return isSiteAdmin || canOpenFansubTab(tab, permissions, canManageRoles)
  }, [canManageRoles, isSiteAdmin, permissions, shouldShowBoostManageTab])

  useEffect(() => {
    const nextTab = normalizeFansubYonetTab(location.hash.replace(/^#/, ''))
    setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab))
  }, [location.hash])

  const syncTabHash = useCallback((tab: FansubYonetTab, replace = false) => {
    const nextHash = tab === FANSUB_YONET_DEFAULT_TAB ? '' : `#${tab}`
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: nextHash,
      },
      { replace },
    )
  }, [location.pathname, location.search, navigate])

  const handleTabChange = useCallback((tab: FansubYonetTab) => {
    setActiveTab(tab)
    syncTabHash(tab)
  }, [syncTabHash])

  const openMangaCreate = useCallback(() => {
    setCreateDialogNonce((n) => n + 1)
    setActiveCreateDialog('manga')
  }, [])

  const openChapterCreate = useCallback((mangaId?: string) => {
    setChapterDefaultMangaId(mangaId)
    setCreateDialogNonce((n) => n + 1)
    setActiveCreateDialog('chapter')
  }, [])

  const handleCreateDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setActiveCreateDialog(null)
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadBase() {
      if (!id) return

      try {
        setLoading(true)
        setLoadError(null)

        const [fansubData, role] = await Promise.all([
          getFansubById(id),
          currentUserId ? getMyFansubRole(id, currentUserId) : Promise.resolve(null),
        ])

        if (!mounted) return
        setFansub(fansubData)
        setMyRole(role)
      } catch (error) {
        console.error('[FansubYonetPage] loadBase error', error)
        if (!mounted) return
        setLoadError(toErrorText(error, txa('Fansub studio yuklenemedi.')))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadBase()
    return () => { mounted = false }
  }, [id, currentUserId])

  // Cockpit summary: pending approvals, momentum, recent activity and join
  // applications come from one RPC + one list call, feeding both Overview and
  // sidebar attention badges.
  const loadStudioSummary = useCallback(async () => {
    if (!id || !canManageContent) return

    setSummaryLoading(true)
    setSummaryError(null)

    try {
      const [summary, joinRequests] = await Promise.all([
        getFansubManageAnalyticsSummary(id),
        listFansubJoinRequestsForManagement(id, 'pending').catch(() => []),
      ])

      setStudioSummary(summary)
      setPendingJoinRequests(Array.isArray(joinRequests) ? joinRequests.length : 0)
    } catch (error) {
      console.error('[FansubYonetPage] loadStudioSummary error', error)
      setSummaryError(toErrorText(error, txa('Kokpit verisi yuklenemedi.')))
    } finally {
      setSummaryLoading(false)
    }
  }, [canManageContent, id])

  useEffect(() => {
    void loadStudioSummary()
  }, [loadStudioSummary])

  const loadCommunity = useCallback(async () => {
    if (!id || !canViewCommunity) return
    try {
      setCommunity(await getFansubManageCommunityV2(id))
      setCommunityError(null)
    } catch (error) {
      setCommunityError(toErrorText(error, txa('Sunucu özeti yüklenemedi.')))
    }
  }, [canViewCommunity, id])

  useEffect(() => {
    void loadCommunity()
  }, [loadCommunity])

  // After adding: refresh the related tab's data, update the cockpit summary and
  // bring the user to the tab showing the new content. The page does not remount.
  const handleMangaCreated = useCallback(() => {
    setContentReloadToken((t) => t + 1)
    void loadStudioSummary()
    handleTabChange('mangalar')
  }, [loadStudioSummary, handleTabChange])

  const handleChapterCreated = useCallback(() => {
    setContentReloadToken((t) => t + 1)
    void loadStudioSummary()
    handleTabChange('bolumler')
  }, [loadStudioSummary, handleTabChange])

  useEffect(() => {
    let mounted = true

    async function loadBoostSnapshot(forceRefresh = false) {
      if (!id || !canManageContent) return

      try {
        const flags = await getRuntimeFeatureFlags(['boost.system', 'boost.fansub_manage_tab', 'translation.studio_v3'], false, forceRefresh)
        const boostEnabled = flags['boost.system'] === true
        const boostManageTabEnabled = flags['boost.fansub_manage_tab'] === true

        if (!mounted) return
        setIsTranslationStudioEnabled(flags['translation.studio_v3'] === true)
        setIsBoostEnabled(boostEnabled)
        setIsBoostManageTabEnabled(boostManageTabEnabled)

        if (!boostEnabled) {
          setBoostSnapshot(null)
          return
        }

        const snapshot = await getPublicFansubBoostSnapshot(id)
        if (!mounted) return
        setBoostSnapshot(snapshot)
      } catch (error) {
        console.error('[FansubYonetPage] loadBoostSnapshot error', error)
        if (!mounted) return
        setBoostSnapshot(null)
      }
    }

    if (!canManageContent) {
      setIsBoostEnabled(false)
      setIsBoostManageTabEnabled(false)
      setBoostSnapshot(null)
      return () => { mounted = false }
    }

    void loadBoostSnapshot()
    const unsubscribe = listenFeatureFlagUpdates((payload) => {
      if (payload.key !== 'boost.system' && payload.key !== 'boost.fansub_manage_tab') return
      void loadBoostSnapshot(true)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [canManageContent, id])

  // Arriving at a tab without permission (by hash) returns to the overview.
  useEffect(() => {
    if (permissionsLoading || !canManageContent) return
    if (isSiteAdmin || canOpenFansubTab(activeTab, permissions, canManageRoles)) return
    setActiveTab(FANSUB_YONET_DEFAULT_TAB)
    syncTabHash(FANSUB_YONET_DEFAULT_TAB, true)
  }, [activeTab, canManageContent, canManageRoles, isSiteAdmin, permissions, permissionsLoading, syncTabHash])

  useEffect(() => {
    if (activeTab !== 'takviye' || shouldShowBoostManageTab) return
    setActiveTab(FANSUB_YONET_DEFAULT_TAB)
    syncTabHash(FANSUB_YONET_DEFAULT_TAB, true)
  }, [activeTab, shouldShowBoostManageTab, syncTabHash])

  if (loading || resolvingAdminAccess || permissionsLoading) {
    return (
      <GuardShell>
        <p>{txa('Fansub studio yukleniyor...')}</p>
      </GuardShell>
    )
  }

  if (!id || loadError || !fansub) {
    return (
      <GuardShell>
        <h1 className="mb-2 text-2xl font-heading text-foreground">{txa('Fansub bulunamadi')}</h1>
        <p className="mb-4 text-muted-foreground">{loadError || txa('Studio acilamadi.')}</p>
        <Button asChild variant="default">
          <Link to="/fansublar">{txa('Fansublara don')}</Link>
        </Button>
      </GuardShell>
    )
  }

  if (!currentUserId) {
    return (
      <GuardShell>
        <h1 className="mb-2 text-2xl font-heading text-foreground">{txa('Giris gerekli')}</h1>
        <p className="mb-4 text-muted-foreground">{txa('Bu alani kullanmak icin once giris yapmalisiniz.')}</p>
        <Button asChild variant="default">
          <Link to="/giris">{txa('Giris yap')}</Link>
        </Button>
      </GuardShell>
    )
  }

  if (!canManageContent) {
    return (
      <GuardShell>
        <h1 className="mb-2 text-2xl font-heading text-foreground">{txa('Yetki hatasi')}</h1>
        <p className="mb-4 text-muted-foreground">{txa('Bu fansubun yonetim paneline erisim iznin yok. Fansub admini sana panel izni olan bir rol verebilir.')}</p>
        <Button asChild variant="default">
          <Link to={`/fansub/${encodeURIComponent(fansub.slug || id)}`}>{txa('Fansub detayina don')}</Link>
        </Button>
      </GuardShell>
    )
  }

  const hasBoostFrame = boostSnapshot?.capabilities?.hasGoldFrame === true || fansub.hasGoldFrame === true
  const avatarRingClass = hasBoostFrame ? (BOOST_FRAME_RING[fansub.boostFrameStyle || 'gold'] || BOOST_FRAME_RING.gold) : 'ring-border/70'
  const tierLabel = isBoostEnabled && boostSnapshot
    ? boostSnapshot.capabilities?.tierLabel || (boostSnapshot.tierLevel ? `Seviye ${boostSnapshot.tierLevel}` : null)
    : null
  const visibleNameStyle = resolveVisibleFansubNameStyle(fansub.activeNameStyle as Record<string, unknown> | undefined, boostSnapshot?.capabilities)
  const pendingCommunity = (community?.stats.pendingJoinRequests ?? 0) + (community?.stats.openReports ?? 0)

  return (
    <FansubStudioShell
      mobileTitle={fansub.name}
      sidebar={(
        <FansubStudioSidebarNav
          fansubId={id}
          fansubSlug={fansub.slug}
          fansubName={fansub.name}
          fansub={fansub}
          myRole={myRole}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          coinBalance={fansubCoinBalance}
          pendingChapters={studioSummary?.statuses.chapters.pending ?? 0}
          pendingCommunity={pendingCommunity}
          pendingJoinRequests={pendingJoinRequests}
          showBoostManageTab={shouldShowBoostManageTab}
          tierLabel={tierLabel}
          visibleNameStyle={visibleNameStyle ?? null}
          avatarRingClass={avatarRingClass}
          communityServerId={community?.enabled ? community.server?.id ?? null : null}
          showTranslationStudio={isSiteAdmin || (isTranslationStudioEnabled && permissions.has('ceviri.gor'))}
          permissions={isSiteAdmin ? undefined : permissions}
          showRolesTab={canManageRoles}
        />
      )}
    >
      <div className="flex flex-col gap-5">
        <FansubYonetHeader
          item={findFansubStudioNavItem(activeTab)}
          greetingName={currentUser?.username}
          canCreateContent={canCreateContent}
          canWriteNotice={canOpenTab('duyurular')}
          onCreateManga={openMangaCreate}
          onCreateChapter={() => openChapterCreate()}
          onWriteNotice={() => handleTabChange('duyurular')}
        />

        {activeTab === 'genel' && (
          <FansubYonetOverviewTab
            fansub={fansub}
            fansubId={id}
            isBoostEnabled={isBoostEnabled}
            boostSnapshot={boostSnapshot}
            summary={studioSummary}
            summaryLoading={summaryLoading}
            summaryError={summaryError}
            community={community}
            canCreateContent={canCreateContent}
            canOpenTab={canOpenTab}
            reloadToken={contentReloadToken}
            onReloadSummary={() => { void loadStudioSummary() }}
            onNavigateTab={handleTabChange}
            onCreateManga={openMangaCreate}
            onCreateChapter={() => openChapterCreate()}
          />
        )}

        {activeTab === 'takviye' && shouldShowBoostManageTab && (
          <FansubYonetBoostTab
            fansub={fansub}
            fansubId={id}
            isBoostEnabled={isBoostEnabled}
            boostSnapshot={boostSnapshot}
            canCreateContent={canCreateContent}
            onTabChange={handleTabChange}
          />
        )}

        {activeTab === 'uyelik' && (
          <FansubMembershipPanel
            fansubId={id}
            currentUserId={currentUserId}
            isSiteAdmin={isSiteAdmin}
            onDataChanged={() => { void loadStudioSummary() }}
          />
        )}

        {activeTab === 'roller' && canManageRoles && (
          <FansubRolesPanel fansubId={id} onChanged={reloadPermissions} />
        )}

        {activeTab === 'ifadeler' && (
          <FansubYonetSupporterAssetsTab
            fansubId={id}
            boostSnapshot={boostSnapshot}
          />
        )}

        <KeepAliveTab active={activeTab === 'mangalar'}>
          <FansubManageMangaSection
            fansubId={id}
            isActive={activeTab === 'mangalar'}
            reloadToken={contentReloadToken}
            onCreateManga={canCreateContent ? openMangaCreate : undefined}
          />
        </KeepAliveTab>

        <KeepAliveTab active={activeTab === 'bolumler'}>
          <div className="flex flex-col gap-4">
            <FansubReportedContentPanel fansubId={id} canFix={canCreateContent} reloadToken={contentReloadToken} />
            <FansubYonetChaptersTab
              fansubId={id}
              reloadToken={contentReloadToken}
              onCreateChapter={() => openChapterCreate()}
            />
          </div>
        </KeepAliveTab>

        <KeepAliveTab active={activeTab === 'topluluk'}>
          <FansubYonetCommunityTab
            fansubId={id}
            community={community}
            communityError={communityError}
            onReload={loadCommunity}
          />
        </KeepAliveTab>

        {activeTab === 'duyurular' && (
          <FansubYonetNoticesTab
            fansubId={id}
            fansubSlug={fansub.slug}
            fansubName={fansub.name}
            isBoostEnabled={isBoostEnabled}
            boostSnapshot={boostSnapshot}
          />
        )}

        {activeTab === 'gorevler' && (
          <FansubYonetTasksTab
            fansubId={id}
            onBalanceChange={setFansubCoinBalance}
            onOpenTab={handleTabChange}
          />
        )}

        {activeTab === 'istatistikler' && (
          <FansubYonetStatsTab
            fansubId={id}
            fansubName={fansub.name}
            boostSnapshot={boostSnapshot}
          />
        )}

        {activeTab === 'kasa' && (
          <FansubYonetKasaTab
            fansubId={id}
            coinBalance={fansubCoinBalance}
            onRefreshBalance={refreshCoinBalance}
          />
        )}

        {activeTab === 'kapanis-kredisi' && (
          <FansubYonetChapterCreditTab
            fansubId={id}
            fansub={fansub}
            isBoostEnabled={isBoostEnabled}
            boostSnapshot={boostSnapshot}
          />
        )}
      </div>

      {canCreateContent && activeCreateDialog === 'manga' && (
        <MangaCreateDialog
          key={`manga-create-${createDialogNonce}`}
          open
          onOpenChange={handleCreateDialogOpenChange}
          fansubId={id}
          onCreated={handleMangaCreated}
          onRequestAddChapter={(manga) => openChapterCreate(manga.id)}
        />
      )}

      {canCreateContent && activeCreateDialog === 'chapter' && (
        <ChapterCreateDialog
          key={`chapter-create-${createDialogNonce}-${chapterDefaultMangaId ?? ''}`}
          open
          onOpenChange={handleCreateDialogOpenChange}
          fansubId={id}
          defaultMangaId={chapterDefaultMangaId}
          onCreated={handleChapterCreated}
          onRequestAddAnother={(mangaId) => openChapterCreate(mangaId)}
        />
      )}
    </FansubStudioShell>
  )
}

export default FansubYonetPage
