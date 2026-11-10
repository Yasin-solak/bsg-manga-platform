import { supabase } from '../supabase'
import { mapUserBadgeAsset } from './shared'
import type { UserBadge } from './types'

const BADGE_RELATION_SELECT = `
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

const USER_BADGE_SELECT = `
    id,
    user_id,
    badge_id,
    obtained_at,
    is_displayed,
    display_order,
    badge:badge_id(
        ${BADGE_RELATION_SELECT}
    )
`

const USER_BADGE_WRITEBACK_SELECT = 'id, user_id, badge_id, obtained_at, is_displayed, display_order'

export async function getUserBadges(userId: string): Promise<UserBadge[]> {
    const { data, error } = await supabase
        .from('user_badges')
        .select(USER_BADGE_SELECT)
        .eq('user_id', userId)
        .order('display_order', { ascending: true })

    if (error) {
        console.error('Kullanici rozetleri getirme hatasi:', error)
        throw error
    }

    const rows = ((data || []) as unknown as UserBadge[])
    return rows.map(mapUserBadgeAsset)
}

export async function getUserDisplayedBadges(userId: string): Promise<UserBadge[]> {
    const { data, error } = await supabase
        .from('user_badges')
        .select(USER_BADGE_SELECT)
        .eq('user_id', userId)
        .eq('is_displayed', true)
        .order('display_order', { ascending: true })
        .limit(3)

    if (error) {
        console.error('Gosterilen rozetler getirme hatasi:', error)
        throw error
    }

    const rows = ((data || []) as unknown as UserBadge[])
    return rows.map(mapUserBadgeAsset)
}


export async function userHasBadge(userId: string, badgeId: string): Promise<boolean> {
    const { data } = await supabase
        .from('user_badges')
        .select('id')
        .eq('user_id', userId)
        .eq('badge_id', badgeId)
        .maybeSingle()

    return !!data
}

export async function grantBadgeToUser(userId: string, badgeId: string): Promise<UserBadge> {
    const { data, error } = await supabase
        .from('user_badges')
        .insert({
            user_id: userId,
            badge_id: badgeId,
            is_displayed: false,
            display_order: 0,
        })
        .select(USER_BADGE_WRITEBACK_SELECT)
        .single()

    if (error) {
        console.error('Rozet ekleme hatasi:', error)
        throw error
    }

    return data as UserBadge
}

export async function updateUserDisplayedBadges(userId: string, badgeIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('update_user_displayed_badges', {
        p_user_id: userId,
        p_badge_ids: badgeIds.slice(0, 3),
    })

    if (error) {
        console.error('Rozet guncelleme hatasi:', error)
        throw error
    }
}
