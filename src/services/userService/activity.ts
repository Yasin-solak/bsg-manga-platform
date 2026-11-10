import { supabase } from '../supabase'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'

const ACTIVE_APPROVED_MANGA_JOIN = 'manga:mangas!inner(id, title, slug, cover_image_url, genres, status, rating, total_views, last_chapter_number, is_active, is_approved)'
const userActivityLogger = createScopedLogger('userService/activity')

export interface UserActivityFeedItem {
    id: string
    type: 'comment' | 'read'
    mangaId?: string
    mangaSlug?: string
    mangaTitle?: string
    mangaCoverImageUrl?: string | null
    chapterId?: string | null
    chapterNumber?: number
    commentId?: string
    targetLabel?: string
    timestamp: string
}
export async function getReadingHistory(userId: string) {
    const { data, error } = await supabase
        .from('reading_history')
        .select(
            `
                id,
                manga_id,
                chapter_id,
                chapter_number,
                read_at,
                ${ACTIVE_APPROVED_MANGA_JOIN}
            `,
        )
        .eq('user_id', userId)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .order('read_at', { ascending: false })
        .limit(20)

    if (error) throw error
    return data
}

export async function getReadingStreakDays(userId: string) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_current_user_reading_streak')
    if (!rpcError) {
        const streak = Number(rpcData || 0)
        return Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0
    }

    const { data, error } = await supabase
        .from('reading_history')
        .select('read_at')
        .eq('user_id', userId)
        .order('read_at', { ascending: false })
        .limit(365)

    if (error) throw error
    return resolveReadingStreakDaysFromRows(data || [])
}

