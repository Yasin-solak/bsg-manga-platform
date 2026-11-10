import { supabase } from '../supabase'
import {
    type DbAdminFansubInventoryRow,
    type DbAdminFansubTransactionRow,
    findStoreItemIdsBySearch,
    findUserIdsByUsernameSearch,
    mapDbAdminFansubInventoryRow,
    mapDbAdminFansubTransactionRow,
    normalizePageAndLimit,
    sanitizeSearchTerm,
} from './shared'
import type {
    AdminFansubInventoryItem,
    AdminFansubInventoryListParams,
    AdminFansubTransactionListParams,
    AdminFansubTransactionRecord,
    AdminPagedResult,
} from './types'

export async function listAdminFansubInventoryPage(
    fansubId: string,
    params: AdminFansubInventoryListParams = {},
): Promise<AdminPagedResult<AdminFansubInventoryItem>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const search = sanitizeSearchTerm(params.search)
    const from = (page - 1) * limit
    const to = from + limit - 1
    const matchedStoreItemIds = search ? await findStoreItemIdsBySearch(search) : []
    const matchedUserIds = search ? await findUserIdsByUsernameSearch(search) : []

    let query = supabase
        .from('fansub_inventory')
        .select(`
            id,
            fansub_id,
            store_item_id,
            acquired_at,
            acquired_by,
            store_item:store_item_id (
                id,
                name,
                type,
                identifier,
                image_key,
                custom_asset_url,
                is_active
            ),
            acquired_by_user:acquired_by (
                id,
                username,
                avatar_url
            )
        `, { count: 'exact' })
        .eq('fansub_id', fansubId)
        .order('acquired_at', { ascending: false })

    if (search) {
        const clauses = [] as string[]
        if (matchedStoreItemIds.length > 0) {
            clauses.push(`store_item_id.in.(${matchedStoreItemIds.join(',')})`)
        }
        if (matchedUserIds.length > 0) {
            clauses.push(`acquired_by.in.(${matchedUserIds.join(',')})`)
        }

        if (clauses.length === 0) {
            return {
                data: [],
                count: 0,
                page,
                limit,
            }
        }

        query = query.or(clauses.join(','))
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
        console.error('[adminService] listAdminFansubInventoryPage error', error)
        throw error
    }

    return {
        data: (data as DbAdminFansubInventoryRow[]).map(mapDbAdminFansubInventoryRow),
        count: count || 0,
        page,
        limit,
    }
}

export async function listAdminFansubTransactionsPage(
    fansubId: string,
    params: AdminFansubTransactionListParams = {},
): Promise<AdminPagedResult<AdminFansubTransactionRecord>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const search = sanitizeSearchTerm(params.search)
    const type = params.type || 'all'
    const from = (page - 1) * limit
    const to = from + limit - 1
    const matchedStoreItemIds = search ? await findStoreItemIdsBySearch(search) : []
    const matchedUserIds = search ? await findUserIdsByUsernameSearch(search) : []

    let query = supabase
        .from('fansub_transactions')
        .select(`
            id,
            fansub_id,
            amount,
            type,
            description,
            related_item_id,
            created_by,
            created_at,
            related_item:related_item_id (
                id,
                name,
                type,
                identifier,
                image_key,
                custom_asset_url,
                is_active
            ),
            created_by_user:created_by (
                id,
                username,
                avatar_url
            )
        `, { count: 'exact' })
        .eq('fansub_id', fansubId)
        .order('created_at', { ascending: false })

    if (type !== 'all') {
        query = query.eq('type', type)
    }

    if (search) {
        const clauses = [`description.ilike.%${search}%`]
        if (matchedStoreItemIds.length > 0) {
            clauses.push(`related_item_id.in.(${matchedStoreItemIds.join(',')})`)
        }
        if (matchedUserIds.length > 0) {
            clauses.push(`created_by.in.(${matchedUserIds.join(',')})`)
        }
        query = query.or(clauses.join(','))
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
        console.error('[adminService] listAdminFansubTransactionsPage error', error)
        throw error
    }

    return {
        data: (data as DbAdminFansubTransactionRow[]).map(mapDbAdminFansubTransactionRow),
        count: count || 0,
        page,
        limit,
    }
}
