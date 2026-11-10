import { supabase } from '../supabase'
import {
    type DbAdminFansubMemberHistoryRow,
    findUserIdsByUsernameSearch,
    mapDbAdminFansubMemberHistoryRow,
    normalizePageAndLimit,
    sanitizeSearchTerm,
} from './shared'
import type {
    AdminFansubMemberHistoryParams,
    AdminFansubMemberHistoryRecord,
    AdminFansubMemberHistoryStats,
    AdminPagedResult,
} from './types'

export async function getAdminFansubMemberHistoryStats(fansubId: string): Promise<AdminFansubMemberHistoryStats> {
    const [activeResult, leftResult] = await Promise.all([
        supabase
            .from('fansub_member_history')
            .select('id', { count: 'exact', head: true })
            .eq('fansub_id', fansubId)
            .is('left_at', null),
        supabase
            .from('fansub_member_history')
            .select('id', { count: 'exact', head: true })
            .eq('fansub_id', fansubId)
            .not('left_at', 'is', null),
    ])

    if (activeResult.error) {
        console.error('[adminService] getAdminFansubMemberHistoryStats active error', activeResult.error)
        throw activeResult.error
    }
    if (leftResult.error) {
        console.error('[adminService] getAdminFansubMemberHistoryStats left error', leftResult.error)
        throw leftResult.error
    }

    let active = activeResult.count || 0
    if (active === 0) {
        const currentMembers = await supabase
            .from('fansub_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('fansub_id', fansubId)
        if (!currentMembers.error) active = currentMembers.count || 0
    }
    const left = leftResult.count || 0
    return { active, left, total: active + left }
}

export async function listAdminFansubMemberHistoryPage(
    fansubId: string,
    params: AdminFansubMemberHistoryParams = {},
): Promise<AdminPagedResult<AdminFansubMemberHistoryRecord>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const state = params.state || 'all'
    const search = sanitizeSearchTerm(params.search)
    const from = (page - 1) * limit
    const to = from + limit - 1
    const matchedUserIds = search ? await findUserIdsByUsernameSearch(search) : []

    let query = supabase
        .from('fansub_member_history')
        .select(`
            id,
            fansub_id,
            user_id,
            role,
            team_tag,
            joined_at,
            left_at,
            left_reason,
            ended_by_user_id,
            user:user_id (
                id,
                username,
                avatar_url
            ),
            ended_by_user:ended_by_user_id (
                id,
                username
            )
        `, { count: 'exact' })
        .eq('fansub_id', fansubId)

    if (state === 'active') query = query.is('left_at', null)
    if (state === 'left') query = query.not('left_at', 'is', null)

    if (search) {
        const clauses = [`role.ilike.%${search}%`, `team_tag.ilike.%${search}%`]
        if (matchedUserIds.length > 0) {
            clauses.push(`user_id.in.(${matchedUserIds.join(',')})`)
        }
        query = query.or(clauses.join(','))
    }

    if (state === 'left') {
        query = query.order('left_at', { ascending: false, nullsFirst: false })
    } else if (state === 'active') {
        query = query.order('joined_at', { ascending: false })
    } else {
        query = query
            .order('left_at', { ascending: true, nullsFirst: true })
            .order('joined_at', { ascending: false })
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
        console.error('[adminService] listAdminFansubMemberHistoryPage error', error)
        throw error
    }

    const mapped = (data as DbAdminFansubMemberHistoryRow[]).map(mapDbAdminFansubMemberHistoryRow)
    if (mapped.length === 0 && state !== 'left') {
        const fallback = await listCurrentFansubMembers(fansubId, {
            page,
            limit,
            search,
            matchedUserIds,
        })
        if (fallback) return fallback
    }

    return {
        data: mapped,
        count: count || 0,
        page,
        limit,
    }
}

async function listCurrentFansubMembers(
    fansubId: string,
    options: {
        page: number
        limit: number
        search: string
        matchedUserIds: string[]
    },
): Promise<AdminPagedResult<AdminFansubMemberHistoryRecord> | null> {
    const from = (options.page - 1) * options.limit
    const to = from + options.limit - 1
    let query = supabase
        .from('fansub_members')
        .select(`
            fansub_id,
            user_id,
            role,
            team_tag,
            created_at,
            user:user_id (
                id,
                username,
                avatar_url
            )
        `, { count: 'exact' })
        .eq('fansub_id', fansubId)
        .order('created_at', { ascending: false })

    if (options.search) {
        const clauses = [`role.ilike.%${options.search}%`, `team_tag.ilike.%${options.search}%`]
        if (options.matchedUserIds.length > 0) {
            clauses.push(`user_id.in.(${options.matchedUserIds.join(',')})`)
        }
        query = query.or(clauses.join(','))
    }

    const { data, error, count } = await query.range(from, to)
    if (error) return null

    return {
        data: (data || []).map((entry) => {
            const user = Array.isArray(entry.user) ? entry.user[0] : entry.user
            return {
                id: `${entry.fansub_id}:${entry.user_id}:active`,
                fansubId: entry.fansub_id,
                userId: entry.user_id,
                role: entry.role as AdminFansubMemberHistoryRecord['role'],
                teamTag: entry.team_tag || undefined,
                joinedAt: entry.created_at,
                leftReason: 'active' as const,
                user: user ? {
                    id: user.id,
                    username: user.username,
                    avatarUrl: user.avatar_url || undefined,
                } : undefined,
            }
        }),
        count: count || 0,
        page: options.page,
        limit: options.limit,
    }
}
