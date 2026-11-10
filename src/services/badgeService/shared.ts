import { resolveStoreAssetUrl } from '../assetUrlService'
import type { Badge, BadgeRarity, FansubBadge, UserBadge } from './types'

export function mapBadgeAsset(badge: Badge): Badge {
    return {
        ...badge,
        image_url: resolveStoreAssetUrl(badge.image_url) || badge.image_url,
    }
}

export function mapUserBadgeAsset(userBadge: UserBadge): UserBadge {
    return {
        ...userBadge,
        badge: userBadge.badge ? mapBadgeAsset(userBadge.badge) : undefined,
    }
}

export function mapFansubBadgeAsset(fansubBadge: FansubBadge): FansubBadge {
    return {
        ...fansubBadge,
        badge: fansubBadge.badge ? mapBadgeAsset(fansubBadge.badge) : undefined,
    }
}

export const BADGE_RARITY_COLORS: Record<BadgeRarity, { bg: string; border: string; text: string }> = {
    common: { bg: '#e0e0e0', border: '#9e9e9e', text: '#424242' },
    rare: { bg: '#bbdefb', border: '#1976d2', text: '#0d47a1' },
    epic: { bg: '#e1bee7', border: '#7b1fa2', text: '#4a148c' },
    legendary: { bg: '#fff59d', border: '#f9a825', text: '#e65100' },
}
