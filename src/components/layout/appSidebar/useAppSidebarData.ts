import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CurrentUser } from '@/contexts/AuthContext'
import { getMyAdminFansubs } from '@/services/fansubService'
import { getMyAccountEconomySnapshot, resolveMyAccountStones } from '@/services/selfAccountEconomyService'
import { userService } from '@/services/userService'
import { supabase } from '@/services/supabase'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import {
  loadStoreItemsLiteByIdentifiers,
  toStoreItemLiteTypeIdentifierKey,
} from '@/services/storeItemLiteDirectory'

import {
  resolveOwnedBackgrounds,
  resolveOwnedFrames,
  resolveOwnedPatterns,
  type ResolvedInventoryItem,
} from '@/services/inventoryResolver'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { listActiveEvents, type ActiveEventQuest } from '@/services/rewardService'
import type {
  AdminFansubWallet,
  FansubBalanceRow,
  PersonalOwnedItemRow,
  QuickPanelKey,
  ReadingHistoryRow,
} from './appSidebarUtils'
import {
  formatRef,
  parseOwnedList,
} from './appSidebarUtils'
import { txa } from '@/i18n/activeLocale'

const appSidebarLogger = createScopedLogger('AppSidebar')

type UseAppSidebarDataArgs = {
  currentUser: CurrentUser | null
  isAdmin: boolean
  updateCurrentUser: (patch: Partial<CurrentUser>) => void
}