export async function getLatestReadingHistoryForManga(
    userId: string,
    mangaId: string,
    signal?: AbortSignal,
) {
    const { data, error } = await withServiceTimeout(
        (timeoutSignal) => withAbortSignal(
            supabase
                .from('reading_history')
                .select(
                    `
                        id,
                        manga_id,
                        chapter_id,
                        chapter_number,
                        read_at,
                        ${ACTIVE_APPROVED_MANGA_JOIN}
                    `,
                )
                .eq('user_id', userId)
                .eq('manga_id', mangaId)
                .eq('manga.is_active', true)
                .eq('manga.is_approved', true)
                .order('read_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            timeoutSignal,
        ),
        { label: 'Kaldigin manga gecmisini yukleme', signal },
    )

    if (error) throw error
    return data
}

export async function getFollowedMangas(userId: string) {
    const { data, error } = await supabase
        .from('manga_follows')
        .select(
            `
                user_id,
                manga_id,
                created_at,
                ${ACTIVE_APPROVED_MANGA_JOIN}
            `,
        )
        .eq('user_id', userId)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data
}

type RecentReadingHistory = Awaited<ReturnType<typeof getReadingHistory>>

export async function getActivityFeed(userId: string, options?: { recentHistory?: RecentReadingHistory | null }): Promise<UserActivityFeedItem[]> {
    const { data: comments, error: commentsError } = await supabase
        .from('manga_comments')
        .select(
            `
                id,
                content,
                created_at,
                is_active,
                manga_id,
                ${ACTIVE_APPROVED_MANGA_JOIN}
            `,
        )
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .order('created_at', { ascending: false })
        .limit(10)

    if (commentsError) throw commentsError

    const history = options?.recentHistory?.slice(0, 10)
    let fallbackHistory: RecentReadingHistory | null = null

    if (!history) {
        const { data, error: historyError } = await supabase
            .from('reading_history')
            .select(
                `
                    id,
                    manga_id,
                    chapter_id,
                    chapter_number,
                    read_at,
                    ${ACTIVE_APPROVED_MANGA_JOIN}
                `,
            )
            .eq('user_id', userId)
            .eq('manga.is_active', true)
            .eq('manga.is_approved', true)
            .order('read_at', { ascending: false })
            .limit(10)

        if (historyError) throw historyError
        fallbackHistory = data
    }

    const activities: UserActivityFeedItem[] = [
        ...(comments || []).map((c: any): UserActivityFeedItem => ({
            id: c.id,
            commentId: c.id,
            type: 'comment',
            mangaId: c.manga?.id,
            mangaSlug: c.manga?.slug,
            mangaTitle: c.manga?.title,
            mangaCoverImageUrl: c.manga?.cover_image_url,
            targetLabel: c.content,
            timestamp: c.created_at,
        })),
        ...((history || fallbackHistory || []) as any[]).map((h: any): UserActivityFeedItem => ({
            id: h.id,
            type: 'read',
            mangaId: h.manga?.id,
            mangaSlug: h.manga?.slug,
            mangaTitle: h.manga?.title,
            mangaCoverImageUrl: h.manga?.cover_image_url,
            chapterId: h.chapter_id,
            chapterNumber: h.chapter_number,
            timestamp: h.read_at,
        })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return activities
}

export async function addReadingHistory(userId: string, mangaId: string, chapterId: string, chapterNumber: number) {
    const { error } = await supabase.from('reading_history').upsert({
        user_id: userId,
        manga_id: mangaId,
        chapter_id: chapterId,
        chapter_number: chapterNumber,
        read_at: new Date().toISOString(),
        // The chapter may have changed: the previous chapter's page position does not belong to the new
        // one. Since this runs near entry, resetting here is right;
        // this chapter's position is rewritten at the first exit point.
        page_index: null,
        page_count: null,
        position_at: null,
    }, {
        onConflict: 'user_id,manga_id',
    })

    if (error) userActivityLogger.error({ event: 'add-reading-history-error', error })
}

export interface RemoteReadingPosition {
    chapterId: string
    pageIndex: number
    pageCount: number | null
    positionAt: string
}

/**
 * Cross-device position read.
 *
 * With ONE row per manga this is a single lookup on a unique index.
 * If the row belongs to another chapter, the position is invalid for this chapter.
 */
export async function getRemoteReadingPosition(
    userId: string,
    mangaId: string,
    chapterId: string,
): Promise<RemoteReadingPosition | null> {
    const { data, error } = await supabase
        .from('reading_history')
        .select('chapter_id, page_index, page_count, position_at')
        .eq('user_id', userId)
        .eq('manga_id', mangaId)
        .maybeSingle()

    if (error) {
        // If the columns do not exist yet (migration/deploy order), reads are silently
        // disabled; the local position keeps working.
        userActivityLogger.error({ event: 'remote-reading-position-error', error })
        return null
    }

    if (!data || data.chapter_id !== chapterId) return null
    if (typeof data.page_index !== 'number' || !data.position_at) return null

    return {
        chapterId: data.chapter_id,
        pageIndex: data.page_index,
        pageCount: typeof data.page_count === 'number' ? data.page_count : null,
        positionAt: data.position_at,
    }
}

/**
 * Cross-device position write (SPARSE: only at exit points).
 *
 * `chapter_id` equality is deliberately a condition: if the user moved to another chapter
 * meanwhile, this write matches no row and does not overwrite the new chapter's position
 * with the OLD chapter's page.
 */
export async function saveRemoteReadingPosition(input: {
    userId: string
    mangaId: string
    chapterId: string
    pageIndex: number
    pageCount: number
}) {
    const { error } = await supabase
        .from('reading_history')
        .update({
            page_index: input.pageIndex,
            page_count: input.pageCount,
            position_at: new Date().toISOString(),
        })
        .eq('user_id', input.userId)
        .eq('manga_id', input.mangaId)
        .eq('chapter_id', input.chapterId)

    if (error) userActivityLogger.error({ event: 'save-reading-position-error', error })
}

export async function getUserStats(
    userId: string,
    signal?: AbortSignal,
) {
    const { data, error } = await withServiceTimeout(
        (timeoutSignal) => withAbortSignal(
            supabase.rpc('get_public_profile_stats', {
                p_user_id: userId,
            }),
            timeoutSignal,
        ),
        { label: 'Kullanici profil istatistiklerini yukleme', signal },
    )

    if (error) throw error

    const payload = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
    const readingCount = Number(payload?.reading || 0)
    const commentsCount = Number(payload?.comments || 0)
    const followersCount = Number(payload?.followers || 0)
    const followingCount = Number(payload?.following || 0)
    const timeSpentMinutes = Number(payload?.time_spent_minutes || 0)
    const favoriteGenres = Array.isArray(payload?.favorite_genres)
        ? payload.favorite_genres
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null
                const row = entry as Record<string, unknown>
                const name = typeof row.name === 'string' ? row.name.trim() : ''
                if (!name) return null
                return {
                    name,
                    count: Number(row.count || 0),
                    percent: Number(row.percent || 0),
                }
            })
            .filter((entry): entry is { name: string; count: number; percent: number } => Boolean(entry))
        : []

    return {
        reading: Number.isFinite(readingCount) ? readingCount : 0,
        comments: Number.isFinite(commentsCount) ? commentsCount : 0,
        followers: Number.isFinite(followersCount) ? followersCount : 0,
        following: Number.isFinite(followingCount) ? followingCount : 0,
        timeSpentMinutes: Number.isFinite(timeSpentMinutes) ? timeSpentMinutes : 0,
        favoriteGenres,
    }
}

function resolveReadingStreakDaysFromRows(rows: Array<{ read_at?: string | null }>) {
    const readDays = new Set(
        rows
            .map((row) => {
                const date = new Date(String(row?.read_at || ''))
                if (Number.isNaN(date.getTime())) return null
                return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
            })
            .filter((value): value is number => typeof value === 'number'),
    )
    if (readDays.size === 0) return 0

    const now = new Date()
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const oneDayMs = 86_400_000

    if (!readDays.has(cursor)) {
        const yesterday = cursor - oneDayMs
        if (!readDays.has(yesterday)) return 0
        cursor = yesterday
    }

    let streak = 0
    while (readDays.has(cursor)) {
        streak += 1
        cursor -= oneDayMs
    }
    return streak
}
