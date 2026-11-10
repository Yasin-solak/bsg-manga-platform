import type { ShopCard, ShopGrant } from '@/services/shopService'

/*
 * Card ratios by type: frames and effects near square (one column), backgrounds, bundles and
 * premium wide (two columns). Bento in the showcase: the first card can be a 2x2 "featured".
 */

export type ShopCardShape = 'square' | 'wide' | 'feature'

export function shopCardShape(card: ShopCard, feature = false): ShopCardShape {
  if (feature) return 'feature'
  if (card.type === 'frame' || card.type === 'profile_effect') return 'square'
  return 'wide'
}

export const SHOP_CARD_SPAN: Record<ShopCardShape, string> = {
  square: 'col-span-1',
  wide: 'col-span-2',
  feature: 'col-span-2 row-span-2',
}

export const SHOP_CARD_MEDIA: Record<ShopCardShape, string> = {
  square: 'aspect-square',
  wide: 'aspect-[2.05/1]',
  feature: 'aspect-square sm:aspect-auto sm:min-h-[260px]',
}

export function findGrant(card: ShopCard, type: 'frame' | 'background' | 'profile_effect'): ShopGrant | undefined {
  return card.grants.find((grant) => grant.type === type)
}

/** Best reference for the card's small still image (poster > asset > cover). */
export function shopCardPosterRef(card: ShopCard) {
  const order: Array<'frame' | 'profile_effect' | 'background'> = card.type === 'background'
    ? ['background', 'frame', 'profile_effect']
    : card.type === 'profile_effect'
      ? ['profile_effect', 'frame', 'background']
      : ['frame', 'profile_effect', 'background']
  for (const type of order) {
    const grant = findGrant(card, type)
    if (grant?.posterUrl) return grant.posterUrl
  }
  return card.cover
}