export function useAppSidebarData({ currentUser, isAdmin, updateCurrentUser }: UseAppSidebarDataArgs) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [activeQuickPanel, setActiveQuickPanel] = useState<QuickPanelKey | null>(null)
  const [isCoinCodeActivationEnabled, setIsCoinCodeActivationEnabled] = useState(false)
  const [isUserTasksEnabled, setIsUserTasksEnabled] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<ReadingHistoryRow[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [resolvedFrameRows, setResolvedFrameRows] = useState<ResolvedInventoryItem[]>([])
  const [resolvedBackgroundRows, setResolvedBackgroundRows] = useState<ResolvedInventoryItem[]>([])
  const [resolvedPatternRows, setResolvedPatternRows] = useState<ResolvedInventoryItem[]>([])
  const [selectedFrameIdentifier, setSelectedFrameIdentifier] = useState('default')
  const [selectedBackgroundIdentifier, setSelectedBackgroundIdentifier] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceRows, setBalanceRows] = useState<FansubBalanceRow[]>([])
  const [personalOwnedRows, setPersonalOwnedRows] = useState<PersonalOwnedItemRow[]>([])
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [adminFansubs, setAdminFansubs] = useState<AdminFansubWallet[]>([])
  const [activeEvents, setActiveEvents] = useState<ActiveEventQuest[]>([])

  const ownedFrames = useMemo(() => parseOwnedList(currentUser?.ownedItems?.frames), [currentUser?.ownedItems])
  const ownedBackgrounds = useMemo(() => parseOwnedList(currentUser?.ownedItems?.backgrounds), [currentUser?.ownedItems])
  const ownedPatterns = useMemo(() => parseOwnedList(currentUser?.ownedItems?.patterns), [currentUser?.ownedItems])
  const ownedBadges = useMemo(() => parseOwnedList(currentUser?.ownedItems?.badges), [currentUser?.ownedItems])
  const personalInventoryCount = ownedFrames.length + ownedBackgrounds.length + ownedPatterns.length + ownedBadges.length
  const fansubInventoryCount = useMemo(() => adminFansubs.reduce((sum, item) => sum + item.inventory.length, 0), [adminFansubs])
  const roleLabel = isAdmin ? txa('Site Admin') : adminFansubs.length > 0 ? txa('Fansub Yöneticisi') : txa('Kullanıcı')
  const displayedStones = useMemo(() => {
    if (!currentUser) return 0
    return resolveMyAccountStones({
      userId: currentUser.id,
      fallbackStones: currentUser.stones ?? 0,
    })
  }, [currentUser?.id, currentUser?.stones])

  const readCurrentAccountEconomyState = useCallback(async () => {
    if (!currentUser) return null

    const snapshot = await getMyAccountEconomySnapshot().catch(() => null)
    if (snapshot?.id === currentUser.id) {
      updateCurrentUser({
        stones: snapshot.stones,
        ownedItems: snapshot.ownedItems,
        premiumExpiresAt: snapshot.premiumExpiresAt,
      })
      return snapshot
    }

    return {
      id: currentUser.id,
      stones: currentUser.stones || 0,
      ownedItems: currentUser.ownedItems || {},
      premiumExpiresAt: currentUser.premiumExpiresAt ?? null,
    }
  }, [currentUser, updateCurrentUser])

  useEffect(() => {
    if (!currentUser) {
      setAdminFansubs([])
      return
    }

    void (async () => {
      const rows = await getMyAdminFansubs(currentUser.id) as AdminFansubWallet[]
      setAdminFansubs(rows)
    })()
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false

    void (async () => {
      const snapshot = await getMyAccountEconomySnapshot().catch((error) => {
        appSidebarLogger.warn('syncAccountEconomySnapshot failed', error)
        return null
      })

      if (cancelled || !snapshot || snapshot.id !== currentUser.id) return

      updateCurrentUser({
        stones: snapshot.stones,
        ownedItems: snapshot.ownedItems,
        premiumExpiresAt: snapshot.premiumExpiresAt,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, updateCurrentUser])

  useEffect(() => {
    let cancelled = false

    const loadFlags = async (force = false) => {
      const flags = await getRuntimeFeatureFlags(['economy.coin_codes', 'rewards.user_tasks'], false, force)
      if (cancelled) return
      setIsCoinCodeActivationEnabled(flags['economy.coin_codes'] === true)
      setIsUserTasksEnabled(flags['rewards.user_tasks'] === true)
    }

    void loadFlags()
    const unsubscribe = listenFeatureFlagUpdates((payload) => {
      if (!['economy.coin_codes', 'rewards.user_tasks'].includes(payload.key)) return
      void loadFlags(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) {
      setHistoryRows([])
      setResolvedFrameRows([])
      setResolvedBackgroundRows([])
      setResolvedPatternRows([])
      setPersonalOwnedRows([])
      setIsNotificationOpen(false)
      setActiveQuickPanel(null)
    }
  }, [currentUser])

  useEffect(() => {
    if (!isCoinCodeActivationEnabled && activeQuickPanel === 'redeem') setActiveQuickPanel(null)
    if (!isUserTasksEnabled && activeQuickPanel === 'tasks') setActiveQuickPanel(null)
  }, [activeQuickPanel, isCoinCodeActivationEnabled, isUserTasksEnabled])

  // Cheaply fetch active seasonal events for the sidebar (list_active_events).
  useEffect(() => {
    if (!currentUser?.id || !isUserTasksEnabled) {
      setActiveEvents([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const rows = await listActiveEvents()
        if (!cancelled) setActiveEvents(rows)
      } catch {
        if (!cancelled) setActiveEvents([])
      }
    })()
    return () => { cancelled = true }
  }, [currentUser?.id, isUserTasksEnabled])

  // Other surfaces (home quest card) can open the quest panel with the 'mz:open-quests' event.
  useEffect(() => {
    const handler = () => {
      if (isUserTasksEnabled) setActiveQuickPanel('tasks')
    }
    window.addEventListener('mz:open-quests', handler)
    return () => window.removeEventListener('mz:open-quests', handler)
  }, [isUserTasksEnabled])

  /*
   * Same pattern for the account security panel: the Settings button in the mobile menu
   * opens it from here. The panel state lives inside this hook, so the way to reach it
   * from outside is a window event; a separate context would be too much
   * for one button.
   */
  useEffect(() => {
    const handler = () => setActiveQuickPanel('security')
    window.addEventListener('mz:open-security', handler)
    return () => window.removeEventListener('mz:open-security', handler)
  }, [])

  const loadHistory = useCallback(async () => {
    if (!currentUser) return
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const rows = await userService.getReadingHistory(currentUser.id)
      setHistoryRows((rows || []).map((row: any) => ({
        id: String(row.id || `${row.manga_id}-${row.read_at}`),
        mangaId: typeof row.manga?.id === 'string' ? row.manga.id : undefined,
        mangaSlug: typeof row.manga?.slug === 'string' ? row.manga.slug : undefined,
        mangaTitle: row.manga?.title || txa('Bilinmeyen Manga'),
        coverImage: typeof row.manga?.cover_image_url === 'string' ? row.manga.cover_image_url : undefined,
        chapterNumber: typeof row.chapter_number === 'number' ? row.chapter_number : undefined,
        readAt: row.read_at,
      })))
    } catch (error) {
      appSidebarLogger.error('loadHistory failed', error)
      setHistoryRows([])
      setHistoryError(txa('Okuma geçmişi yüklenemedi.'))
    } finally {
      setHistoryLoading(false)
    }
  }, [currentUser])

  const loadInventory = useCallback(async () => {
    if (!currentUser) return
    setInventoryLoading(true)
    setInventoryError(null)
    try {
      const accountState = await readCurrentAccountEconomyState()
      if (!accountState) {
        throw new Error(txa('Hesap envanter özeti okunamadı.'))
      }
      const runtimeOwnedFrames = parseOwnedList(accountState.ownedItems?.frames)
      const runtimeOwnedBackgrounds = parseOwnedList(accountState.ownedItems?.backgrounds)
      const runtimeOwnedPatterns = parseOwnedList(accountState.ownedItems?.patterns)
      const [frames, backgrounds, patterns, profileResult] = await Promise.all([
        resolveOwnedFrames(runtimeOwnedFrames),
        resolveOwnedBackgrounds(runtimeOwnedBackgrounds),
        resolveOwnedPatterns(runtimeOwnedPatterns),
        userService.getMyProfileCustomizationSnapshot(currentUser.id),
      ])

      const selectedFrame = typeof profileResult.frame_type === 'string' ? profileResult.frame_type.trim() : ''
      const selectedBackground = typeof profileResult.background_type === 'string' ? profileResult.background_type.trim() : ''
      setResolvedFrameRows(frames)
      setResolvedBackgroundRows(backgrounds)
      setResolvedPatternRows(patterns)
      setSelectedFrameIdentifier(selectedFrame || (currentUser.frameType || '').trim() || frames[0]?.identifier || 'default')
      setSelectedBackgroundIdentifier(selectedBackground || backgrounds[0]?.identifier || null)
    } catch (error) {
      appSidebarLogger.error('loadInventory failed', error)
      setResolvedFrameRows([])
      setResolvedBackgroundRows([])
      setResolvedPatternRows([])
      setInventoryError(txa('Envanter bilgileri yüklenemedi.'))
    } finally {
      setInventoryLoading(false)
    }
  }, [currentUser, readCurrentAccountEconomyState])

  const loadBalance = useCallback(async () => {
    if (!currentUser) return
    setBalanceLoading(true)
    setBalanceError(null)
    try {
      const accountState = await readCurrentAccountEconomyState()
      if (!accountState) {
        throw new Error(txa('Hesap ekonomi özeti okunamadı.'))
      }
      const runtimeOwnedFrames = parseOwnedList(accountState.ownedItems?.frames)
      const runtimeOwnedBackgrounds = parseOwnedList(accountState.ownedItems?.backgrounds)
      const runtimeOwnedPatterns = parseOwnedList(accountState.ownedItems?.patterns)
      const runtimeOwnedBadges = parseOwnedList(accountState.ownedItems?.badges)
      const runtimeOwnedPremium = parseOwnedList(accountState.ownedItems?.premium)
      const refs = [
        ...runtimeOwnedFrames.map((identifier) => ({ identifier, type: 'frame' as const })),
        ...runtimeOwnedBackgrounds.map((identifier) => ({ identifier, type: 'background' as const })),
        ...runtimeOwnedPatterns.map((identifier) => ({ identifier, type: 'pattern' as const })),
        ...runtimeOwnedBadges.map((identifier) => ({ identifier, type: 'badge' as const })),
        ...runtimeOwnedPremium.map((identifier) => ({ identifier, type: 'premium' as const })),
      ]
      const uniqueIdentifiers = Array.from(new Set(refs.map((ref) => ref.identifier).filter(Boolean)))

      if (uniqueIdentifiers.length > 0) {
        const itemMap = await loadStoreItemsLiteByIdentifiers(uniqueIdentifiers)

        const nextRows: PersonalOwnedItemRow[] = []
        const seen = new Set<string>()
        for (const ref of refs) {
          const key = `${ref.type}:${ref.identifier}`
          if (seen.has(key)) continue
          seen.add(key)
          const mapped = itemMap.get(toStoreItemLiteTypeIdentifierKey(ref.type, ref.identifier))
          const assetValue = mapped?.custom_asset_url || mapped?.image_key
          nextRows.push({
            identifier: ref.identifier,
            name: mapped?.name || formatRef(ref.identifier),
            type: (mapped?.type as PersonalOwnedItemRow['type'] | undefined) || ref.type,
            customAssetUrl: assetValue || undefined,
          })
        }
        setPersonalOwnedRows(nextRows)
      } else {
        setPersonalOwnedRows([])
      }

      if (adminFansubs.length === 0) {
        setBalanceRows([])
        return
      }

      const fansubIds = adminFansubs.map((item) => item.id)
      const fansubNames = new Map(adminFansubs.map((item) => [item.id, item.name]))
      const { data, error } = await supabase
        .from('fansub_transactions')
        .select('id, fansub_id, amount, type, description, created_at, related_item:related_item_id ( name, type, identifier )')
        .in('fansub_id', fansubIds)
        .order('created_at', { ascending: false })
        .limit(80)

      if (error) throw error

      setBalanceRows(((data || []) as any[]).map((row) => {
        const relatedItem = Array.isArray(row.related_item) ? row.related_item[0] : row.related_item
        return {
          id: row.id,
          fansubName: fansubNames.get(row.fansub_id) || txa('Bilinmeyen Fansub'),
          amount: Number(row.amount || 0),
          type: row.type || 'system',
          description: row.description?.trim() || txa('Açıklama yok'),
          createdAt: row.created_at,
          relatedItemName: relatedItem?.name || (relatedItem?.identifier ? formatRef(relatedItem.identifier) : undefined),
          relatedItemType: relatedItem?.type || undefined,
        }
      }))
    } catch (error) {
      appSidebarLogger.error('loadBalance failed', error)
      setBalanceRows([])
      setPersonalOwnedRows([])
      setBalanceError(txa('Bakiye hareketleri yüklenemedi.'))
    } finally {
      setBalanceLoading(false)
    }
  }, [adminFansubs, currentUser, readCurrentAccountEconomyState])

  const applyFrame = useCallback(async (identifier: string) => {
    if (!currentUser) return
    try {
      await userService.updateMyProfileCustomization({
        applyFrameType: true,
        frameType: identifier,
      })
      setSelectedFrameIdentifier(identifier)
      updateCurrentUser({ frameType: identifier })
      toast.success(txa('Çerçeve güncellendi.'))
    } catch {
      toast.error(txa('Çerçeve kaydedilemedi.'))
    }
  }, [currentUser, updateCurrentUser])

  const applyBackground = useCallback(async (identifier: string) => {
    if (!currentUser) return
    try {
      await userService.updateMyProfileCustomization({
        applyBackgroundType: true,
        backgroundType: identifier,
      })
      setSelectedBackgroundIdentifier(identifier)
      toast.success(txa('Arka plan güncellendi.'))
    } catch {
      toast.error(txa('Arka plan kaydedilemedi.'))
    }
  }, [currentUser])

  const updateCurrentUserStones = useCallback((stones: number) => {
    updateCurrentUser({ stones })
  }, [updateCurrentUser])

  const updateFansubBalance = useCallback((fansubId: string, balance: number) => {
    setAdminFansubs((prev) => prev.map((item) => item.id === fansubId ? { ...item, coin_balance: balance } : item))
  }, [])

  return {
    activeQuickPanel,
    activeEvents,
    adminFansubs,
    applyBackground,
    applyFrame,
    balanceError,
    balanceLoading,
    balanceRows,
    fansubInventoryCount,
    historyError,
    historyLoading,
    historyRows,
    inventoryError,
    inventoryLoading,
    isCoinCodeActivationEnabled,
    isNotificationOpen,
    isUserTasksEnabled,
    loadBalance,
    loadHistory,
    loadInventory,
    ownedBadges,
    personalInventoryCount,
    personalOwnedRows,
    resolvedBackgroundRows,
    resolvedFrameRows,
    resolvedPatternRows,
    roleLabel,
    selectedBackgroundIdentifier,
    selectedFrameIdentifier,
    setActiveQuickPanel,
    setAdminFansubs,
    setIsNotificationOpen,
    setSigningOut,
    signingOut,
    displayedStones,
    updateCurrentUserStones,
    updateFansubBalance,
  }
}
