import { useCallback, useEffect, useRef, useState } from 'react'
import type { CurrentUser } from '@/contexts/AuthContext'
import { newRequestKey } from '@/pages/shop/shopFormat'
import { getPublicUnlockDelayHours } from '@/services/premiumPackagePublicService'
import { fetchShopStorefront, purchaseShopProduct } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

// Shop v3 premium product (shop_products.kind = premium); the price is calculated on the server.
export type CommunityPremiumOffer = {
  productId: string
  name: string
  price: number
  durationDays: number
  publicUnlockDelayHours: number
  purchasable: boolean
}

type UseCommunityPremiumUnlockOptions = {
  currentUser: CurrentUser | null
  premiumActive: boolean
  updateCurrentUser: (patch: Partial<CurrentUser>) => void
}

function resolvePremiumUnlockErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return txa('İşlem tamamlanamadı.')
}

async function loadCommunityPremiumOffer(): Promise<CommunityPremiumOffer | null> {
  const [storefront, delayHours] = await Promise.all([fetchShopStorefront(), getPublicUnlockDelayHours()])
  const card = storefront.premium
  if (!card) return null
  return {
    productId: card.id,
    name: card.title ?? txa('Premium'),
    price: card.quote.price,
    durationDays: card.premiumDays ?? 30,
    publicUnlockDelayHours: delayHours,
    purchasable: card.quote.purchasable,
  }
}

export function useCommunityPremiumUnlock({
  currentUser,
  premiumActive,
  updateCurrentUser,
}: UseCommunityPremiumUnlockOptions) {
  const [premiumUnlockOpen, setPremiumUnlockOpen] = useState(false)
  const [premiumOffer, setPremiumOffer] = useState<CommunityPremiumOffer | null>(null)
  const [premiumOfferLoading, setPremiumOfferLoading] = useState(false)
  const [premiumPurchasePending, setPremiumPurchasePending] = useState(false)
  // One request key per window: one order even after a double click or a timeout retry.
  const requestKeyRef = useRef('')

  useEffect(() => {
    if (premiumActive) setPremiumUnlockOpen(false)
  }, [premiumActive])

  const openPremiumUnlockDialog = useCallback(async () => {
    requestKeyRef.current = newRequestKey()
    setPremiumUnlockOpen(true)
    if (!currentUser || premiumActive || premiumOffer || premiumOfferLoading) return

    setPremiumOfferLoading(true)
    try {
      setPremiumOffer(await loadCommunityPremiumOffer())
    } catch (error) {
      toast.error(resolvePremiumUnlockErrorMessage(error))
    } finally {
      setPremiumOfferLoading(false)
    }
  }, [currentUser, premiumActive, premiumOffer, premiumOfferLoading])

  const handlePremiumPurchase = useCallback(async () => {
    if (!currentUser || !premiumOffer?.purchasable) return

    setPremiumPurchasePending(true)
    try {
      const result = await purchaseShopProduct({
        productId: premiumOffer.productId,
        requestKey: requestKeyRef.current || newRequestKey(),
      })
      updateCurrentUser({
        stones: result.balance,
        premiumExpiresAt: result.premiumExpiresAt ?? currentUser.premiumExpiresAt,
      })
      setPremiumUnlockOpen(false)
      toast.success(txa('Premium aktif! Özel emoji ve çıkartma kullanımı açıldı.'))
    } catch (error) {
      toast.error(resolvePremiumUnlockErrorMessage(error))
    } finally {
      setPremiumPurchasePending(false)
    }
  }, [currentUser, premiumOffer, updateCurrentUser])

  return {
    premiumUnlockOpen,
    premiumOffer,
    premiumOfferLoading,
    premiumPurchasePending,
    setPremiumUnlockOpen,
    openPremiumUnlockDialog,
    handlePremiumPurchase,
  }
}
