import { useCallback, useEffect, useMemo, useState } from 'react'
import { createScopedLogger } from '@/services/logger'
import {
    getAdminFansubMemberHistoryStats,
    getAdminFansubManagementOverview,
    listAdminFansubInventoryPage,
    listAdminFansubMangasPage,
    listAdminFansubMemberHistoryPage,
    listAdminFansubTransactionsPage,
    listAdminFansubManagementPage,
    type AdminFansubInventoryItem,
    type AdminFansubManagementOverview,
    type AdminFansubManagementView,
    type AdminFansubMemberHistoryStats,
    type AdminFansubMemberHistoryRecord,
    type AdminFansubTransactionRecord,
    type AdminFansubTransactionTypeFilter,
    type AdminFansubTrustFilter,
    type AdminManagedFansub,
    type AdminManagedManga,
    type AdminMemberStateFilter,
    type AdminStatusFilter,
} from '@/services/adminService'
import { useDebouncedSearchValue } from './useDebouncedSearchValue'
import { toast } from '@/services/toastService'
import { useFansubManagementActions } from './useFansubManagementActions'
import {
    EMPTY_STATS,
    FANSUBS_PER_PAGE,
    INVENTORY_PER_PAGE,
    MANGAS_PER_PAGE,
    MEMBERS_PER_PAGE,
    TRANSACTIONS_PER_PAGE,
    errText,
    type DetailTab,
    type MemberDraft,
} from './fansubManagementUtils'
import { txa } from '@/i18n/activeLocale'

const fansubManagementLogger = createScopedLogger('FansubManagementSection')

