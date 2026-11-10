export type BadgeCategory = 'purchasable' | 'achievement' | 'event'
export type BadgeSubcategory =
    | 'vip'
    | 'supporter'
    | 'artist'
    | 'reader'
    | 'user_achievement'
    | 'fansub_achievement'
    | 'event'
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BadgeTargetType = 'user' | 'fansub' | 'both'

export interface Badge {
    id: string
    name: string
    description: string | null
    image_url: string
    category: BadgeCategory
    subcategory: BadgeSubcategory | null
    price: number | null
    rarity: BadgeRarity
    is_active: boolean
    target_type: BadgeTargetType
    requirements: Record<string, number> | null
    available_from: string | null
    available_until: string | null
    created_at: string
    updated_at: string
}

export interface UserBadge {
    id: string
    user_id: string
    badge_id: string
    obtained_at: string
    is_displayed: boolean
    display_order: number
    badge?: Badge
}

export interface FansubBadge {
    id: string
    fansub_id: string
    badge_id: string
    obtained_at: string
    is_displayed: boolean
    display_order: number
    badge?: Badge
}
