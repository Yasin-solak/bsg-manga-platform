import { supabase } from '../supabase'

export type AdminUserMiniRow = {
    id: string
    username: string | null
    avatar_url: string | null
}

export type AdminReportUserTargetRow = AdminUserMiniRow & {
    bio: string | null
    is_active: boolean | null
    is_banned: boolean | null
}

function normalizeUserIds(userIds: string[]) {
    return Array.from(
        new Set(
            userIds
                .map((userId) => userId.trim())
                .filter(Boolean),
        ),
    )
}

export async function listAdminUserDirectoryByIds(userIds: string[]): Promise<AdminUserMiniRow[]> {
    const normalizedUserIds = normalizeUserIds(userIds)
    if (normalizedUserIds.length === 0) return []

    const { data, error } = await supabase.rpc('get_admin_user_directory_by_ids', {
        p_user_ids: normalizedUserIds,
    })

    if (error) throw error
    return ((data || []) as AdminUserMiniRow[]).filter((row) => typeof row?.id === 'string')
}

export async function findAdminUserIdsByUsername(search: string, limit = 200): Promise<string[]> {
    const normalizedSearch = search.trim()
    if (!normalizedSearch) return []

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 200
    const { data, error } = await supabase.rpc('find_admin_user_ids_by_username', {
        p_search: normalizedSearch,
        p_limit: safeLimit,
    })

    if (error) throw error

    return ((data || []) as Array<{ id?: string | null }>)
        .map((row) => row.id?.trim() || '')
        .filter(Boolean)
}

export async function getAdminReportUserTarget(userId: string): Promise<AdminReportUserTargetRow | null> {
    const normalizedUserId = userId.trim()
    if (!normalizedUserId) return null

    const { data, error } = await supabase.rpc('get_admin_report_user_target', {
        p_user_id: normalizedUserId,
    })

    if (error) throw error
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null

    return data as AdminReportUserTargetRow
}
