/**
 * Admin metrics for one manga.
 *
 * Until now the detail window showed only the list summary (chapter
 * count, views, rating). As an admin surface we can gather much more, and most of it
 * CHANGES DECISIONS: publishing pace, chapters with no pages (broken),
 * real reader count, monthly trend.
 *
 * NO cache: one call per window, and we want fresh values as the admin acts (approval,
 * activation). A seconds-long TTL like the summary snapshot would
 * mislead here.
 */

import { z } from 'zod'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { AdminMangaDetailMetrics } from './types'

const metricsSchema = z.object({
    generatedAt: z.string(),
    readersTotal: z.number().int().nonnegative(),
    readers30d: z.number().int().nonnegative(),
    lastReadAt: z.string().nullable(),
    followers: z.number().int().nonnegative(),
    viewsCurrentMonth: z.number().int().nonnegative(),
    viewsPreviousMonth: z.number().int().nonnegative(),
    chapterNumbers: z.number().int().nonnegative(),
    chapterVersions: z.number().int().nonnegative(),
    pendingChapters: z.number().int().nonnegative(),
    scheduledChapters: z.number().int().nonnegative(),
    inactiveChapters: z.number().int().nonnegative(),
    emptyPageChapters: z.number().int().nonnegative(),
    pagesTotal: z.number().int().nonnegative(),
    firstChapterAt: z.string().nullable(),
    lastChapterAt: z.string().nullable(),
    avgChapterIntervalDays: z.number().nullable(),
    contributorFansubs: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    commentsInactive: z.number().int().nonnegative(),
    commentsSpoiler: z.number().int().nonnegative(),
    ratings: z.number().int().nonnegative(),
    ratingAverage: z.number().nullable(),
}).strict()

function isRecoverableError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42883'
        || error?.code === 'PGRST202'
        || error?.code === '42501'
        || error?.message?.includes('Could not find the function') === true
        || error?.message?.includes('permission denied') === true
}

/**
 * Without metrics the window must keep working: null is returned if the RPC is not deployed yet or
 * the session is not admin, and fields show "—".
 */
export async function getAdminMangaDetailMetrics(mangaId: string): Promise<AdminMangaDetailMetrics | null> {
    const { data, error } = await withServiceTimeout(
        () => supabase.rpc('get_admin_manga_detail_metrics', { p_manga_id: mangaId }),
        { label: 'Manga detay metriklerini yukleme' },
    )

    if (error) {
        if (isRecoverableError(error)) return null
        throw error
    }

    const payload = Array.isArray(data) && data.length === 1 ? data[0] : data
    if (!payload) return null
    return metricsSchema.parse(payload)
}

/**
 * Page count per chapter.
 *
 * Without a visible page count during review, a half-finished upload goes
 * unnoticed. Page URLs are not sent to the client; the RPC returns only counts.
 */
export async function getAdminMangaChapterPageCounts(mangaId: string): Promise<Record<string, number>> {
    const { data, error } = await withServiceTimeout(
        () => supabase.rpc('get_admin_manga_chapter_page_counts', { p_manga_id: mangaId }),
        { label: 'Bolum sayfa sayilarini yukleme' },
    )

    if (error) {
        // Same tolerance as metrics: without it the page count is hidden and the window works.
        if (isRecoverableError(error)) return {}
        throw error
    }

    const payload = (Array.isArray(data) && data.length === 1 ? data[0] : data) as Record<string, unknown> | null
    if (!payload || typeof payload !== 'object') return {}

    const result: Record<string, number> = {}
    for (const [chapterId, value] of Object.entries(payload)) {
        if (typeof value === 'number' && Number.isFinite(value)) result[chapterId] = value
    }
    return result
}
