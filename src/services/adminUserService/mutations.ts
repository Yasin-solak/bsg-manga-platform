import { z } from 'zod'
import { setE2EAdminUsersBanState, updateE2EAdminUserRole } from '@/testing/adminUsersE2e'
import { invalidateAdminUserDetailCache } from '../adminUserDetailService'
import { supabase } from '../supabase'
import type {
    AdminManagedUser,
    AdminUserBulkMutationItem,
    AdminUserBulkMutationResult,
    AdminUserRole,
} from '../adminUserTypes'
import { fetchAdminUserPreview } from './queries'
import { clearAdminUserOverviewSnapshotCache } from './overviewSnapshot'

const roleSchema = z.enum(['user', 'moderator', 'admin'])
const uuidSchema = z.string()
    .uuid('Gecersiz kullanici kimligi.')
    .transform((value) => value.toLowerCase())
const bulkBanSchema = z.object({
    userIds: z.array(uuidSchema).min(1, 'En az bir kullanici secilmelidir.').max(100, 'Tek seferde en fazla 100 kullanici islenebilir.'),
    isBanned: z.boolean(),
    reason: z.string().trim().max(500, 'Ban nedeni en fazla 500 karakter olabilir.').optional(),
    banUntil: z.string().trim().optional(),
}).strict().superRefine((input, context) => {
    if (input.isBanned && (input.reason?.length || 0) < 3) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Ban nedeni en az 3 karakter olmalidir.' })
    }
    if (!input.isBanned || !input.banUntil) return
    const timestamp = new Date(input.banUntil).getTime()
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['banUntil'], message: 'Ban bitis tarihi gelecekte olmali.' })
    }
})

const bulkMutationItemSchema = z.object({
    userId: uuidSchema,
    status: z.enum(['updated', 'unchanged', 'not_found', 'self_rejected', 'last_admin_rejected']),
}).strict()

const bulkMutationResultSchema = z.object({
    requested: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    items: z.array(bulkMutationItemSchema),
}).strict().superRefine((result, context) => {
    if (result.requested !== result.items.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['requested'], message: 'Toplu islem sonuc sayisi tutarsiz.' })
    }
    if (result.updated + result.unchanged + result.rejected !== result.requested) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Toplu islem durum toplamlari tutarsiz.' })
    }
})

function createMissingAdminMutationError(rpcName: 'set_user_role' | 'set_user_ban_state' | 'set_admin_users_ban_state') {
    return new Error(`${rpcName} RPC bulunamadi. Ilgili SQL migration'i uygulanmamis olabilir.`)
}

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.message?.includes('Could not find the function') === true
}

function createLegacySingleMutationResult(userId: string): AdminUserBulkMutationResult {
    const items: AdminUserBulkMutationItem[] = [{ userId, status: 'updated' }]
    return { requested: 1, updated: 1, unchanged: 0, rejected: 0, items }
}

function normalizeBulkMutationResult(data: unknown, requestedIds: string[]): AdminUserBulkMutationResult {
    const payload = Array.isArray(data) && data.length === 1 ? data[0] : data
    const result = bulkMutationResultSchema.parse(payload)
    const expectedIds = new Set(requestedIds)
    const resultIds = new Set(result.items.map((item) => item.userId))
    const hasUnexpectedId = result.items.some((item) => !expectedIds.has(item.userId))
    if (resultIds.size !== result.items.length || resultIds.size !== expectedIds.size || hasUnexpectedId) {
        throw new Error('Toplu islem sonucu istenen kullanici kimlikleriyle eslesmiyor.')
    }

    const updated = result.items.filter((item) => item.status === 'updated').length
    const unchanged = result.items.filter((item) => item.status === 'unchanged').length
    const rejected = result.items.length - updated - unchanged
    if (result.updated !== updated || result.unchanged !== unchanged || result.rejected !== rejected) {
        throw new Error('Toplu islem sonuc sayaclari hedef durumlariyla eslesmiyor.')
    }
    return result
}

