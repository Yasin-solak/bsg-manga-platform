import { supabase } from '../supabase'
import {
    MAX_LIST_LIMIT,
    type DbAdminFansubRow,
    type DbAdminMangaRow,
    mapDbAdminFansub,
    mapDbAdminManga,
    normalizePageAndLimit,
    sanitizeSearchTerm,
} from './shared'
import type {
    AdminFansubListParams,
    AdminFansubMangaListParams,
    AdminManagedFansub,
    AdminManagedManga,
    AdminPagedResult,
} from './types'

export async function listAdminFansubs() {
    const result = await listAdminFansubsPage({ page: 1, limit: MAX_LIST_LIMIT })
    return result.data
}

export async function listAdminFansubsPage(params: AdminFansubListParams = {}): Promise<AdminPagedResult<AdminManagedFansub>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const status = params.status || 'all'
    const search = sanitizeSearchTerm(params.search)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('fansubs')
        .select(`
            id,
            name,
            slug,
            avatar_url,
            description,
            is_active,
            manga_count,
            follower_count,
            coin_balance,
            created_at,
            updated_at
        `, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('name', { ascending: true })

    if (status === 'active') query = query.eq('is_active', true)
    if (status === 'inactive') query = query.eq('is_active', false)
    if (params.view === 'new') {
        query = query.gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    }

    if (search) {
        query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
        console.error('[adminService] listAdminFansubsPage error', error)
        throw error
    }

    const mappedFansubs = (data as DbAdminFansubRow[]).map(mapDbAdminFansub)
    const enrichedFansubs = await enrichAdminFansubs(mappedFansubs)

    return {
        data: enrichedFansubs,
        count: count || 0,
        page,
        limit,
    }
}

async function enrichAdminFansubs(fansubs: AdminManagedFansub[]): Promise<AdminManagedFansub[]> {
    const fansubIds = fansubs.map((fansub) => fansub.id)
    if (fansubIds.length === 0) return fansubs

    const [membersResult, auditResult, transactionResult, mangaResult, reviewResult] = await Promise.all([
        supabase
            .from('fansub_members')
            .select(`
                fansub_id,
                role,
                user:user_id (
                    id,
                    username,
                    avatar_url
                )
            `)
            .in('fansub_id', fansubIds)
            .limit(2000),
        supabase
            .from('fansub_audit_logs')
            .select('fansub_id, created_at')
            .in('fansub_id', fansubIds)
            .order('created_at', { ascending: false })
            .limit(2000),
        supabase
            .from('fansub_transactions')
            .select('fansub_id, created_at')
            .in('fansub_id', fansubIds)
            .order('created_at', { ascending: false })
            .limit(2000),
        supabase
            .from('mangas')
            .select('fansub_id, updated_at')
            .in('fansub_id', fansubIds)
            .order('updated_at', { ascending: false })
            .limit(2000),
        supabase
            .from('fansub_reported_content')
            .select('fansub_id')
            .in('fansub_id', fansubIds)
            .in('status', ['awaiting_fix', 'fix_submitted'])
            .limit(2000),
    ])

    const memberCounts = new Map<string, number>()
    const moderatorCounts = new Map<string, number>()
    const managers = new Map<string, AdminManagedFansub['manager']>()
    for (const entry of membersResult.data || []) {
        memberCounts.set(entry.fansub_id, (memberCounts.get(entry.fansub_id) || 0) + 1)
        if (entry.role === 'admin' || entry.role === 'moderator') {
            moderatorCounts.set(entry.fansub_id, (moderatorCounts.get(entry.fansub_id) || 0) + 1)
        }
        if (entry.role === 'admin') {
            const rawUser = Array.isArray(entry.user) ? entry.user[0] : entry.user
            if (rawUser) {
                managers.set(entry.fansub_id, {
                    id: rawUser.id,
                    username: rawUser.username,
                    avatarUrl: rawUser.avatar_url || undefined,
                })
            }
        }
    }

    const activityByFansub = new Map<string, string>()
    const registerActivity = (fansubId: string | null, createdAt: string) => {
        if (!fansubId || !createdAt) return
        const previous = activityByFansub.get(fansubId)
        if (!previous || new Date(createdAt).getTime() > new Date(previous).getTime()) {
            activityByFansub.set(fansubId, createdAt)
        }
    }
    for (const entry of auditResult.data || []) registerActivity(entry.fansub_id, entry.created_at)
    for (const entry of transactionResult.data || []) registerActivity(entry.fansub_id, entry.created_at)
    for (const entry of mangaResult.data || []) registerActivity(entry.fansub_id, entry.updated_at)

    const pendingReviews = new Map<string, number>()
    for (const entry of reviewResult.data || []) {
        pendingReviews.set(entry.fansub_id, (pendingReviews.get(entry.fansub_id) || 0) + 1)
    }

    return fansubs.map((fansub) => ({
        ...fansub,
        memberCount: memberCounts.get(fansub.id) || 0,
        moderatorCount: moderatorCounts.get(fansub.id) || 0,
        manager: managers.get(fansub.id),
        lastActivityAt: activityByFansub.get(fansub.id),
        pendingReviewCount: pendingReviews.get(fansub.id) || 0,
        isVerified: null,
        trust: null,
    }))
}

export async function listAdminMangasByFansubIds(fansubIds: string[]) {
    if (fansubIds.length === 0) return []

    const { data, error } = await supabase
        .from('mangas')
        .select(`
            id,
            fansub_id,
            title,
            slug,
            cover_image_url,
            status,
            is_approved,
            is_active,
            total_views,
            last_chapter_number,
            updated_at
        `)
        .in('fansub_id', fansubIds)
        .order('updated_at', { ascending: false })

    if (error) {
        console.error('[adminService] listAdminMangasByFansubIds error', error)
        throw error
    }

    return (data as DbAdminMangaRow[])
        .map(mapDbAdminManga)
        .filter((row): row is AdminManagedManga => Boolean(row))
}

export async function listAdminFansubMangasPage(
    fansubId: string,
    params: AdminFansubMangaListParams = {},
): Promise<AdminPagedResult<AdminManagedManga>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const status = params.status || 'all'
    const search = sanitizeSearchTerm(params.search)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('mangas')
        .select(`
            id,
            fansub_id,
            title,
            slug,
            cover_image_url,
            status,
            is_approved,
            is_active,
            total_views,
            last_chapter_number,
            updated_at
        `, { count: 'exact' })
        .eq('fansub_id', fansubId)
        .order('updated_at', { ascending: false })

    if (status === 'active') query = query.eq('is_active', true)
    if (status === 'inactive') query = query.eq('is_active', false)

    if (search) {
        query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
        console.error('[adminService] listAdminFansubMangasPage error', error)
        throw error
    }

    return {
        data: (data as DbAdminMangaRow[])
            .map(mapDbAdminManga)
            .filter((row): row is AdminManagedManga => Boolean(row)),
        count: count || 0,
        page,
        limit,
    }
}
