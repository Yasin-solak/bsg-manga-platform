import { getE2EAdminUserById, getE2EAdminUsersPage } from '@/testing/adminUsersE2e'
import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getAdminUserOverviewSnapshot } from './overviewSnapshot'
import { userProgressionPayloadSchema } from '../userProgressionService'
import type {
    AdminManagedUser,
    AdminPagedResult,
    AdminUserListParams,
    AdminUserOverview,
} from '../adminUserTypes'
import {
    DbAdminUserRow,
    escapeIlike,
    isUuid,
    mapDbAdminUserRow,
    mapRpcAdminUserRow,
    normalizePageAndLimit,
    sanitizeSearchTerm,
} from './shared'

const adminUserQueriesLogger = createScopedLogger('adminUserService.queries')
const isoTimestampSchema = z.string().datetime({ offset: true })
const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase())

const pageCursorSchema = z.object({
    createdAt: isoTimestampSchema,
    userId: uuidSchema,
}).strict()
const listParamsSchema = z.object({
    limit: z.number().int().min(1).max(20).optional(),
    search: z.string().max(160).optional(),
    view: z.enum(['all', 'admin', 'moderator', 'user', 'new', 'staff', 'banned', 'review']).optional(),
    role: z.enum(['all', 'admin', 'moderator', 'user']).optional(),
    verification: z.enum(['all', 'verified', 'unverified']).optional(),
    trust: z.enum(['all', 'trusted', 'standard', 'review', 'low']).optional(),
    fansub: z.enum(['all', 'member', 'none']).optional(),
    cursor: pageCursorSchema.optional(),
    page: z.number().int().min(1).optional(),
}).strict().superRefine((params, context) => {
    const page = params.page || 1
    if ((page > 1) !== Boolean(params.cursor)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cursor'],
            message: 'Ilk sayfadan sonraki sayfalarda cursor zorunludur.',
        })
    }
})

const trustPayloadSchema = z.object({
    score: z.number().min(0).max(100),
    band: z.enum(['trusted', 'standard', 'review', 'low']),
    confidence: z.enum(['low', 'medium', 'high']),
    reasonCodes: z.array(z.string()),
    components: z.record(z.union([z.number(), z.boolean()])),
    algorithmVersion: z.string().min(1),
    calculatedAt: isoTimestampSchema,
}).strict()
const primaryFansubPayloadSchema = z.object({
    id: uuidSchema,
    name: z.string().min(1),
    slug: z.string().min(1),
    role: z.enum(['admin', 'moderator', 'member']),
}).strict()
const managedUserPayloadSchema = z.object({
    id: uuidSchema,
    username: z.string().min(1),
    displayName: z.string().min(1).nullable().optional(),
    display_name: z.string().min(1).nullable().optional(),
    avatarUrl: z.string().nullable(),
    role: z.enum(['user', 'moderator', 'admin']),
    level: z.string().min(1),
    isVerified: z.boolean(),
    isBanned: z.boolean(),
    banReason: z.string().nullable(),
    banUntil: isoTimestampSchema.nullable(),
    bannedAt: isoTimestampSchema.nullable(),
    bannedBy: uuidSchema.nullable(),
    isActive: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    lastActivityAt: isoTimestampSchema.nullable(),
    lastSeenAt: isoTimestampSchema.nullable().optional(),
    presenceStatus: z.enum(['online', 'idle', 'offline', 'unknown', 'blocked']),
    trust: trustPayloadSchema,
    fansubCount: z.number().int().nonnegative(),
    primaryFansub: primaryFansubPayloadSchema.nullable(),
    progression: userProgressionPayloadSchema.optional(),
}).strict()
const pagePayloadSchema = z.object({
    generatedAt: isoTimestampSchema,
    items: z.array(managedUserPayloadSchema),
    total: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    nextCursor: pageCursorSchema.nullable().optional(),
}).strict()
const previewPayloadSchema = z.object({
    generatedAt: isoTimestampSchema,
    profile: z.object({
        id: uuidSchema,
        username: z.string().min(1),
        displayName: z.string().min(1).nullable().optional(),
        display_name: z.string().min(1).nullable().optional(),
        avatarUrl: z.string().nullable(),
        role: z.enum(['user', 'moderator', 'admin']),
        level: z.string().min(1),
        isVerified: z.boolean(),
        isBanned: z.boolean(),
        banReason: z.string().nullable(),
        banUntil: isoTimestampSchema.nullable(),
        bannedAt: isoTimestampSchema.nullable(),
        bannedBy: uuidSchema.nullable(),
        isActive: z.boolean(),
        createdAt: isoTimestampSchema,
        updatedAt: isoTimestampSchema,
    }).strict(),
    lastActivityAt: isoTimestampSchema.nullable(),
    presenceStatus: z.enum(['online', 'idle', 'offline', 'unknown', 'blocked']),
    trust: trustPayloadSchema,
    fansubMemberships: z.array(z.object({
        id: uuidSchema,
        name: z.string().min(1),
        slug: z.string().min(1),
        avatarUrl: z.string().nullable(),
        role: z.enum(['admin', 'moderator', 'member']),
        isActive: z.boolean(),
        joinedAt: isoTimestampSchema,
    }).strict()),
    capabilities: z.object({
        canBan: z.boolean(),
        canUnban: z.boolean(),
        canChangeRole: z.boolean(),
        banBlockedReason: z.enum(['self', 'already_banned', 'last_admin']).nullable(),
    }).strict(),
    progression: userProgressionPayloadSchema.optional(),
}).strict()

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.message?.includes('Could not find the function') === true
}

