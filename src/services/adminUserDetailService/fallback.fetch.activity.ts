import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { READ_DATA_WINDOW } from './shared'
import type {
    DbMangaCommentRow,
    DbReadingHistoryRow,
    DbUserBadgeRow,
} from './shared'
import type { AdminUserDetailFallbackPayload } from './fallback.types'

type AdminUserDetailFallbackActivityPayload = Pick<
    AdminUserDetailFallbackPayload,
    'readingRows' | 'badgeRows' | 'mangaCommentRows' | 'counts'
>

export async function fetchAdminUserDetailFallbackActivity(
    userId: string,
): Promise<AdminUserDetailFallbackActivityPayload> {
    const [
        readingResult,
        mangaCommentResult,
        userBadgeResult,
        followersCountResult,
        followingCountResult,
        mangaFollowCountResult,
        fansubFollowCountResult,
        readingCountResult,
        mangaCommentCountResult,
        badgeCountResult,
    ] = await withServiceTimeout(
        (signal) => Promise.all([
            withAbortSignal(
                supabase
                    .from('reading_history')
                    .select(`
                        manga_id,
                        chapter_id,
                        chapter_number,
                        read_at,
                        manga:manga_id (
                            id,
                            title,
                            cover_image_url,
                            genres
                        ),
                        chapter:chapter_id (
                            id,
                            title,
                            chapter_number
                        )
                    `)
                    .eq('user_id', userId)
                    .order('read_at', { ascending: false })
                    .limit(READ_DATA_WINDOW),
                signal,
            ),
            withAbortSignal(
                supabase
                    .from('manga_comments')
                    .select(`
                        id,
                        manga_id,
                        content,
                        likes,
                        is_pinned,
                        is_active,
                        created_at,
                        manga:manga_id (
                            id,
                            title
                        )
                    `)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(40),
                signal,
            ),
            withAbortSignal(
                supabase
                    .from('user_badges')
                    .select(`
                        badge_id,
                        is_displayed,
                        display_order,
                        obtained_at,
                        badge:badge_id (
                            id,
                            name,
                            image_url
                        )
                    `)
                    .eq('user_id', userId)
                    .order('display_order', { ascending: true })
                    .order('obtained_at', { ascending: false }),
                signal,
            ),
            withAbortSignal(supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId), signal),
            withAbortSignal(supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('follower_id', userId), signal),
            withAbortSignal(supabase.from('manga_follows').select('manga_id', { count: 'exact', head: true }).eq('user_id', userId), signal),
            withAbortSignal(supabase.from('fansub_follows').select('user_id', { count: 'exact', head: true }).eq('user_id', userId), signal),
            withAbortSignal(supabase.from('reading_history').select('id', { count: 'exact', head: true }).eq('user_id', userId), signal),
            withAbortSignal(supabase.from('manga_comments').select('id', { count: 'exact', head: true }).eq('user_id', userId), signal),
            withAbortSignal(supabase.from('user_badges').select('id', { count: 'exact', head: true }).eq('user_id', userId), signal),
        ]),
        { label: 'Admin kullanici fallback aktivitesini yukleme' },
    )

    if (readingResult.error) throw readingResult.error
    if (mangaCommentResult.error) throw mangaCommentResult.error
    if (userBadgeResult.error) throw userBadgeResult.error
    if (followersCountResult.error) throw followersCountResult.error
    if (followingCountResult.error) throw followingCountResult.error
    if (mangaFollowCountResult.error) throw mangaFollowCountResult.error
    if (fansubFollowCountResult.error) throw fansubFollowCountResult.error
    if (readingCountResult.error) throw readingCountResult.error
    if (mangaCommentCountResult.error) throw mangaCommentCountResult.error
    if (badgeCountResult.error) throw badgeCountResult.error

    return {
        readingRows: (readingResult.data || []) as DbReadingHistoryRow[],
        badgeRows: (userBadgeResult.data || []) as DbUserBadgeRow[],
        mangaCommentRows: (mangaCommentResult.data || []) as DbMangaCommentRow[],
        counts: {
            followers: followersCountResult.count || 0,
            following: followingCountResult.count || 0,
            mangaFollows: mangaFollowCountResult.count || 0,
            fansubFollows: fansubFollowCountResult.count || 0,
            readingCount: readingCountResult.count || 0,
            mangaCommentCount: mangaCommentCountResult.count || 0,
            badgeCount: badgeCountResult.count || 0,
        },
    }
}
