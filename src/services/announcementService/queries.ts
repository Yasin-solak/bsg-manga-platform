import { listAdminAnnouncementsV2, announcementExcerpt, kindLabels } from '../announcementV2'
import { supabase } from '../supabase'
import { ANNOUNCEMENT_SELECT, mapDbAnnouncementToCommunityPost } from './shared'
import type { AdminAnnouncement, CommunityPost, DbSiteAnnouncement } from './types'

export async function listPublicAnnouncements(params?: {
    category?: string
    limit?: number
}): Promise<CommunityPost[]> {
    const category = params?.category?.trim()
    const limit = params?.limit ?? 10

    let query = supabase
        .from('site_announcements')
        .select(ANNOUNCEMENT_SELECT)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 1))

    if (category && category !== 'all') {
        query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
        console.error('[announcementService] listPublicAnnouncements error', error)
        return []
    }

    return (data || []).map((row) => mapDbAnnouncementToCommunityPost(row as DbSiteAnnouncement))
}

// The old dashboard contract is only a presentation adapter; management reads the v2 source.
export async function listAdminAnnouncements(limit = 50): Promise<AdminAnnouncement[]> {
    return (await getAdminAnnouncementOverview()).items.slice(0, limit)
}

export async function getAdminAnnouncementOverview(): Promise<{ items: AdminAnnouncement[]; total: number }> {
    const result = await listAdminAnnouncementsV2()
    return { total: result.total, items: result.items.map(a => ({
        id: a.id, title: a.title, body: announcementExcerpt(a.preview), status: 'approved',
        isActive: a.status === 'published' && Date.parse(a.starts_at) <= Date.now() && (!a.ends_at || Date.parse(a.ends_at) > Date.now()),
        announcementCategory: kindLabels[a.kind], createdAt: a.created_at, updatedAt: a.updated_at, approvedAt: a.starts_at,
        author: { id: '', username: 'BSG Manga', avatar: '' },
    })) }
}
