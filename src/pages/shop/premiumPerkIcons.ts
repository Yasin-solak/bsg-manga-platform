import { Cards, Clock, Coins, Crown, Fire, ImageSquare, Lightning, SealCheck, Smiley, Tag, TextAa, type Icon } from '@phosphor-icons/react'
import type { PremiumPerkKey } from '@/data/premiumPerks'

/* Icons of Premium perks (shared by the Premium page and Shop Control). */
export const PREMIUM_PERK_ICONS: Record<PremiumPerkKey, Icon> = {
  early_access: Clock,
  name_style: TextAa,
  name_effects: Fire,
  custom_background: ImageSquare,
  hover_theme: Cards,
  fansub_expressions: Smiley,
  premium_badge: SealCheck,
  premium_exclusives: Crown,
  member_pricing: Tag,
  coin_bonus: Coins,
  shop_early_access: Lightning,
}
