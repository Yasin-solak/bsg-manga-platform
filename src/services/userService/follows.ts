import { readFollowStatus, type FollowStatus } from './followRequests'
import { emitFollowGraphMutation, invalidateFollowFeedCache } from '../followFeedService'
import { buildFansubCardCosmeticMap } from '../fansubCosmeticService'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { getBlockedUserIds } from './blocks'

const FOLLOWER_PROFILE_SELECT = `
            follower:users!user_follows_follower_id_fkey(
                id,
                username,
                avatar_url
            )
        `

const FOLLOWING_PROFILE_SELECT = `
            following:users!user_follows_following_id_fkey(
                id,
                username,
                avatar_url
            )
        `

// fansub_follows uses a composite key; this table has no independent id column.
const FOLLOWED_FANSUB_SELECT = `
        user_id,
        fansub_id,
        created_at,
        fansub:fansubs!inner(
            id,
            name,
            avatar_url,
            manga_count,
            follower_count,
            frame_type,
            active_frame_id,
            primary_color,
            secondary_color,
            is_active
        )
    `

function publishFollowGraphMutation(params: {
    viewerId: string
    actorType: 'user' | 'fansub'
    actorId: string
    action: 'followed' | 'unfollowed'
}) {
    const viewerId = params.viewerId.trim()
    const actorId = params.actorId.trim()
    if (!viewerId || !actorId) return

    invalidateFollowFeedCache(viewerId)
    emitFollowGraphMutation({
        viewerId,
        actorType: params.actorType,
        actorId,
        action: params.action,
        occurredAt: new Date().toISOString(),
    })
}

export async function isFollowingUser(followerId: string, followingId: string) {
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_follows')
                .select('follower_id')
                .eq('follower_id', followerId)
                .eq('following_id', followingId)
                .maybeSingle(),
            signal,
        ),
        { label: 'Kullanici takip durumunu kontrol etme' },
    )

    if (error) throw error
    return !!data
}

/** Follows a public account; sends a follow request to a private one ("requested"). */
export async function followUser(followerId: string, followingId: string): Promise<FollowStatus> {
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('follow_user', {
                p_following_id: followingId,
            }),
            signal,
        ),
        { label: 'Kullaniciyi takip etme' },
    )

    if (error) throw error

    const status = readFollowStatus(data)
    if (status === 'following') {
        publishFollowGraphMutation({
            viewerId: followerId,
            actorType: 'user',
            actorId: followingId,
            action: 'followed',
        })
    }
    return status
}

export async function unfollowUser(followerId: string, followingId: string) {
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('unfollow_user', {
                p_following_id: followingId,
            }),
            signal,
        ),
        { label: 'Kullanici takibini birakma' },
    )

    if (error) throw error

    publishFollowGraphMutation({
        viewerId: followerId,
        actorType: 'user',
        actorId: followingId,
        action: 'unfollowed',
    })
}

export async function followManga(_userId: string, mangaId: string) {
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('follow_manga', {
                p_manga_id: mangaId,
            }),
            signal,
        ),
        { label: 'Mangayi takip etme' },
    )
    if (error) throw error
}

export async function unfollowManga(_userId: string, mangaId: string) {
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('unfollow_manga', {
                p_manga_id: mangaId,
            }),
            signal,
        ),
        { label: 'Manga takibini birakma' },
    )
    if (error) throw error
}

export async function isFollowingManga(
    userId: string,
    mangaId: string,
    signal?: AbortSignal,
) {
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('manga_follows')
                .select('user_id')
                .eq('user_id', userId)
                .eq('manga_id', mangaId)
                .maybeSingle(),
            signal,
        ),
        { label: 'Manga takip durumunu kontrol etme', signal },
    )
    if (error) throw error
    return !!data
}

export async function followFansub(userId: string, fansubId: string) {
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('follow_fansub', {
                p_fansub_id: fansubId,
            }),
            signal,
        ),
        { label: 'Fansub takibi baslatma' },
    )
    if (error) throw error

    publishFollowGraphMutation({
        viewerId: userId,
        actorType: 'fansub',
        actorId: fansubId,
        action: 'followed',
    })
}

