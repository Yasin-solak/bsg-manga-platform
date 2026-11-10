import { supabase } from '../supabase'
import { mapFansubBadgeAsset } from './shared'
import type { FansubBadge } from './types'

export async function getFansubBadges(fansubId: string): Promise<FansubBadge[]> {
    const { data, error } = await supabase
        .from('fansub_badges')
        .select(
            `
            *,
            badge:badges(*)
        `,
        )
        .eq('fansub_id', fansubId)
        .order('display_order', { ascending: true })

    if (error) {
        console.error('Fansub rozetleri getirme hatasi:', error)
        throw error
    }

    return (data || []).map(mapFansubBadgeAsset)
}

export async function getFansubDisplayedBadges(fansubId: string): Promise<FansubBadge[]> {
    const { data, error } = await supabase
        .from('fansub_badges')
        .select(
            `
            *,
            badge:badges(*)
        `,
        )
        .eq('fansub_id', fansubId)
        .eq('is_displayed', true)
        .order('display_order', { ascending: true })
        .limit(3)

    if (error) {
        console.error('Gosterilen fansub rozetleri getirme hatasi:', error)
        throw error
    }

    return (data || []).map(mapFansubBadgeAsset)
}

export async function fansubHasBadge(fansubId: string, badgeId: string): Promise<boolean> {
    const { data } = await supabase
        .from('fansub_badges')
        .select('id')
        .eq('fansub_id', fansubId)
        .eq('badge_id', badgeId)
        .single()

    return !!data
}

export async function grantBadgeToFansub(fansubId: string, badgeId: string): Promise<FansubBadge> {
    const { data, error } = await supabase
        .from('fansub_badges')
        .insert({
            fansub_id: fansubId,
            badge_id: badgeId,
            is_displayed: false,
            display_order: 0,
        })
        .select()
        .single()

    if (error) {
        console.error('Fansub rozet ekleme hatasi:', error)
        throw error
    }

    return data
}

export async function updateFansubDisplayedBadges(fansubId: string, badgeIds: string[]): Promise<void> {
    await supabase.from('fansub_badges').update({ is_displayed: false, display_order: 0 }).eq('fansub_id', fansubId)

    const badgesToDisplay = badgeIds.slice(0, 3)

    for (let i = 0; i < badgesToDisplay.length; i += 1) {
        await supabase
            .from('fansub_badges')
            .update({ is_displayed: true, display_order: i + 1 })
            .eq('fansub_id', fansubId)
            .eq('badge_id', badgesToDisplay[i])
    }
}
