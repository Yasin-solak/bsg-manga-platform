import { supabase } from '../supabase'
import { normalizeCommunityMentionHandle, sanitizeLikeQuery } from './shared'
import type {
    CommunityMentionFansubSuggestion,
    CommunityMentionMangaSuggestion,
    RelatedUser,
} from './types'

function normalizeUserSearchQuery(query: string) {
    const withoutHandlePrefix = query.trim().replace(/^@+/, '')
    if (/^[a-z0-9_-]+$/i.test(withoutHandlePrefix)) {
        return withoutHandlePrefix.slice(0, 80)
    }
    return sanitizeLikeQuery(withoutHandlePrefix)
}

export async function searchCommunityMentionUsers(query: string, limit = 8): Promise<RelatedUser[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : 8
    const normalizedQuery = normalizeUserSearchQuery(query || '')

    let builder = supabase
        .from('public_user_directory')
        .select('id, username, display_name, avatar_url')
        .order('username', { ascending: true })
        .limit(safeLimit)

    if (normalizedQuery) {
        const like = `%${normalizedQuery}%`
        builder = builder.or(`username.ilike.${like},display_name.ilike.${like}`)
    }

    const { data, error } = await builder

    if (error || !data) {
        console.error('[communityMentionService] searchCommunityMentionUsers error', error)
        return []
    }

    return data.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name?.trim() || row.username,
        avatar: row.avatar_url || undefined,
    }))
}

export async function searchCommunityMentionFansubs(
    query: string,
    limit = 8,
): Promise<CommunityMentionFansubSuggestion[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : 8
    const normalizedQuery = normalizeCommunityMentionHandle(query || '')

    let builder = supabase
        .from('fansubs')
        .select('id, name, slug, avatar_url, follower_count')
        .eq('is_active', true)
        .order('follower_count', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
        .limit(safeLimit)

    if (normalizedQuery) {
        const q = sanitizeLikeQuery(normalizedQuery)
        builder = builder.or(`slug.ilike.%${q}%,name.ilike.%${q}%`)
    }

    const { data, error } = await builder

    if (error || !data) {
        console.error('[communityMentionService] searchCommunityMentionFansubs error', error)
        return []
    }

    return data.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        avatar: row.avatar_url || undefined,
    }))
}

export async function searchCommunityMentionMangas(
    query: string,
    limit = 8,
): Promise<CommunityMentionMangaSuggestion[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : 8
    const normalizedQuery = normalizeCommunityMentionHandle(query || '')

    let builder = supabase
        .from('mangas')
        .select('id, title, slug, cover_image_url, total_views')
        .eq('is_active', true)
        .eq('is_approved', true)
        .order('total_views', { ascending: false, nullsFirst: false })
        .order('title', { ascending: true })
        .limit(safeLimit)

    if (normalizedQuery) {
        const q = sanitizeLikeQuery(normalizedQuery)
        builder = builder.or(`slug.ilike.%${q}%,title.ilike.%${q}%`)
    }

    const { data, error } = await builder
    if (error || !data) {
        console.error('[communityMentionService] searchCommunityMentionMangas error', error)
        return []
    }

    return data.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        coverImage: row.cover_image_url || undefined,
    }))
}