function normalizePagePayload(
    data: unknown,
    page: number,
    limit: number,
): AdminPagedResult<AdminManagedUser> {
    const unwrapped = Array.isArray(data) && data.length === 1 ? data[0] : data
    const payload = pagePayloadSchema.parse(unwrapped)
    const users = payload.items.map(mapRpcAdminUserRow)

    return {
        data: users,
        count: payload.total,
        page,
        limit,
        hasNext: payload.hasNext,
        nextCursor: payload.nextCursor || undefined,
    }
}

export async function fetchAdminUserById(userId: string): Promise<DbAdminUserRow> {
    const normalizedUserId = uuidSchema.parse(userId)
    const requestContext = createRequestContext('adminUserService.queries', 'fetch-admin-user-by-id', { userId: normalizedUserId })
    const withBanMeta = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('admin_user_directory')
                .select(
                    'id, username, avatar_url, role, is_banned, ban_reason, ban_until, banned_at, banned_by, is_active, created_at, updated_at',
                )
                .eq('id', normalizedUserId)
                .maybeSingle<DbAdminUserRow>(),
            signal,
        ),
        { label: 'Admin kullanicisini kimlige gore okuma' },
    )

    if (!withBanMeta.error && withBanMeta.data) return withBanMeta.data

    if (withBanMeta.error) {
        adminUserQueriesLogger.error({
            event: 'fetch-admin-user-by-id-failed',
            message: toUserFacingErrorMessage(withBanMeta.error, 'Admin kullanicisi yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error: withBanMeta.error,
        })
        throw withBanMeta.error
    }
    throw new Error('Kullanici bulunamadi.')
}

export async function fetchAdminUserPreview(userId: string): Promise<AdminManagedUser> {
    const normalizedUserId = uuidSchema.parse(userId)
    const e2eUser = getE2EAdminUserById(normalizedUserId)
    if (e2eUser) return e2eUser

    const preferred = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_admin_user_management_preview_v2', { p_user_id: normalizedUserId }),
            signal,
        ),
        { label: 'Secili admin kullanici onizlemesini yukleme' },
    )

    if (!preferred.error && preferred.data) {
        const payload = previewPayloadSchema.parse(
            Array.isArray(preferred.data) && preferred.data.length === 1 ? preferred.data[0] : preferred.data,
        )
        return mapRpcAdminUserRow(payload)
    }
    if (preferred.error && !isMissingRpcError(preferred.error)) throw preferred.error

    const legacy = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_admin_user_management_preview', { p_user_id: normalizedUserId }),
            signal,
        ),
        { label: 'Secili admin kullanici legacy onizlemesini yukleme' },
    )
    if (!legacy.error && legacy.data) {
        const payload = previewPayloadSchema.parse(
            Array.isArray(legacy.data) && legacy.data.length === 1 ? legacy.data[0] : legacy.data,
        )
        return mapRpcAdminUserRow(payload)
    }
    if (legacy.error && !isMissingRpcError(legacy.error)) throw legacy.error

    return mapDbAdminUserRow(await fetchAdminUserById(normalizedUserId))
}

