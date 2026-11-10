/**
 * Manga control panel summary.
 *
 * **Why from the server:** the panel used to calculate the summary from the visible PAGE
 * (`mangas.reduce`). With a 96-manga catalog showing a page of 20 it said
 * "Approved: 20": the number looked right but did not represent the whole catalog.
 * User management already does this with one server function;
 * the same pattern applies here (see `adminUserService/overviewSnapshot`).
 *
 * TTL + in-flight dedupe for the same reason: the metric strip, filter card and
 * auto refresh can request the summary at once; this reduces it to one call.
 */

import { z } from 'zod'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { AdminMangaControlOverview } from './types'

const OVERVIEW_SNAPSHOT_TTL_MS = 1_500

let overviewCache: { value: AdminMangaControlOverview; expiresAt: number } | null = null
let overviewInFlight: Promise<AdminMangaControlOverview> | null = null

const overviewSchema = z.object({
    generatedAt: z.string().datetime({ offset: true }),
    total: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    inactive: z.number().int().nonnegative(),
    withoutFansub: z.number().int().nonnegative(),
    withoutChapters: z.number().int().nonnegative(),
    incompleteMeta: z.number().int().nonnegative(),
    pendingChapterSeries: z.number().int().nonnegative(),
    chaptersTotal: z.number().int().nonnegative(),
    chaptersPending: z.number().int().nonnegative(),
    chaptersScheduled: z.number().int().nonnegative(),
    chaptersWithoutFansub: z.number().int().nonnegative(),
    newMangasCurrent: z.number().int().nonnegative(),
    newMangasPrevious: z.number().int().nonnegative(),
    newMangasDelta: z.number().int(),
    newMangasDeltaPercent: z.number().nullable(),
}).strict()

function unwrapPayload(data: unknown) {
    return Array.isArray(data) && data.length === 1 ? data[0] : data
}

/**
 * The RPC may not be deployed yet (migration/deploy order). The panel should then work
 * without a summary; the caller sees null and shows metrics as "—".
 */
function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.message?.includes('Could not find the function') === true
}

async function loadOverview(): Promise<AdminMangaControlOverview | null> {
    const { data, error } = await supabase.rpc('get_admin_manga_control_overview')
    if (error) {
        if (isMissingRpcError(error)) return null
        throw error
    }
    return overviewSchema.parse(unwrapPayload(data))
}

export function clearAdminMangaControlOverviewCache() {
    overviewCache = null
}

export async function getAdminMangaControlOverview(
    options: { force?: boolean } = {},
): Promise<AdminMangaControlOverview | null> {
    const now = Date.now()
    if (!options.force && overviewCache && overviewCache.expiresAt > now) return overviewCache.value
    if (!options.force && overviewInFlight) return overviewInFlight

    const request = withServiceTimeout(
        async () => {
            const value = await loadOverview()
            if (value) overviewCache = { value, expiresAt: Date.now() + OVERVIEW_SNAPSHOT_TTL_MS }
            return value
        },
        { label: 'Admin manga kontrol ozetini yukleme' },
    )

    const inFlight = request.finally(() => {
        if (overviewInFlight === inFlight) overviewInFlight = null
    }) as Promise<AdminMangaControlOverview | null>
    overviewInFlight = inFlight as Promise<AdminMangaControlOverview>

    return inFlight
}