export function useFansubManagementState() {
    const [fansubs, setFansubs] = useState<AdminManagedFansub[]>([])
    const [fansubTotal, setFansubTotal] = useState(0)
    const [fansubLoading, setFansubLoading] = useState(true)
    const [fansubError, setFansubError] = useState<string | null>(null)
    const [fansubSearchInput, setFansubSearchInput] = useState('')
    const fansubSearch = useDebouncedSearchValue(fansubSearchInput)
    const [fansubStatus, setFansubStatus] = useState<AdminStatusFilter>('all')
    const [fansubView, setFansubView] = useState<AdminFansubManagementView>('all')
    const [fansubTrust, setFansubTrust] = useState<AdminFansubTrustFilter>('all')
    const [fansubPage, setFansubPage] = useState(1)
    const [selectedFansubId, setSelectedFansubId] = useState('')
    const [fansubBusyId, setFansubBusyId] = useState<string | null>(null)
    const [overview, setOverview] = useState<AdminFansubManagementOverview | null>(null)
    const [overviewLoading, setOverviewLoading] = useState(true)

    const [tab, setTab] = useState<DetailTab>('overview')
    const [stats, setStats] = useState<AdminFansubMemberHistoryStats>(EMPTY_STATS)
    const [statsLoading, setStatsLoading] = useState(false)

    const [mangas, setMangas] = useState<AdminManagedManga[]>([])
    const [mangaTotal, setMangaTotal] = useState(0)
    const [mangaLoading, setMangaLoading] = useState(false)
    const [mangaError, setMangaError] = useState<string | null>(null)
    const [mangaSearchInput, setMangaSearchInput] = useState('')
    const mangaSearch = useDebouncedSearchValue(mangaSearchInput)
    const [mangaStatus, setMangaStatus] = useState<AdminStatusFilter>('all')
    const [mangaPage, setMangaPage] = useState(1)
    const [mangaBusyId, setMangaBusyId] = useState<string | null>(null)

    const [members, setMembers] = useState<AdminFansubMemberHistoryRecord[]>([])
    const [memberTotal, setMemberTotal] = useState(0)
    const [memberLoading, setMemberLoading] = useState(false)
    const [memberError, setMemberError] = useState<string | null>(null)
    const [memberSearchInput, setMemberSearchInput] = useState('')
    const memberSearch = useDebouncedSearchValue(memberSearchInput)
    const [memberState, setMemberState] = useState<AdminMemberStateFilter>('all')
    const [memberPage, setMemberPage] = useState(1)
    const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({})
    const [memberBusyId, setMemberBusyId] = useState<string | null>(null)

    const [inventory, setInventory] = useState<AdminFansubInventoryItem[]>([])
    const [inventoryTotal, setInventoryTotal] = useState(0)
    const [inventoryLoading, setInventoryLoading] = useState(false)
    const [inventoryError, setInventoryError] = useState<string | null>(null)
    const [inventorySearchInput, setInventorySearchInput] = useState('')
    const inventorySearch = useDebouncedSearchValue(inventorySearchInput)
    const [inventoryPage, setInventoryPage] = useState(1)

    const [transactions, setTransactions] = useState<AdminFansubTransactionRecord[]>([])
    const [transactionTotal, setTransactionTotal] = useState(0)
    const [transactionLoading, setTransactionLoading] = useState(false)
    const [transactionError, setTransactionError] = useState<string | null>(null)
    const [transactionSearchInput, setTransactionSearchInput] = useState('')
    const transactionSearch = useDebouncedSearchValue(transactionSearchInput)
    const [transactionType, setTransactionType] = useState<AdminFansubTransactionTypeFilter>('all')
    const [transactionPage, setTransactionPage] = useState(1)

    const selectedFansub = useMemo(
        () => fansubs.find((fansub) => fansub.id === selectedFansubId) || null,
        [fansubs, selectedFansubId],
    )

    useEffect(() => setFansubPage(1), [fansubSearch, fansubStatus, fansubTrust, fansubView])
    useEffect(() => setMangaPage(1), [selectedFansubId, mangaSearch, mangaStatus])
    useEffect(() => setMemberPage(1), [selectedFansubId, memberSearch, memberState])
    useEffect(() => setInventoryPage(1), [selectedFansubId, inventorySearch])
    useEffect(() => setTransactionPage(1), [selectedFansubId, transactionSearch, transactionType])

    const loadFansubs = useCallback(async () => {
        setFansubLoading(true)
        setFansubError(null)
        try {
            const result = await listAdminFansubManagementPage({
                page: fansubPage,
                limit: FANSUBS_PER_PAGE,
                search: fansubSearch,
                status: fansubStatus,
                view: fansubView,
                trust: fansubTrust,
            })
            setFansubs(result.data)
            setFansubTotal(result.count)
        } catch (error) {
            fansubManagementLogger.error('loadFansubs error', error)
            setFansubs([])
            setFansubTotal(0)
            setFansubError(errText(error, txa('Fansub listesi yuklenemedi.')))
        } finally {
            setFansubLoading(false)
        }
    }, [fansubPage, fansubSearch, fansubStatus, fansubTrust, fansubView])

    useEffect(() => {
        void loadFansubs()
    }, [loadFansubs])

    const loadOverview = useCallback(async () => {
        setOverviewLoading(true)
        try {
            setOverview(await getAdminFansubManagementOverview())
        } catch (error) {
            fansubManagementLogger.error('loadOverview error', error)
            toast.error(errText(error, txa('Fansub özeti yüklenemedi.')))
        } finally {
            setOverviewLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadOverview()
    }, [loadOverview])

    useEffect(() => {
        if (fansubs.length === 0) {
            setSelectedFansubId('')
            return
        }
        if (!fansubs.some((fansub) => fansub.id === selectedFansubId)) {
            setSelectedFansubId(fansubs[0].id)
        }
    }, [fansubs, selectedFansubId])

    const loadStats = useCallback(async () => {
        if (!selectedFansubId) return setStats(EMPTY_STATS)
        setStatsLoading(true)
        try {
            setStats(await getAdminFansubMemberHistoryStats(selectedFansubId))
        } catch (error) {
            fansubManagementLogger.error('loadStats error', error)
            setStats(EMPTY_STATS)
            toast.error(errText(error, txa('Uye istatistikleri yuklenemedi.')))
        } finally {
            setStatsLoading(false)
        }
    }, [selectedFansubId])

    useEffect(() => {
        void loadStats()
    }, [loadStats])

    const loadMangas = useCallback(async () => {
        if (!selectedFansubId || tab !== 'mangas') return
        setMangaLoading(true)
        setMangaError(null)
        try {
            const result = await listAdminFansubMangasPage(selectedFansubId, {
                page: mangaPage,
                limit: MANGAS_PER_PAGE,
                search: mangaSearch,
                status: mangaStatus,
            })
            setMangas(result.data)
            setMangaTotal(result.count)
        } catch (error) {
            fansubManagementLogger.error('loadMangas error', error)
            setMangas([])
            setMangaTotal(0)
            setMangaError(errText(error, txa('Manga listesi yuklenemedi.')))
        } finally {
            setMangaLoading(false)
        }
    }, [selectedFansubId, tab, mangaPage, mangaSearch, mangaStatus])

    useEffect(() => {
        void loadMangas()
    }, [loadMangas])

    const loadMembers = useCallback(async () => {
        if (!selectedFansubId || tab !== 'members') return
        setMemberLoading(true)
        setMemberError(null)
        try {
            const result = await listAdminFansubMemberHistoryPage(selectedFansubId, {
                page: memberPage,
                limit: MEMBERS_PER_PAGE,
                search: memberSearch,
                state: memberState,
            })
            setMembers(result.data)
            setMemberTotal(result.count)
            setMemberDrafts((prev) => {
                const next = { ...prev }
                result.data.forEach((row) => {
                    if (!row.leftAt && !next[row.id]) {
                        next[row.id] = { role: row.role, teamTag: row.teamTag || '' }
                    }
                })
                return next
            })
        } catch (error) {
            fansubManagementLogger.error('loadMembers error', error)
            setMembers([])
            setMemberTotal(0)
            setMemberError(errText(error, txa('Uye gecmisi yuklenemedi.')))
        } finally {
            setMemberLoading(false)
        }
    }, [selectedFansubId, tab, memberPage, memberSearch, memberState])

    useEffect(() => {
        void loadMembers()
    }, [loadMembers])

    const loadInventory = useCallback(async () => {
        if (!selectedFansubId || tab !== 'economy') return
        setInventoryLoading(true)
        setInventoryError(null)
        try {
            const result = await listAdminFansubInventoryPage(selectedFansubId, {
                page: inventoryPage,
                limit: INVENTORY_PER_PAGE,
                search: inventorySearch,
            })
            setInventory(result.data)
            setInventoryTotal(result.count)
        } catch (error) {
            fansubManagementLogger.error('loadInventory error', error)
            setInventory([])
            setInventoryTotal(0)
            setInventoryError(errText(error, txa('Fansub envanteri yuklenemedi.')))
        } finally {
            setInventoryLoading(false)
        }
    }, [selectedFansubId, tab, inventoryPage, inventorySearch])

    useEffect(() => {
        void loadInventory()
    }, [loadInventory])

    const loadTransactions = useCallback(async () => {
        if (!selectedFansubId || tab !== 'economy') return
        setTransactionLoading(true)
        setTransactionError(null)
        try {
            const result = await listAdminFansubTransactionsPage(selectedFansubId, {
                page: transactionPage,
                limit: TRANSACTIONS_PER_PAGE,
                search: transactionSearch,
                type: transactionType,
            })
            setTransactions(result.data)
            setTransactionTotal(result.count)
        } catch (error) {
            fansubManagementLogger.error('loadTransactions error', error)
            setTransactions([])
            setTransactionTotal(0)
            setTransactionError(errText(error, txa('İşlem geçmişi yüklenemedi.')))
        } finally {
            setTransactionLoading(false)
        }
    }, [selectedFansubId, tab, transactionPage, transactionSearch, transactionType])

    useEffect(() => {
        void loadTransactions()
    }, [loadTransactions])

    const { toggleFansubActive, toggleMangaActive, saveMember, updateMemberDraftRole, updateMemberDraftTag } = useFansubManagementActions({
        selectedFansubId,
        memberDrafts,
        loadStats,
        loadMembers,
        setFansubBusyId,
        setFansubs,
        setMangaBusyId,
        setMangas,
        setMemberBusyId,
        setMemberDrafts,
    })

    return {
        fansubs,
        fansubTotal,
        fansubLoading,
        fansubError,
        fansubSearchInput,
        setFansubSearchInput,
        fansubStatus,
        setFansubStatus,
        fansubView,
        setFansubView,
        fansubTrust,
        setFansubTrust,
        fansubPage,
        setFansubPage,
        selectedFansubId,
        setSelectedFansubId,
        fansubBusyId,
        overview,
        overviewLoading,
        loadFansubs,
        loadOverview,
        tab,
        setTab,
        stats,
        statsLoading,
        mangas,
        mangaTotal,
        mangaLoading,
        mangaError,
        mangaSearchInput,
        setMangaSearchInput,
        mangaStatus,
        setMangaStatus,
        mangaPage,
        setMangaPage,
        mangaBusyId,
        members,
        memberTotal,
        memberLoading,
        memberError,
        memberSearchInput,
        setMemberSearchInput,
        memberState,
        setMemberState,
        memberPage,
        setMemberPage,
        memberDrafts,
        memberBusyId,
        inventory,
        inventoryTotal,
        inventoryLoading,
        inventoryError,
        inventorySearchInput,
        setInventorySearchInput,
        inventoryPage,
        setInventoryPage,
        transactions,
        transactionTotal,
        transactionLoading,
        transactionError,
        transactionSearchInput,
        setTransactionSearchInput,
        transactionType,
        setTransactionType,
        transactionPage,
        setTransactionPage,
        selectedFansub,
        toggleFansubActive,
        toggleMangaActive,
        saveMember,
        updateMemberDraftRole,
        updateMemberDraftTag,
    }
}
