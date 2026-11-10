import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { parseFansubIdentityTag, type FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import { isAuthSessionMissingError } from '../authService/shared'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import type { PrivacyVisibility } from './types'

type UserRole = 'user' | 'admin' | 'moderator'

export type CurrentUserIdentity = {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    frame_type: string | null
    background_type: string | null
    active_fansub_identity_tag?: FansubIdentityTagPresentation | null
    role: UserRole | null
    profile_visibility: PrivacyVisibility | null
    stats_visibility: PrivacyVisibility | null
    social_links_visibility: PrivacyVisibility | null
    activity_visibility: PrivacyVisibility | null
}

const selfIdentityLogger = createScopedLogger('userService/selfIdentity')
const SELF_IDENTITY_CACHE_TTL_MS = 4_000

type CachedCurrentUserIdentity = {
    value: CurrentUserIdentity | null
    expiresAt: number
}

let cachedCurrentUserIdentity: CachedCurrentUserIdentity | null = null
let currentUserIdentityInFlight: Promise<CurrentUserIdentity | null> | null = null

async function waitMs(delayMs: number) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function readCurrentUserIdentityRpc() {
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_my_user_identity'),
            signal,
        ),
        { label: 'userService.getCurrentUserIdentity.rpc' },
    )

    if (error) {
        throw error
    }

    return mapCurrentUserIdentity(normalizeRpcPayload<Partial<CurrentUserIdentity>>(data))
}

function normalizeRpcPayload<T>(data: unknown): T | null {
    if (!data) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T | null
    return data as T
}

function nowMs() {
    return Date.now()
}

function readCachedCurrentUserIdentity() {
    if (!cachedCurrentUserIdentity) return undefined
    if (cachedCurrentUserIdentity.expiresAt <= nowMs()) {
        cachedCurrentUserIdentity = null
        return undefined
    }
    return cachedCurrentUserIdentity.value
}

function writeCachedCurrentUserIdentity(value: CurrentUserIdentity | null) {
    cachedCurrentUserIdentity = {
        value,
        expiresAt: nowMs() + SELF_IDENTITY_CACHE_TTL_MS,
    }
}

function isCurrentUserIdentityMissingError(error: unknown) {
    if (isAuthSessionMissingError(error)) return true

    const typed = error as { message?: string; details?: string } | null
    const message = `${typed?.message || ''} ${typed?.details || ''}`.toLowerCase()

    return (
        message.includes('aktif kullanici bulunamadi')
        || message.includes('giris yapmalisiniz')
    )
}

export function clearCurrentUserIdentityCache() {
    cachedCurrentUserIdentity = null
    currentUserIdentityInFlight = null
}

function mapCurrentUserIdentity(row: Partial<CurrentUserIdentity> | null | undefined): CurrentUserIdentity | null {
    if (!row?.id || typeof row.id !== 'string') return null

    const role = row.role === 'admin' || row.role === 'moderator' || row.role === 'user'
        ? row.role
        : null
    const username = typeof row.username === 'string' ? row.username : ''

    return {
        id: row.id,
        username,
        display_name: typeof row.display_name === 'string' && row.display_name.trim()
            ? row.display_name.trim()
            : username,
        avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
        frame_type: typeof row.frame_type === 'string' ? row.frame_type : null,
        background_type: typeof row.background_type === 'string' ? row.background_type : null,
        active_fansub_identity_tag: parseFansubIdentityTag(row.active_fansub_identity_tag),
        role,
        profile_visibility: row.profile_visibility ?? null,
        stats_visibility: row.stats_visibility ?? null,
        social_links_visibility: row.social_links_visibility ?? null,
        activity_visibility: row.activity_visibility ?? null,
    }
}

export async function getCurrentUserIdentity(options: { required?: boolean } = {}): Promise<CurrentUserIdentity | null> {
    if (options.required !== true) {
        const cached = readCachedCurrentUserIdentity()
        if (cached !== undefined) {
            return cached
        }

        if (currentUserIdentityInFlight) {
            return currentUserIdentityInFlight
        }
    }

    const request = (async () => {
        if (options.required !== true) {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) {
                throw sessionError
            }

            if (!sessionData.session?.access_token) {
                writeCachedCurrentUserIdentity(null)
                return null
            }
        }

        const requestContext = createRequestContext('userService/selfIdentity', 'getCurrentUserIdentity', {
            required: options.required === true,
        })

        let payload: CurrentUserIdentity | null = null

        try {
            payload = await readCurrentUserIdentityRpc()
        } catch (error) {
            if (isCurrentUserIdentityMissingError(error)) {
                // Note: during a hard reload the current_public_user_id chain can arrive late at first
                // even when the auth session is ready.
                // Caching null in this case produces false negatives in admin/sidebar guards,
                // so we give a narrow second chance.
                for (const delayMs of [140, 260]) {
                    await waitMs(delayMs)
                    try {
                        payload = await readCurrentUserIdentityRpc()
                        break
                    } catch (retryError) {
                        if (!isCurrentUserIdentityMissingError(retryError)) {
                            throw retryError
                        }
                    }
                }
            } else {
                selfIdentityLogger.error({
                    event: requestContext.event,
                    message: toUserFacingErrorMessage(error, 'Aktif kullanici kimligi cozulurken bir hata olustu.'),
                    context: toRequestContextLogContext(requestContext),
                    error,
                })
                throw error
            }

            if (!payload) {
                if (options.required === true) {
                    throw new Error('Bu islem icin giris yapmalisiniz.')
                }
                writeCachedCurrentUserIdentity(null)
                return null
            }
        }

        if (!payload && options.required === true) {
            throw new Error('Aktif kullanici profili bulunamadi.')
        }

        writeCachedCurrentUserIdentity(payload)
        return payload
    })()

    if (options.required !== true) {
        currentUserIdentityInFlight = request
    }

    try {
        return await request
    } finally {
        if (options.required !== true && currentUserIdentityInFlight === request) {
            currentUserIdentityInFlight = null
        }
    }
}
