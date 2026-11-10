import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedAdminAccess } from '@/hooks/useResolvedAdminAccess'
import {
    getDashboardStats,
    getSiteSettings,
    updateSiteSettings,
    type SiteSettings,
} from '@/services/adminService'
import { DEFAULT_SETTINGS } from '@/services/adminService/shared'
import { listPendingContent } from '@/services/mangaService'
import {
    listPendingFansubRequests,
} from '@/services/fansubService'
import {
    getAdminAnnouncementOverview,
    type AdminAnnouncement,
} from '@/services/announcementService'
import { listReports, type Report, type ReportStatus } from '@/services/reportService'
import { listLegalRequests, type LegalRequest } from '@/services/legalRequestService'
import type { DashboardStats } from '@/data/admin'
import type { PendingItem } from '@components/admin/AdminPendingSection'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { toast } from '@/services/toastService'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { isE2EModeEnabled, getE2EMockFeatureFlags } from '@/testing/e2eMocks'
import {
    mapPendingItems,
    toErrorMessage,
    type AdminSection,
} from './adminPageUtils'
import { useAdminComputedState } from './useAdminComputedState'
import { useAdminReportHandlers } from './useAdminReportHandlers'
import { useAdminPendingHandlers } from './useAdminPendingHandlers'
import { useAdminLegalRequestHandlers } from './useAdminLegalRequestHandlers'
import { txa } from '@/i18n/activeLocale'

interface UseAdminPageStateParams {
    requestedSection?: AdminSection
}

