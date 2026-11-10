/**
 * List management summary and computed views.
 *
 * **Why from the server:** the panel calculated "Public / Private" counts from the visible
 * PAGE (12 per page). With 23 lists "Public" showed ~9 instead of 18,
 * the same bug fixed in manga control.
 *
 * **Denormalized counters are not trusted:** `user_manga_lists.comments_count`
 * disagrees with the real count on 1 live row. The server counts everything from source
 * tables and returns the drift itself as `counterDrift`.
 */

import { z } from 'zod'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { AdminListControlOverview, AdminMangaListComputedView } from './types'

const OVERVIEW_TTL_MS = 1_500

let overviewCache: { value: AdminListControlOverview; expiresAt: number } | null = null
let overviewInFlight: Promise<AdminListControlOverview | null> | null = null

const overviewSchema = z.object({
    generatedAt: z.string(),
    total: z.number().int().nonnegative(),
    publicLists: z.number().int().nonnegative(),
    privateLists: z.number().int().nonnegative(),
    emptyLists: z.number().int().nonnegative(),
    withoutCover: z.number().int().nonnegative(),
    owners: z.number().int().nonnegative(),
    itemsTotal: z.number().int().nonnegative(),
    commentsTotal: z.number().int().nonnegative(),
    commentsInactive: z.number().int().nonnegative(),
    commentsSpoiler: z.number().int().nonnegative(),
    listsWithInactiveComments: z.number().int().nonnegative(),
    ratingsTotal: z.number().int().nonnegative(),
    ratingAverage: z.number().nullable(),
    counterDrift: z.number().int().nonnegative(),
    newListsCurrent: z.number().int().nonnegative(),
    newListsPrevious: z.number().int().nonnegative(),
    newListsDelta: z.number().int(),
    newListsDeltaPercent: z.number().nullable(),
}).strict()

/**
 * Without permission or if the RPC is not deployed yet, the panel should work without a summary.
 * Rely on the TOLERATED CODES, not the function name.
 */
function isRecoverableError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.code === '42501'
        || error?.message?.includes('Could not find the function') === true
        || error?.message?.includes('permission denied') === true
}

function unwrap(data: unknown) {
    return Array.isArray(data) && data.length === 1 ? data[0] : data
}

export function clearAdminListControlOverviewCache() {
    overviewCache = null
}

export async function getAdminListControlOverview(
    options: { force?: boolean } = {},
): Promise<AdminListControlOverview | null> {
    const now = Date.now()
    if (!options.force && overviewCache && overviewCache.expiresAt > now) return overviewCache.value
    if (!options.force && overviewInFlight) return overviewInFlight

    const request = withServiceTimeout(
        async () => {
            const { data, error } = await supabase.rpc('get_admin_list_control_overview')
            if (error) {
                if (isRecoverableError(error)) return null
                throw error
            }
            const value = overviewSchema.parse(unwrap(data))
            overviewCache = { value, expiresAt: Date.now() + OVERVIEW_TTL_MS }
            return value
        },
        { label: 'Admin liste ozetini yukleme' },
    )

    const inFlight = request.finally(() => {
        if (overviewInFlight === inFlight) overviewInFlight = null
    })
    overviewInFlight = inFlight

    return inFlight
}

/**
 * Page-scoped ids for computed views.
 *
 * "Empty list" is an anti-join, "pending moderation" an EXISTS; PostgREST
 * can express neither. Since sorting and pagination are on the server, only
 * that page's ids go over the wire.
 */
export async function fetchAdminListComputedViewPage(input: {
    view: AdminMangaListComputedView
    search: string
    visibility: string
    limit: number
    offset: number
}): Promise<{ ids: string[]; total: number }> {
    const { data, error } = await withServiceTimeout(
        () => supabase.rpc('get_admin_list_control_view_page', {
            p_view: input.view,
            p_search: input.search || null,
            p_visibility: input.visibility,
            p_limit: input.limit,
            p_offset: input.offset,
        }),
        { label: 'Hesaplanmis liste gorunumunu yukleme' },
    )

    if (error) {
        // Raw Postgres text ("permission denied for function ...") should not be
        // shown to the user.
        if (error.code === '42501' || error.message?.includes('permission denied')) {
            throw new Error('Bu gorunum icin admin yetkisi gerekiyor.')
        }
        if (isRecoverableError(error)) {
            throw new Error('Bu gorunum henuz kullanilamiyor; veritabani guncellemesi bekleniyor.')
        }
        throw error
    }

    const payload = unwrap(data) as { ids?: unknown; total?: unknown } | null
    const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : []
    const total = typeof payload?.total === 'number' ? payload.total : 0
    return { ids, total }
}
