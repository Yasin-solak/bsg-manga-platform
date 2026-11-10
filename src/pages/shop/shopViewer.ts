import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { isPremiumActive } from '@/services/premiumPackagePublicService'
import { txa } from '@/i18n/activeLocale'

/*
 * Identity of live previews in the shop: the signed-in reader's own avatar and name; a demo
 * persona if signed out. Frame, background, bundle and premium showcases play with this identity.
 */

export interface ShopViewer {
  avatar: string
  name: string
  username: string
  isGuest: boolean
  isPremium: boolean
}

export const SHOP_DEMO_PERSONA: ShopViewer = {
  avatar: '',
  get name() { return txa('Okur') },
  username: 'okur',
  isGuest: true,
  isPremium: false,
}

export function useShopViewer(): ShopViewer {
  const { currentUser } = useAuth()
  return useMemo(() => {
    if (!currentUser) return SHOP_DEMO_PERSONA
    return {
      avatar: currentUser.avatar,
      name: currentUser.displayName || currentUser.username || txa('Sen'),
      username: currentUser.username || 'okur',
      isGuest: false,
      isPremium: isPremiumActive(currentUser.premiumExpiresAt),
    }
  }, [currentUser])
}
