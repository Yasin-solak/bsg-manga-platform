import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from './selfIdentity'
import type { BlockedUserSummary, UserBlockState } from './types'

const BLOCK_CACHE_TTL_MS = 15_000
const userBlocksLogger = createScopedLogger('userService/blocks')

type UserBlocksCacheEntry = {
    userId: string
    expiresAt: number
    blockedIds: string[]
}

let blockedUserCache: UserBlocksCacheEntry | null = null

function isMissingBlockInfrastructureError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const typed = error as { message?: string; details?: string; hint?: string; code?: string }
    const text = [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
    return (
        typed.code === 'PGRST202'
        || text.includes('user_blocks')
        || text.includes('block_user')
        || text.includes('unblock_user')
        || text.includes('does not exist')
        || text.includes('could not find')
    )
}

async function resolveCurrentPublicUserId(explicitUserId?: string | null, signal?: AbortSignal) {
    if (explicitUserId && explicitUserId.trim()) return explicitUserId.trim()
    if (signal?.aborted) return null

    const authRequest = createRequestContext('userService/blocks', 'resolveCurrentPublicUserId:auth')
    const identity = await getCurrentUserIdentity().catch((error) => {
        userBlocksLogger.warn({
            event: authRequest.event,
            message: toUserFacingErrorMessage(error, 'Aktif kullanici kimligi cozulurken auth istegi basarisiz oldu.'),
            context: toRequestContextLogContext(authRequest),
            error,
        })
        return null
    })
    if (signal?.aborted) return null
    return identity?.id ?? null
}

export function invalidateUserBlockCache() {
    blockedUserCache = null
}

export async function getBlockedUserIds(currentUserId?: string | null, signal?: AbortSignal) {
    const resolvedCurrentUserId = await resolveCurrentPublicUserId(currentUserId, signal)
    if (!resolvedCurrentUserId) return []

    if (
        blockedUserCache
        && blockedUserCache.userId === resolvedCurrentUserId
        && blockedUserCache.expiresAt > Date.now()
    ) {
        return [...blockedUserCache.blockedIds]
    }

    const requestContext = createRequestContext('userService/blocks', 'getBlockedUserIds', {
        currentUserId: resolvedCurrentUserId,
    })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_blocks')
                .select('blocked_id')
                .eq('blocker_id', resolvedCurrentUserId)
                .order('created_at', { ascending: false }),
            signal,
        ),
        { label: 'userService.getBlockedUserIds', signal },
    )

    if (error) {
        if (isMissingBlockInfrastructureError(error)) return []
        userBlocksLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Engellenen kullanicilar okunamadi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    const blockedIds = (data || [])
        .map((row) => (typeof row.blocked_id === 'string' ? row.blocked_id.trim() : ''))
        .filter(Boolean)

    blockedUserCache = {
        userId: resolvedCurrentUserId,
        expiresAt: Date.now() + BLOCK_CACHE_TTL_MS,
        blockedIds,
    }

    return [...blockedIds]
}

export async function getUserBlockState(targetUserId: string, currentUserId?: string | null): Promise<UserBlockState> {
    const normalizedTargetUserId = targetUserId.trim()
    const resolvedCurrentUserId = await resolveCurrentPublicUserId(currentUserId)

    if (!normalizedTargetUserId || !resolvedCurrentUserId || normalizedTargetUserId === resolvedCurrentUserId) {
        return { blockedByCurrentUser: false }
    }

    const blockedIds = await getBlockedUserIds(resolvedCurrentUserId)
    return {
        blockedByCurrentUser: blockedIds.includes(normalizedTargetUserId),
    }
}

export async function listBlockedUsers(): Promise<BlockedUserSummary[]> {
    const requestContext = createRequestContext('userService/blocks', 'listBlockedUsers')
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('list_blocked_users'),
            signal,
        ),
        { label: 'userService.listBlockedUsers' },
    )

    if (error) {
        if (isMissingBlockInfrastructureError(error)) return []
        userBlocksLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Engellenen kullanici listesi yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const username = typeof row.username === 'string' && row.username.trim()
                ? row.username.trim()
                : 'Kullanici'
            return {
                id: typeof row.blocked_id === 'string' ? row.blocked_id : '',
                username,
                avatar: typeof row.avatar_url === 'string' && row.avatar_url.trim()
                    ? row.avatar_url
                    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`,
                blockedAt: typeof row.blocked_at === 'string' ? row.blocked_at : null,
            }
        })
        .filter((row) => row.id)
}

export async function blockUser(targetUserId: string) {
    const requestContext = createRequestContext('userService/blocks', 'blockUser', { targetUserId })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('block_user', {
                p_blocked_id: targetUserId,
            }),
            signal,
        ),
        { label: 'userService.blockUser' },
    )

    if (error) {
        if (isMissingBlockInfrastructureError(error)) {
            throw new Error('USER_BLOCKS_NOT_READY')
        }
        userBlocksLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Kullanici engellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    invalidateUserBlockCache()
}

export async function unblockUser(targetUserId: string) {
    const requestContext = createRequestContext('userService/blocks', 'unblockUser', { targetUserId })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('unblock_user', {
                p_blocked_id: targetUserId,
            }),
            signal,
        ),
        { label: 'userService.unblockUser' },
    )

    if (error) {
        if (isMissingBlockInfrastructureError(error)) {
            throw new Error('USER_BLOCKS_NOT_READY')
        }
        userBlocksLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Kullanici engeli kaldirilamadi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    invalidateUserBlockCache()
}