export async function unfollowFansub(userId: string, fansubId: string) {
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('unfollow_fansub', {
                p_fansub_id: fansubId,
            }),
            signal,
        ),
        { label: 'Fansub takibini birakma' },
    )
    if (error) throw error

    publishFollowGraphMutation({
        viewerId: userId,
        actorType: 'fansub',
        actorId: fansubId,
        action: 'unfollowed',
    })
}

export async function isFollowingFansub(userId: string, fansubId: string) {
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('fansub_follows')
                .select('user_id')
                .eq('user_id', userId)
                .eq('fansub_id', fansubId)
                .maybeSingle(),
            signal,
        ),
        { label: 'Fansub takip durumunu kontrol etme' },
    )
    if (error) throw error
    return !!data
}

export async function listFollowedFansubIds(userId: string, fansubIds: string[]) {
    const normalizedFansubIds = Array.from(new Set(
        fansubIds
            .map((fansubId) => fansubId.trim())
            .filter(Boolean),
    ))

    if (!userId.trim() || normalizedFansubIds.length === 0) {
        return new Set<string>()
    }

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('fansub_follows')
                .select('fansub_id')
                .eq('user_id', userId)
                .in('fansub_id', normalizedFansubIds),
            signal,
        ),
        { label: 'Fansub takip durumlarini toplu listeleme' },
    )

    if (error) throw error

    return new Set(
        (data || [])
            .map((row: { fansub_id?: unknown }) => typeof row?.fansub_id === 'string' ? row.fansub_id : '')
            .filter(Boolean),
    )
}

export async function getUserFollowers(userId: string, signal?: AbortSignal) {
    const blockedUserIds = new Set(await getBlockedUserIds())
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_follows')
                .select(FOLLOWER_PROFILE_SELECT)
                .eq('following_id', userId),
            signal,
        ),
        { label: 'Kullanici takipcilerini listeleme', signal },
    )

    if (error) throw error
    return data
        .filter((d: any) => d?.follower?.id && !blockedUserIds.has(d.follower.id))
        .map((d: any) => ({
            id: d.follower.id,
            username: d.follower.username,
            avatar: d.follower.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.follower.username}`,
        }))
}

export async function getUserFollowing(userId: string, signal?: AbortSignal) {
    const blockedUserIds = new Set(await getBlockedUserIds())
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_follows')
                .select(FOLLOWING_PROFILE_SELECT)
                .eq('follower_id', userId),
            signal,
        ),
        { label: 'Kullanici takip edilenleri listeleme', signal },
    )

    if (error) throw error
    return data
        .filter((d: any) => d?.following?.id && !blockedUserIds.has(d.following.id))
        .map((d: any) => ({
            id: d.following.id,
            username: d.following.username,
            avatar: d.following.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.following.username}`,
        }))
}

export async function getFollowedFansubs(
    userId: string,
    options: { includeCosmetics?: boolean } = {},
) {
    const { includeCosmetics = true } = options
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('fansub_follows')
                .select(FOLLOWED_FANSUB_SELECT)
                .eq('user_id', userId)
                .eq('fansub.is_active', true)
                .order('created_at', { ascending: false }),
            signal,
        ),
        { label: 'Takip edilen fansublari listeleme' },
    )

    if (error) throw error
    const rows = data || []
    if (!includeCosmetics || rows.length === 0) {
        return rows
    }

    const cosmeticMap = await buildFansubCardCosmeticMap(
        rows
            .map((row: any) => row?.fansub)
            .filter((fansub: any) => fansub?.id)
            .map((fansub: any) => ({
                id: fansub.id,
                frame_type: fansub.frame_type,
                primary_color: fansub.primary_color,
                secondary_color: fansub.secondary_color,
                active_frame_id: fansub.active_frame_id,
            })),
    )

    return rows.map((row: any) => {
        const fansub = row?.fansub
        if (!fansub?.id) return row
        const cosmetics = cosmeticMap.get(fansub.id)

        return {
            ...row,
            fansub: {
                ...fansub,
                frame_custom_overlay_url: cosmetics?.frameCustomOverlayUrl ?? null,
                frame_poster_overlay_url: cosmetics?.framePosterOverlayUrl ?? null,
            },
        }
    })
}

