/**
 * Boost + donation inside the chapter.
 *
 * The chapter end support strip used to send the user to the fansub page: the reading flow
 * broke and returning was left to the user.
 * User feedback: purchase and donation should open INSIDE THE CHAPTER.
 *
 * No new service/RPC: the same three as the fansub page
 * (listActiveFansubBoostPlans / purchaseFansubBoost / donateToFansub).
 * The boost dialog also shows the fansub's STATE (current power, remaining to next
 * level): the user wanted this, and the data is already in the boost snapshot.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listActiveFansubBoostPlans,
  purchaseFansubBoost,
  type FansubBoostPlan,
  type FansubBoostSnapshot,
} from '@/services/fansubBoostService'
import { donateToFansub } from '@/services/fansubService/economy'
import { createScopedLogger } from '@/services/logger'
import { toast } from '@/services/toastService'
import { isDonationConfirmationInputValid } from '@/pages/fansub/fansubDetailUtils'
import type { BoostProgressInfo } from '@/pages/fansub/FansubBoostDialogs'
import { txa } from '@/i18n/activeLocale'

const readerV2SupportLogger = createScopedLogger('ReaderV2Support')

/** Same threshold as the fansub page for donation confirmation. */
const DONATION_DEFAULT_AMOUNT = '100'

interface UseReaderV2SupportArgs {
  fansubId: string | null | undefined
  fansubName: string | null | undefined
  /** Kredi katmaninda zaten cekilen snapshot; ikinci istek atilmaz. */
  snapshot: FansubBoostSnapshot | null
  boostEnabled: boolean
  donationsEnabled: boolean
  signedIn: boolean
  onRequireSignIn: () => void
  /** Refresh the user's balance after a purchase. */
  onBalanceChanged: () => void
  currentUserCoins: number
}