function clearAdminUserMutationCaches(userIds: string[]) {
    clearAdminUserOverviewSnapshotCache()
    userIds.forEach((userId) => invalidateAdminUserDetailCache(userId))
}

export async function updateAdminUserRole(userId: string, role: AdminUserRole): Promise<AdminManagedUser> {
    const normalizedUserId = uuidSchema.parse(userId)
    const normalizedRole = roleSchema.parse(role)
    const e2eUser = updateE2EAdminUserRole(normalizedUserId, normalizedRole)
    if (e2eUser) {
        clearAdminUserMutationCaches([normalizedUserId])
        return e2eUser
    }

    const { error } = await supabase.rpc('set_user_role', {
        p_user_id: normalizedUserId,
        p_role: normalizedRole,
    })

    if (error) {
        if (isMissingRpcError(error)) throw createMissingAdminMutationError('set_user_role')
        throw error
    }

    clearAdminUserMutationCaches([normalizedUserId])
    return fetchAdminUserPreview(normalizedUserId)
}

export async function setAdminUsersBanState(input: {
    userIds: string[]
    isBanned: boolean
    reason?: string
    banUntil?: string
}): Promise<AdminUserBulkMutationResult> {
    const normalized = bulkBanSchema.parse(input)
    const userIds = [...new Set(normalized.userIds)]
    const reason = normalized.reason || ''
    const banUntil = normalized.banUntil ? new Date(normalized.banUntil).toISOString() : undefined
    const e2eResult = setE2EAdminUsersBanState(userIds, normalized.isBanned, reason, banUntil)
    if (e2eResult) {
        clearAdminUserMutationCaches(userIds)
        return normalizeBulkMutationResult(e2eResult, userIds)
    }

    const { data, error } = await supabase.rpc('set_admin_users_ban_state', {
        p_user_ids: userIds,
        p_is_banned: normalized.isBanned,
        p_reason: normalized.isBanned ? reason : null,
        p_ban_until: normalized.isBanned ? banUntil || null : null,
    })

    if (error) {
        // The legacy RPC lacks the last-admin guarantee, so the ban path stays fail-closed without the migration.
        if (isMissingRpcError(error) && userIds.length === 1 && !normalized.isBanned) {
            const fallback = await supabase.rpc('set_user_ban_state', {
                p_user_id: userIds[0],
                p_is_banned: normalized.isBanned,
                p_ban_reason: normalized.isBanned ? reason : null,
                p_ban_until: normalized.isBanned ? banUntil || null : null,
            })
            if (fallback.error) {
                if (isMissingRpcError(fallback.error)) throw createMissingAdminMutationError('set_user_ban_state')
                throw fallback.error
            }
            clearAdminUserMutationCaches(userIds)
            return createLegacySingleMutationResult(userIds[0])
        }
        if (isMissingRpcError(error)) throw createMissingAdminMutationError('set_admin_users_ban_state')
        throw error
    }

    clearAdminUserMutationCaches(userIds)
    return normalizeBulkMutationResult(data, userIds)
}

export async function setAdminUserBanState(input: {
    userId: string
    isBanned: boolean
    reason?: string
    banUntil?: string
}): Promise<AdminManagedUser> {
    const normalizedUserId = uuidSchema.parse(input.userId)
    const result = await setAdminUsersBanState({
        userIds: [normalizedUserId],
        isBanned: input.isBanned,
        reason: input.reason,
        banUntil: input.banUntil,
    })
    const item = result.items.find((candidate) => candidate.userId === normalizedUserId)
    if (!item || item.status === 'not_found') throw new Error('Kullanici bulunamadi.')
    if (item.status === 'self_rejected') throw new Error('Kendi hesabini banlayamazsin.')
    if (item.status === 'last_admin_rejected') throw new Error('Son kullanilabilir admin banlanamaz.')

    const user = await fetchAdminUserPreview(normalizedUserId)
    if (user.isBanned !== input.isBanned) {
        throw new Error('Kullanici ban durumu beklenen degerle eslesmedi.')
    }
    return user
}
