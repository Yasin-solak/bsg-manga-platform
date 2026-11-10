import type { CSSProperties } from 'react'
import type { FansubDisplayedBadge } from './types'

export const FANSUB_HERO_CARD_WIDTH_PX = 450
export const FANSUB_HERO_CARD_MIN_HEIGHT_PX = 860
export const FANSUB_HERO_BACKGROUND_HEIGHT_PX = 220
export const FANSUB_HERO_AVATAR_SIZE_PX = 96
export const FANSUB_HERO_VISIBLE_BADGE_LIMIT = 3
export const FANSUB_NAME_FONT_SIZE_PX = 15
export const FANSUB_NAME_LINE_HEIGHT = 0.98
export const FANSUB_NAME_LETTER_SPACING = '-0.03em'

export function buildFansubNameDisplayStyle(style?: CSSProperties): CSSProperties {
  return {
    ...style,
    fontSize: `${FANSUB_NAME_FONT_SIZE_PX}px`,
    lineHeight: FANSUB_NAME_LINE_HEIGHT,
    letterSpacing: FANSUB_NAME_LETTER_SPACING,
  }
}

export function getVisibleFansubBadges(ownedBadges: FansubDisplayedBadge[]) {
  const displayedBadges = ownedBadges
    .filter((badge) => badge.is_displayed)
    .sort((a, b) => a.display_order - b.display_order)

  return {
    visibleBadges: displayedBadges.slice(0, FANSUB_HERO_VISIBLE_BADGE_LIMIT),
    hiddenBadgeCount: Math.max(0, displayedBadges.length - FANSUB_HERO_VISIBLE_BADGE_LIMIT),
  }
}
