import { supabase } from '../supabase'
import {
    ANNOUNCEMENT_SELECT,
    getCurrentPublicProfileId,
    mapDbAnnouncementToAdmin,
    normalizeActionLabel,
    normalizeActionUrl,
    normalizeCategory,
    normalizeHexColor,
    normalizeTextAnimation,
} from './shared'
import type { AdminAnnouncement, AnnouncementTextAnimation, DbSiteAnnouncement } from './types'

export async function createAdminAnnouncement(input: {
    title: string
    body: string
    primaryColor?: string
    secondaryColor?: string
    announcementCategory?: string
    announcementTextColor?: string
    announcementTextAnimation?: AnnouncementTextAnimation
    announcementActionLabel?: string
    announcementActionUrl?: string
}): Promise<AdminAnnouncement> {
    const title = input.title.trim()
    const body = input.body.trim()

    if (!title || !body) {
        throw new Error('Duyuru basligi ve metni bos olamaz')
    }

    const profileId = await getCurrentPublicProfileId()

    const { data, error } = await supabase
        .from('site_announcements')
        .insert({
            title,
            body,
            category: normalizeCategory(input.announcementCategory),
            primary_color: normalizeHexColor(input.primaryColor, '#FFD600'),
            secondary_color: normalizeHexColor(input.secondaryColor, '#C62828'),
            text_color: normalizeHexColor(input.announcementTextColor, '#FFF8E1'),
            text_animation: normalizeTextAnimation(input.announcementTextAnimation),
            action_label: normalizeActionLabel(input.announcementActionLabel),
            action_url: normalizeActionUrl(input.announcementActionUrl),
            is_active: true,
            created_by: profileId,
            updated_by: profileId,
            published_at: new Date().toISOString(),
        })
        .select(ANNOUNCEMENT_SELECT)
        .single()

    if (error || !data) {
        console.error('[announcementService] createAdminAnnouncement error', error)
        throw error || new Error('Duyuru olusturulamadi')
    }

    return mapDbAnnouncementToAdmin(data as DbSiteAnnouncement)
}

export async function updateAdminAnnouncement(
    id: string,
    input: {
        title?: string
        body?: string
        isActive?: boolean
        primaryColor?: string
        secondaryColor?: string
        announcementCategory?: string
        announcementTextColor?: string
        announcementTextAnimation?: AnnouncementTextAnimation
        announcementActionLabel?: string
        announcementActionUrl?: string
        status?: 'pending' | 'approved' | 'rejected'
    },
): Promise<AdminAnnouncement> {
    const patch: Record<string, unknown> = {}

    if (typeof input.title === 'string') {
        const title = input.title.trim()
        if (!title) throw new Error('Duyuru basligi bos olamaz')
        patch.title = title
    }

    if (typeof input.body === 'string') {
        const body = input.body.trim()
        if (!body) throw new Error('Duyuru metni bos olamaz')
        patch.body = body
    }

    if (typeof input.isActive === 'boolean') {
        patch.is_active = input.isActive
    }

    if (typeof input.primaryColor === 'string') {
        patch.primary_color = normalizeHexColor(input.primaryColor, '#FFD600')
    }

    if (typeof input.secondaryColor === 'string') {
        patch.secondary_color = normalizeHexColor(input.secondaryColor, '#C62828')
    }

    if (typeof input.announcementCategory === 'string') {
        patch.category = normalizeCategory(input.announcementCategory)
    }

    if (typeof input.announcementTextColor === 'string') {
        patch.text_color = normalizeHexColor(input.announcementTextColor, '#FFF8E1')
    }

    if (typeof input.announcementTextAnimation === 'string') {
        patch.text_animation = normalizeTextAnimation(input.announcementTextAnimation)
    }

    if (typeof input.announcementActionLabel === 'string') {
        patch.action_label = normalizeActionLabel(input.announcementActionLabel)
    }

    if (typeof input.announcementActionUrl === 'string') {
        patch.action_url = normalizeActionUrl(input.announcementActionUrl)
    }

    if (Object.keys(patch).length === 0) {
        throw new Error('Guncelleme icin en az bir alan gondermelisiniz')
    }

    const profileId = await getCurrentPublicProfileId()
    patch.updated_by = profileId

    const { data, error } = await supabase
        .from('site_announcements')
        .update(patch)
        .eq('id', id)
        .select(ANNOUNCEMENT_SELECT)
        .single()

    if (error || !data) {
        console.error('[announcementService] updateAdminAnnouncement error', error)
        throw error || new Error('Duyuru guncellenemedi')
    }

    return mapDbAnnouncementToAdmin(data as DbSiteAnnouncement)
}

export async function deleteAdminAnnouncement(id: string): Promise<void> {
    const { error } = await supabase.from('site_announcements').delete().eq('id', id)

    if (error) {
        console.error('[announcementService] deleteAdminAnnouncement error', error)
        throw error
    }
}
