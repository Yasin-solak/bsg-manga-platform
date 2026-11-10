import { getCurrentUserIdentity } from '../userService/selfIdentity'
import type { AdminAnnouncement, AnnouncementTextAnimation, CommunityPost, DbSiteAnnouncement } from './types'

export const ANNOUNCEMENT_SELECT = `
            id,
            title,
            body,
            category,
            primary_color,
            secondary_color,
            text_color,
            text_animation,
            action_label,
            action_url,
            is_active,
            published_at,
            created_at,
            updated_at,
            users:created_by (
                id,
                username,
                avatar_url
            )
        `

export function normalizeHexColor(input: string | undefined, fallback: string) {
    if (!input) return fallback
    const color = input.trim()
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback
}

export function normalizeTextAnimation(input: string | undefined): AnnouncementTextAnimation {
    const value = input?.trim().toLowerCase()
    if (value === 'pulse' || value === 'blink' || value === 'slide' || value === 'none') {
        return value
    }
    return 'marquee'
}

export function normalizeCategory(input: string | undefined) {
    const value = input?.trim()
    if (!value) return 'Genel'
    return value.slice(0, 32)
}

export function normalizeActionLabel(input: string | undefined) {
    const value = input?.trim()
    if (!value) return null
    return value.slice(0, 30)
}

export function normalizeActionUrl(input: string | undefined) {
    const value = input?.trim()
    if (!value) return null
    if (value.startsWith('/') || /^https?:\/\//i.test(value)) {
        return value
    }
    return null
}

export function mapDbAnnouncementToAdmin(row: DbSiteAnnouncement): AdminAnnouncement {
    const author = Array.isArray(row.users) ? row.users[0] : row.users
    const authorId = author?.id || '00000000-0000-0000-0000-000000000001'

    return {
        id: row.id,
        title: row.title?.trim() || 'Duyuru',
        body: row.body?.trim() || '',
        status: 'approved',
        isActive: row.is_active !== false,
        primaryColor: row.primary_color || undefined,
        secondaryColor: row.secondary_color || undefined,
        announcementCategory: row.category || 'Genel',
        announcementTextColor: row.text_color || '#FFF8E1',
        announcementTextAnimation: normalizeTextAnimation(row.text_animation || undefined),
        announcementActionLabel: row.action_label || undefined,
        announcementActionUrl: row.action_url || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        approvedAt: row.published_at || undefined,
        author: {
            id: authorId,
            username: author?.username || 'Sistem',
            avatar: author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`,
        },
    }
}

export function mapDbAnnouncementToCommunityPost(row: DbSiteAnnouncement): CommunityPost {
    const author = Array.isArray(row.users) ? row.users[0] : row.users
    const authorId = author?.id || 'announcement'
    return {
        id: row.id,
        username: author?.username || 'Duyuru Merkezi',
        displayName: 'Duyuru',
        avatar: author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`,
        category: 'Duyuru',
        title: row.title || 'Duyuru',
        description: row.body || '',
        likes: 0,
        comments: 0,
        status: 'approved',
        isActive: row.is_active !== false,
        createdAt: row.published_at || row.created_at,
        updatedAt: row.updated_at,
        primaryColor: row.primary_color || '#C62828',
        secondaryColor: row.secondary_color || '#8B0000',
        isVerified: true,
        announcementCategory: row.category || 'Genel',
        announcementTextColor: row.text_color || '#FFF8E1',
        announcementTextAnimation: normalizeTextAnimation(row.text_animation || undefined),
        announcementActionLabel: row.action_label || undefined,
        announcementActionUrl: row.action_url || undefined,
    }
}

export async function getCurrentPublicProfileId() {
    const identity = await getCurrentUserIdentity({ required: true })
    if (!identity?.id) throw new Error('Public profile not found')
    return identity.id
}