export function useAdminPageState({ requestedSection = 'dashboard' }: UseAdminPageStateParams = {}) {
    const { currentUser, loading: authLoading } = useAuth()
    const { isAdminResolved, resolvingAdminAccess } = useResolvedAdminAccess(currentUser)

    const [activeSection, setActiveSection] = useState<AdminSection>(requestedSection)
    const [loading, setLoading] = useState(true)
    const hasLoadedRef = useRef(false)
    const [isOperationsCenterEnabled, setIsOperationsCenterEnabled] = useState(false)
    /** No redirect until flags load; see the effect below. */
    const [featureFlagsResolved, setFeatureFlagsResolved] = useState(false)
    const [isReportsFeatureEnabled, setIsReportsFeatureEnabled] = useState(() => isE2EModeEnabled())

    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
    const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
    const [announcementTotal, setAnnouncementTotal] = useState(0)
    useEffect(() => {
        let alive = true
        const refresh = () => { void getAdminAnnouncementOverview().then(data => { if (alive) { setAnnouncements(data.items); setAnnouncementTotal(data.total) } }).catch(() => { /* Yönetim tablosu kendi hata durumunu gösterir. */ }) }
        window.addEventListener('mz:announcements-changed', refresh)
        return () => { alive = false; window.removeEventListener('mz:announcements-changed', refresh) }
    }, [])
    const [settings, setSettings] = useState<SiteSettings | null>(null)
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

    const [reports, setReports] = useState<Report[]>([])
    const [legalRequests, setLegalRequests] = useState<LegalRequest[]>([])


    const [reportStatusFilter, setReportStatusFilter] = useState<'all' | ReportStatus>('pending')

    useEffect(() => {
        let cancelled = false

        const loadFeatureFlags = async (forceRefresh = false) => {
            if (isE2EModeEnabled()) {
                if (!cancelled) {
                    // If a spec gave the flag explicitly, follow it; otherwise the old defaults stay.
                    // Pinning made the surface behind a flag
                    // completely untestable in e2e.
                    const mocked = getE2EMockFeatureFlags()
                    setIsOperationsCenterEnabled(mocked?.['admin.operations_center'] === true)
                    setIsReportsFeatureEnabled(mocked?.['moderation.reports'] ?? true)
                    setFeatureFlagsResolved(true)
                }
                return
            }
            const flags = await getRuntimeFeatureFlags(['admin.operations_center', 'moderation.reports'], false, forceRefresh)
            if (cancelled) return
            setIsOperationsCenterEnabled(flags['admin.operations_center'] === true)
            setIsReportsFeatureEnabled(flags['moderation.reports'] === true)
            setFeatureFlagsResolved(true)
        }

        void loadFeatureFlags()
        const unsubscribe = listenFeatureFlagUpdates((payload) => {
            if (payload.key !== 'admin.operations_center' && payload.key !== 'moderation.reports') return
            void loadFeatureFlags(true)
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [currentUser?.id])

    /**
     * Falling to the dashboard from a section closed by flag.
     *
     * **No redirect BEFORE the flag RESOLVES.** In the previous version the flag started `false`
     * and loaded asynchronously, so an admin coming directly to `/admin/operasyon`
     * (bookmark, refresh) was sent to the dashboard on EVERY COLD START and not
     * brought back when the flag later became `true`. The section worked,
     * its address just could not be reached.
     */
    useEffect(() => {
        if (!featureFlagsResolved) return
        if (!isOperationsCenterEnabled && activeSection === 'operations') {
            setActiveSection('dashboard')
        }
        if (!isReportsFeatureEnabled && activeSection === 'reports') {
            setActiveSection('dashboard')
        }
    }, [activeSection, featureFlagsResolved, isOperationsCenterEnabled, isReportsFeatureEnabled])

    useEffect(() => {
        setActiveSection((prev) => (prev === requestedSection ? prev : requestedSection))
    }, [requestedSection])

    const loadData = useCallback(async () => {
        if (authLoading || resolvingAdminAccess || !currentUser?.id || !isAdminResolved) {
            setLoading(false)
            return
        }
        const shouldBlockUi = !hasLoadedRef.current
        if (shouldBlockUi) setLoading(true)

        try {
            const fallbackStats: DashboardStats = {
                users: 0,
                fansubs: 0,
                mangas: 0,
            }
            const readResult = <T,>(
                result: PromiseSettledResult<T>,
                fallback: T,
                label: string,
            ): T => {
                if (result.status === 'fulfilled') return result.value
                console.warn(`[AdminPage] ${label} yuklenemedi`, result.reason)
                return fallback
            }

            const results = await Promise.allSettled([
                getDashboardStats(),
                listPendingContent(),
                listPendingFansubRequests(),
                isReportsFeatureEnabled ? listReports() : Promise.resolve([] as Report[]),
                listLegalRequests(),
                getAdminAnnouncementOverview(),
                getSiteSettings(),
            ])

            const statsData = readResult(results[0], fallbackStats, txa('dashboard istatistikleri'))
            const pendingData = readResult(results[1], { mangas: [], chapters: [] }, txa('onay bekleyen icerikler'))
            const pendingFansubRequests = readResult(results[2], [], txa('fansub talepleri'))
            const reportsData = readResult(results[3], [] as Report[], 'raporlar')
            const legalRequestsData = readResult(results[4], [] as LegalRequest[], txa('yasal talepler'))
            const announcementsData = readResult(results[5], { items: [] as AdminAnnouncement[], total: 0 }, 'duyurular')
            const settingsData = readResult(results[6], DEFAULT_SETTINGS, txa('site ayarlari'))

            setStats(statsData)
            setPendingItems(mapPendingItems(pendingData, pendingFansubRequests))
            setReports(reportsData)
            setLegalRequests(legalRequestsData)
            setAnnouncements(announcementsData.items)
            setAnnouncementTotal(announcementsData.total)
            setSettings(settingsData)
            setLastUpdatedAt(new Date().toISOString())
            hasLoadedRef.current = true
        } catch (error) {
            console.error('[AdminPage] loadData error', error)
            toast.error(toErrorMessage(error, txa('Admin verileri yuklenemedi.')))
        } finally {
            if (shouldBlockUi) setLoading(false)
        }
    }, [authLoading, currentUser?.id, isAdminResolved, isReportsFeatureEnabled, resolvingAdminAccess])

    useEffect(() => {
        if (authLoading || resolvingAdminAccess || !currentUser?.id || !isAdminResolved) return
        void loadData()
    }, [authLoading, currentUser?.id, isAdminResolved, loadData, resolvingAdminAccess])

    const {
        reportStats,
        filteredReports,
    } = useAdminComputedState({
        reports,
        reportStatusFilter,
    })

    const {
        handleApprove,
        handleReject,
    } = useAdminPendingHandlers({
        setPendingItems,
    })


    const { refreshReports } = useAdminReportHandlers({
        isReportsFeatureEnabled,
        setReports,
    })

    const {
        refreshLegalRequests,
        handleUpdateLegalRequest,
    } = useAdminLegalRequestHandlers({
        setLegalRequests,
    })

    async function handleSaveSettings() {
        if (!settings) return false
        try {
            await updateSiteSettings(settings)
            toast.success(txa('Site ayarları kaydedildi.'))
            return true
        } catch (error) {
            console.error('[AdminPage] handleSaveSettings error', error)
            toast.error(toErrorMessage(error, txa('Ayarlar kaydedilemedi.')))
            return false
        }
    }

    function handleAdminSectionChange(section: AdminSection) {
        if (section === 'operations' && !isOperationsCenterEnabled) {
            showInactiveFeatureToast(txa('Operasyon merkezi'))
            setActiveSection('dashboard')
            return
        }
        if (section === 'reports' && !isReportsFeatureEnabled) {
            showInactiveFeatureToast(txa('Rapor yonetimi'))
            setActiveSection('dashboard')
            return
        }
        setActiveSection(section)
    }

    return {
        currentUser,
        activeSection,
        loading,
        isOperationsCenterEnabled,
        featureFlagsResolved,
        isReportsFeatureEnabled,
        stats,
        pendingItems,
        announcements,
        announcementTotal,
        settings,
        lastUpdatedAt,
        reports,
        legalRequests,
        reportStatusFilter,
        reportStats,
        filteredReports,
        setReportStatusFilter,
        setSettings,
        loadData,
        handleApprove,
        handleReject,
        handleSaveSettings,
        refreshReports,
        refreshLegalRequests,
        handleUpdateLegalRequest,
        handleAdminSectionChange,
    }
}