export function useReaderV2Support({
  fansubId,
  fansubName,
  snapshot,
  boostEnabled,
  donationsEnabled,
  signedIn,
  onRequireSignIn,
  onBalanceChanged,
  currentUserCoins,
}: UseReaderV2SupportArgs) {
  const [plans, setPlans] = useState<FansubBoostPlan[]>([])
  const [boostOpen, setBoostOpen] = useState(false)
  const [boostQuantity, setBoostQuantity] = useState(1)
  const [supporterNote, setSupporterNote] = useState('')
  const [isPurchasing, setIsPurchasing] = useState(false)

  const [donateOpen, setDonateOpen] = useState(false)
  const [donationAmountInput, setDonationAmountInput] = useState(DONATION_DEFAULT_AMOUNT)
  const [donationNote, setDonationNote] = useState('')
  const [donationConfirmationInput, setDonationConfirmationInput] = useState('')
  const [isDonating, setIsDonating] = useState(false)

  // Plans are fetched only when the dialog first opens: no request during reading for a
  // list nobody will see.
  useEffect(() => {
    if (!boostOpen || plans.length > 0 || !boostEnabled) return
    let alive = true
    void (async () => {
      try {
        const loaded = await listActiveFansubBoostPlans()
        if (alive) setPlans(loaded)
      } catch (error) {
        readerV2SupportLogger.error({ event: 'boost-plans-error', error })
      }
    })()
    return () => {
      alive = false
    }
  }, [boostEnabled, boostOpen, plans.length])

  const plan = useMemo(() => {
    if (plans.length === 0) return null
    return [...plans].sort((left, right) => left.sortOrder - right.sortOrder)[0] ?? null
  }, [plans])

  const progress = useMemo<BoostProgressInfo | null>(() => {
    if (!snapshot) return null
    return {
      activePower: snapshot.activePower ?? 0,
      currentTierLevel: snapshot.tierLevel ?? 0,
      nextTierLevel: snapshot.nextTierLevel ?? null,
      nextTierRequiredPower: snapshot.nextTierRequiredPower ?? null,
      nextTierRemainingPower: snapshot.nextTierRemainingPower ?? 0,
      tierProgressPercent: snapshot.tierProgressPercent ?? 0,
    }
  }, [snapshot])

  const openBoost = useCallback(() => {
    if (!signedIn) {
      onRequireSignIn()
      return
    }
    setBoostQuantity(1)
    setSupporterNote('')
    setBoostOpen(true)
  }, [onRequireSignIn, signedIn])

  const openDonate = useCallback(() => {
    if (!signedIn) {
      onRequireSignIn()
      return
    }
    setDonationAmountInput(DONATION_DEFAULT_AMOUNT)
    setDonationNote('')
    setDonationConfirmationInput('')
    setDonateOpen(true)
  }, [onRequireSignIn, signedIn])

  const submitBoost = useCallback(async () => {
    if (!fansubId || !plan || isPurchasing) return
    setIsPurchasing(true)
    try {
      await purchaseFansubBoost({
        fansubId,
        planCode: plan.code,
        supporterNote,
        quantity: boostQuantity,
      })
      setBoostOpen(false)
      setSupporterNote('')
      setBoostQuantity(1)
      onBalanceChanged()
      toast.success(
        `${fansubName || txa('Ekip')} icin ${boostQuantity > 1 ? `${boostQuantity} adet ` : ''}takviye tamamlandi.`,
      )
    } catch (error) {
      readerV2SupportLogger.error({ event: 'boost-purchase-error', error })
      toast.error(error instanceof Error ? error.message : txa('Takviye satin alma basarisiz oldu.'))
    } finally {
      setIsPurchasing(false)
    }
  }, [boostQuantity, fansubId, fansubName, isPurchasing, onBalanceChanged, plan, supporterNote])

  const normalizedDonationAmount = useMemo(() => {
    const parsed = Math.floor(Number(donationAmountInput))
    return Number.isFinite(parsed) ? parsed : 0
  }, [donationAmountInput])

  // The confirm text rule must come from the SAME source as the fansub page; rewriting it here
  // risks the two drifting.
  const isDonationConfirmationValid = isDonationConfirmationInputValid(donationConfirmationInput)

  const submitDonate = useCallback(async () => {
    if (!fansubId || isDonating) return
    setIsDonating(true)
    try {
      await donateToFansub(
        fansubId,
        normalizedDonationAmount,
        donationNote,
        donationConfirmationInput,
      )
      setDonateOpen(false)
      onBalanceChanged()
      toast.success(txa('{v1} icin bagis gonderildi.', { v1: fansubName || txa('Ekip') }))
    } catch (error) {
      readerV2SupportLogger.error({ event: 'donate-error', error })
      toast.error(error instanceof Error ? error.message : txa('Bagis gonderilemedi.'))
    } finally {
      setIsDonating(false)
    }
  }, [donationConfirmationInput, donationNote, fansubId, fansubName, isDonating, normalizedDonationAmount, onBalanceChanged])

  return {
    /** Diyaloglar yalnizca ilgili bayrak acikken kullanilabilir. */
    canBoost: boostEnabled && Boolean(fansubId),
    canDonate: donationsEnabled && Boolean(fansubId),
    openBoost,
    openDonate,

    boost: {
      open: boostOpen,
      setOpen: setBoostOpen,
      plan,
      quantity: boostQuantity,
      setQuantity: setBoostQuantity,
      supporterNote,
      setSupporterNote,
      isSubmitting: isPurchasing,
      submit: submitBoost,
      progress,
    },

    donate: {
      open: donateOpen,
      setOpen: setDonateOpen,
      amountInput: donationAmountInput,
      setAmountInput: setDonationAmountInput,
      note: donationNote,
      setNote: setDonationNote,
      confirmationInput: donationConfirmationInput,
      setConfirmationInput: setDonationConfirmationInput,
      isConfirmationValid: isDonationConfirmationValid,
      normalizedAmount: normalizedDonationAmount,
      isSubmitting: isDonating,
      submit: submitDonate,
    },

    currentUserCoins,
  }
}
