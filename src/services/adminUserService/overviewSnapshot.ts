import { getE2EAdminUserOverview } from '@/testing/adminUsersE2e'
import { z } from 'zod'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { AdminUserOverview } from '../adminUserTypes'

const ADMIN_USER_OVERVIEW_SNAPSHOT_TTL_MS = 1_500

let adminUserOverviewSnapshotCache: {
    value: AdminUserOverview
    expiresAt: number
} | null = null
let adminUserOverviewSnapshotInFlight: Promise<AdminUserOverview> | null = null
const isoTimestampSchema = z.string().datetime({ offset: true })

const managementOverviewSchema = z.object({
    generatedAt: isoTimestampSchema,
    total: z.number().int().nonnegative(),
    activeLast30Days: z.number().int().nonnegative(),
    onlineNow: z.number().int().nonnegative(),
    admins: z.number().int().nonnegative(),
    moderators: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    lowTrustReview: z.number().int().nonnegative(),
    // Kullanicilar v2 (20261103140000): aktif banli hesap sayisi.
    banned: z.number().int().nonnegative().optional(),
    newUsersCurrent: z.number().int().nonnegative(),
    newUsersPrevious: z.number().int().nonnegative(),
    newUsersDelta: z.number().int(),
    newUsersDeltaPercent: z.number().nullable(),
}).strict()

const legacyOverviewSchema = z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    banned: z.number().int().nonnegative(),
    admins: z.number().int().nonnegative(),
    moderators: z.number().int().nonnegative(),
}).strict()

function unwrapPayload(data: unknown) {
    return Array.isArray(data) && data.length === 1 ? data[0] : data
}

function normalizeManagementOverview(data: unknown): AdminUserOverview {
    const row = managementOverviewSchema.parse(unwrapPayload(data))
    return {
        ...row,
        newUsersDeltaPercent: row.newUsersDeltaPercent ?? undefined,
        active: row.activeLast30Days,
    }
}

function normalizeLegacyOverview(data: unknown): AdminUserOverview {
    const row = legacyOverviewSchema.parse(unwrapPayload(data))
    return {
        ...row,
        generatedAt: new Date().toISOString(),
    }
}

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.message?.includes('Could not find the function') === true
}

async function loadAdminUserOverview(): Promise<AdminUserOverview> {
    const e2eOverview = getE2EAdminUserOverview()
    if (e2eOverview) return e2eOverview

    const managementResult = await supabase.rpc('get_admin_user_management_overview')
    if (!managementResult.error) return normalizeManagementOverview(managementResult.data)
    if (!isMissingRpcError(managementResult.error)) throw managementResult.error

    const fallbackResult = await supabase.rpc('get_admin_user_overview_counts')
    if (fallbackResult.error) throw fallbackResult.error
    return normalizeLegacyOverview(fallbackResult.data)
}

export function clearAdminUserOverviewSnapshotCache() {
    adminUserOverviewSnapshotCache = null
}

export async function getAdminUserOverviewSnapshot(options: { force?: boolean } = {}): Promise<AdminUserOverview> {
    const now = Date.now()
    if (!options.force && adminUserOverviewSnapshotCache && adminUserOverviewSnapshotCache.expiresAt > now) {
        return adminUserOverviewSnapshotCache.value
    }

    if (!options.force && adminUserOverviewSnapshotInFlight) {
        return adminUserOverviewSnapshotInFlight
    }

    const request = withServiceTimeout(
        async () => {
            const value = await loadAdminUserOverview()
            adminUserOverviewSnapshotCache = {
                value,
                expiresAt: Date.now() + ADMIN_USER_OVERVIEW_SNAPSHOT_TTL_MS,
            }
            return value
        },
        { label: 'Admin kullanici overview snapshotini yukleme' },
    )

    const inFlight = request.finally(() => {
        if (adminUserOverviewSnapshotInFlight === inFlight) {
            adminUserOverviewSnapshotInFlight = null
        }
    })
    adminUserOverviewSnapshotInFlight = inFlight

    return adminUserOverviewSnapshotInFlight
}