async function listAdminUsersFallback(params: AdminUserListParams): Promise<AdminPagedResult<AdminManagedUser>> {
    const { page, limit } = normalizePageAndLimit(params.page, params.limit)
    const search = sanitizeSearchTerm(params.search)
    const role = params.view && ['admin', 'moderator', 'user'].includes(params.view)
        ? params.view
        : params.role || 'all'
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('admin_user_directory')
        .select(
            'id, username, avatar_url, role, is_banned, ban_reason, ban_until, banned_at, banned_by, is_active, created_at, updated_at',
            { count: 'exact' },
        )

    if (role !== 'all') query = query.eq('role', role)
    if (params.view === 'new') query = query.gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    if (params.view === 'staff') query = query.in('role', ['admin', 'moderator'])
    if (params.view === 'banned') query = query.eq('is_banned', true)
    if (search) {
        const escaped = escapeIlike(search)
        query = isUuid(search)
            ? query.or(`username.ilike.%${escaped}%,id.eq.${search}`)
            : query.ilike('username', `%${escaped}%`)
    }

    const { data, error, count } = await withServiceTimeout(
        (signal) => withAbortSignal(
            query
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to),
            signal,
        ),
        { label: 'Admin kullanicilarini uyumluluk sorgusuyla listeleme' },
    )
    if (error) throw error
    const users = ((data || []) as unknown as DbAdminUserRow[]).map(mapDbAdminUserRow)
    return {
        data: users,
        count: count || 0,
        page,
        limit,
        hasNext: from + users.length < (count || 0),
        nextCursor: users.length > 0
            ? { createdAt: users[users.length - 1].createdAt, userId: users[users.length - 1].id }
            : undefined,
    }
}

export async function listAdminUsersPage(params: AdminUserListParams = {}): Promise<AdminPagedResult<AdminManagedUser>> {
    const normalizedParams = listParamsSchema.parse(params)
    const e2ePage = getE2EAdminUsersPage(normalizedParams)
    if (e2ePage) return e2ePage

    const requestContext = createRequestContext('adminUserService.queries', 'list-admin-users-page')
    const { page, limit } = normalizePageAndLimit(normalizedParams.page, normalizedParams.limit)
    const search = sanitizeSearchTerm(normalizedParams.search)
    const cursor = normalizedParams.cursor
    const rpcParams = {
        p_limit: limit,
        p_search: search || null,
        p_view: normalizedParams.view || 'all',
        p_role: normalizedParams.role || 'all',
        p_verification: normalizedParams.verification || 'all',
        p_trust_band: normalizedParams.trust || 'all',
        p_fansub: normalizedParams.fansub || 'all',
        p_cursor_created_at: cursor?.createdAt || null,
        p_cursor_user_id: cursor?.userId || null,
    }
    const preferred = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('list_admin_user_management_page_v2', rpcParams),
            signal,
        ),
        { label: 'Admin kullanici yonetimi sayfasini yukleme' },
    )

    if (!preferred.error) return normalizePagePayload(preferred.data, page, limit)
    if (!isMissingRpcError(preferred.error)) {
        adminUserQueriesLogger.error({
            event: 'list-admin-users-page-failed',
            message: toUserFacingErrorMessage(preferred.error, 'Admin kullanici listesi yuklenemedi.'),
            context: toRequestContextLogContext(requestContext, { page, limit }),
            error: preferred.error,
        })
        throw preferred.error
    }

    const legacy = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('list_admin_user_management_page', rpcParams),
            signal,
        ),
        { label: 'Admin kullanici yonetimi legacy sayfasini yukleme' },
    )
    if (!legacy.error) return normalizePagePayload(legacy.data, page, limit)
    if (isMissingRpcError(legacy.error)) {
        const hasUnsupportedLegacyFilter = normalizedParams.verification && normalizedParams.verification !== 'all'
            || normalizedParams.trust && normalizedParams.trust !== 'all'
            || normalizedParams.fansub && normalizedParams.fansub !== 'all'
            || Boolean(normalizedParams.cursor)
            || search.includes('@')
        if (hasUnsupportedLegacyFilter) {
            throw new Error('Bu arama, filtre veya sayfalama icin admin user management migrationlari uygulanmalidir.')
        }
        return listAdminUsersFallback(normalizedParams)
    }

    adminUserQueriesLogger.error({
        event: 'list-admin-users-page-failed',
        message: toUserFacingErrorMessage(legacy.error, 'Admin kullanici listesi yuklenemedi.'),
        context: toRequestContextLogContext(requestContext, { page, limit }),
        error: legacy.error,
    })
    throw legacy.error
}

export async function getAdminUserOverview(): Promise<AdminUserOverview> {
    const requestContext = createRequestContext('adminUserService.queries', 'get-admin-user-overview')
    try {
        return await getAdminUserOverviewSnapshot()
    } catch (error) {
        adminUserQueriesLogger.error({
            event: 'get-admin-user-overview-failed',
            message: toUserFacingErrorMessage(error, 'Admin kullanici ozeti yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error: error as unknown,
        })
        throw error
    }
}
