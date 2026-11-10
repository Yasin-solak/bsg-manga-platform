// Fansub Boost tab content
// Discord-style single plan boost flow with a quantity picker; the view is tabs/FansubBoostPanels.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/services/toastService'
import {
  listPublicFansubBoostCapabilityPolicies,
  purchaseFansubBoost,
  type FansubBoostPlan,
  type FansubBoostPolicyCatalogItem,
  type FansubBoostSnapshot,
  type FansubBoostSupporterPreview,
  type FansubBoostSupporterState,
  type PurchaseFansubBoostResult,
} from '@/services/fansubBoostService'
import type { FansubDonationActivityItem } from '@/services/fansubService'
import {
  BOOST_TIERS,
  buildBoostTierCatalog,
  getTierByLevel,
  getTierState,
} from './fansubBoostConstants'
import {
  BoostPurchaseDialog,
  TierDetailDialog,
} from './FansubBoostDialogs'
import { FansubBoostPanels } from './tabs/FansubBoostPanels'
import { txa } from '@/i18n/activeLocale'

type FansubBoostTabContentProps = {
  fansubId: string
  fansubName: string
  snapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  recentDonationPreview: FansubDonationActivityItem[]
  plans: FansubBoostPlan[]
  currentUserCoins: number
  isFansubAdmin?: boolean
  onPurchaseSuccess?: (result: PurchaseFansubBoostResult) => void
}

export default function FansubBoostTabContent({
  fansubId,
  fansubName,
  snapshot,
  supporterState,
  supporterPreview,
  recentDonationPreview,
  plans,
  currentUserCoins,
  isFansubAdmin = false,
  onPurchaseSuccess,
}: FansubBoostTabContentProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, updateCurrentUser } = useAuth()

  const [tierDialogLevel, setTierDialogLevel] = useState<number | null>(null)
  const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false)
  const [boostQuantity, setBoostQuantity] = useState(1)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [supporterNote, setSupporterNote] = useState('')
  const [policyCatalog, setPolicyCatalog] = useState<FansubBoostPolicyCatalogItem[]>([])

  const currentTierLevel = snapshot?.tierLevel ?? 0
  const activePower = snapshot?.activePower ?? 0
  const boostTiers = useMemo(
    () => (policyCatalog.length > 0 ? buildBoostTierCatalog(policyCatalog) : BOOST_TIERS),
    [policyCatalog],
  )

  const boostPlan = useMemo(() => {
    const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder)
    return sorted[0] ?? null
  }, [plans])

  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()

    void listPublicFansubBoostCapabilityPolicies(abortController.signal)
      .then((rows) => {
        if (!cancelled) setPolicyCatalog(rows)
      })
      .catch(() => {
        if (!cancelled) setPolicyCatalog([])
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [])

  const selectedTier = tierDialogLevel ? getTierByLevel(tierDialogLevel, boostTiers) : null

  const boostProgress = useMemo(() => ({
    activePower,
    currentTierLevel,
    nextTierLevel: snapshot?.nextTierLevel ?? null,
    nextTierRequiredPower: snapshot?.nextTierRequiredPower ?? null,
    nextTierRemainingPower: snapshot?.nextTierRemainingPower ?? 0,
    tierProgressPercent: snapshot?.tierProgressPercent ?? 0,
  }), [activePower, currentTierLevel, snapshot])

  const openTierDetail = useCallback((tierLevel: number) => {
    setTierDialogLevel(tierLevel)
  }, [])

  const openBoostDialog = useCallback(() => {
    setBoostQuantity(1)
    setIsBoostDialogOpen(true)
  }, [])

  const handlePurchase = useCallback(async () => {
    if (!boostPlan) return

    if (!currentUser) {
      navigate('/giris', {
        state: { from: `${location.pathname}${location.search}${location.hash}` },
      })
      return
    }

    setIsPurchasing(true)

    try {
      const result = await purchaseFansubBoost({
        fansubId,
        planCode: boostPlan.code,
        supporterNote: supporterNote.trim() || null,
        quantity: boostQuantity,
      })

      updateCurrentUser({ stones: result.newUserStones })
      onPurchaseSuccess?.(result)

      setTierDialogLevel(null)
      setIsBoostDialogOpen(false)
      setSupporterNote('')
      setBoostQuantity(1)

      toast.success(txa('{v1} icin {v2}takviye tamamlandi.', { v1: fansubName, v2: boostQuantity > 1 ? txa('{v1} adet ', { v1: boostQuantity }) : '' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Takviye satın alma başarısız oldu.'))
    } finally {
      setIsPurchasing(false)
    }
  }, [
    boostPlan,
    boostQuantity,
    currentUser,
    fansubId,
    fansubName,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    onPurchaseSuccess,
    supporterNote,
    updateCurrentUser,
  ])

  return (
    <>
      <FansubBoostPanels
        snapshot={snapshot}
        tiers={boostTiers}
        policies={policyCatalog}
        isFansubAdmin={isFansubAdmin}
        supporterState={supporterState}
        supporterPreview={supporterPreview}
        recentDonationPreview={recentDonationPreview}
        onTierClick={openTierDetail}
        onBoost={openBoostDialog}
      />

      <TierDetailDialog
        open={tierDialogLevel !== null}
        onOpenChange={(open) => setTierDialogLevel(open ? tierDialogLevel : null)}
        tier={selectedTier}
        state={selectedTier ? getTierState(selectedTier.level, currentTierLevel) : 'locked'}
        capabilities={snapshot?.capabilities}
        onActivate={() => {
          setTierDialogLevel(null)
          openBoostDialog()
        }}
      />

      <BoostPurchaseDialog
        open={isBoostDialogOpen}
        onOpenChange={setIsBoostDialogOpen}
        fansubName={fansubName}
        plan={boostPlan}
        quantity={boostQuantity}
        onQuantityChange={setBoostQuantity}
        currentUserCoins={currentUserCoins}
        supporterNote={supporterNote}
        onSupporterNoteChange={setSupporterNote}
        isSubmitting={isPurchasing}
        onSubmit={handlePurchase}
        progress={boostProgress}
      />
    </>
  )
}
