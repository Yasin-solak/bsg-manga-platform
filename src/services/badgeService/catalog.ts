import { supabase } from '../supabase'
import { mapBadgeAsset } from './shared'
import type { Badge, BadgeCategory, BadgeSubcategory, BadgeTargetType } from './types'

const BADGE_CATALOG_SELECT = `
    id,
    name,
    description,
    image_url,
    category,
    subcategory,
    price,
    rarity,
    is_active,
    target_type,
    requirements,
    available_from,
    available_until,
    created_at,
    updated_at
`

export async function listBadges(options?: {
    category?: BadgeCategory
    subcategory?: BadgeSubcategory
    targetType?: BadgeTargetType
}): Promise<Badge[]> {
    let query = supabase
        .from('badges')
        .select(BADGE_CATALOG_SELECT)
        .eq('is_active', true)
        .order('rarity', { ascending: false })
        .order('price', { ascending: true })

    if (options?.category) {
        query = query.eq('category', options.category)
    }

    if (options?.subcategory) {
        query = query.eq('subcategory', options.subcategory)
    }

    if (options?.targetType) {
        query = query.or(`target_type.eq.${options.targetType},target_type.eq.both`)
    }

    const { data, error } = await query

    if (error) {
        console.error('Rozet listeleme hatasi:', error)
        throw error
    }

    return (data || []).map(mapBadgeAsset)
}

export async function listPurchasableBadges(targetType?: BadgeTargetType): Promise<Badge[]> {
    return listBadges({ category: 'purchasable', targetType })
}

export async function getBadge(badgeId: string): Promise<Badge | null> {
    const { data, error } = await supabase
        .from('badges')
        .select(BADGE_CATALOG_SELECT)
        .eq('id', badgeId)
        .maybeSingle()

    if (error) {
        console.error('Rozet getirme hatasi:', error)
        return null
    }

    return data ? mapBadgeAsset(data) : null
}
