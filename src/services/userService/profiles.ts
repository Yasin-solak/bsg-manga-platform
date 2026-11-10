import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { parseFansubIdentityTag } from '@/lib/fansubIdentityTags'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getBlockedUserIds } from './blocks'
import { clearCurrentUserIdentityCache } from './selfIdentity'
import { getE2EMockAuthUser, type E2EMockAuthUser } from '@/testing/e2eMocks'
import { normalizeUserDisplayName, validateUserDisplayName } from '@/lib/userDisplayName'
import type { UserProfile } from './types'

const PROFILE_IDENTITY_SELECT = `
    id,
    username,
    display_name,
    avatar_url,
    frame_type
`

const LEGACY_PROFILE_IDENTITY_SELECT = `
    id,
    username,
    avatar_url,
    frame_type
`

const userProfilesLogger = createScopedLogger('userService/profiles')

type SafeProfileUpdatePayload = Partial<Pick<UserProfile, 'bio' | 'avatar_url' | 'social_links'>>

export type UserProfileIdentity = Pick<
    UserProfile,
    'id' | 'username' | 'display_name' | 'avatar_url' | 'frame_type'
>

export type UserDisplayNameUpdateResult = Pick<UserProfile, 'id' | 'username' | 'display_name'>

export type UserProfileCustomizationPayload = {
    applyFrameType?: boolean
    frameType?: string | null
    applyBackgroundType?: boolean
    backgroundType?: string | null
    applyProfileEffect?: boolean
    activeProfileEffectId?: string | null
    ownedItemsPatch?: Record<string, unknown> | null
}

export type UserProfileCustomizationResult = {
    id: string
    frame_type: string | null
    background_type: string | null
    active_profile_effect_id: string | null
    owned_items: Record<string, unknown> | null
    premium_expires_at: string | null
}

export type UserProfileCustomizationSnapshot = {
    id: string
    frame_type: string | null
    background_type: string | null
    active_profile_effect_id: string | null
    onboarding_completed_at: string | null
}

function mapUserProfileIdentityRow(row: Partial<UserProfile> | null | undefined): UserProfileIdentity {
    const username = typeof row?.username === 'string' ? row.username : ''
    return {
        id: typeof row?.id === 'string' ? row.id : '',
        username,
        display_name: typeof row?.display_name === 'string' && row.display_name.trim()
            ? row.display_name.trim()
            : username,
        avatar_url: typeof row?.avatar_url === 'string' ? row.avatar_url : '',
        frame_type: typeof row?.frame_type === 'string' ? row.frame_type : 'default',
    }
}

function mapUserProfileRow(row: Partial<UserProfile> | null | undefined): UserProfile {
    const username = typeof row?.username === 'string' ? row.username : ''
    return {
        id: typeof row?.id === 'string' ? row.id : '',
        username,
        display_name: typeof row?.display_name === 'string' && row.display_name.trim()
            ? row.display_name.trim()
            : username,
        avatar_url: typeof row?.avatar_url === 'string' ? row.avatar_url : '',
        bio: typeof row?.bio === 'string' ? row.bio : '',
        level: typeof row?.level === 'string' ? row.level : 'Acemi',
        frame_type: typeof row?.frame_type === 'string' ? row.frame_type : 'default',
        background_type: typeof row?.background_type === 'string' ? row.background_type : null,
        active_profile_effect_id: typeof row?.active_profile_effect_id === 'string' ? row.active_profile_effect_id : null,
        social_links: Array.isArray(row?.social_links) ? row.social_links : [],
        owned_items: row?.owned_items && typeof row.owned_items === 'object'
            ? row.owned_items as UserProfile['owned_items']
            : {
                frames: ['default'],
                backgrounds: [],
                patterns: [],
                profile_effects: [],
            },
        stones: typeof row?.stones === 'number' ? row.stones : 0,
        premium_expires_at: typeof row?.premium_expires_at === 'string' ? row.premium_expires_at : null,
        active_fansub_identity_tag: parseFansubIdentityTag(row?.active_fansub_identity_tag),
        onboarding_completed_at: typeof row?.onboarding_completed_at === 'string' ? row.onboarding_completed_at : null,
        profile_visibility: row?.profile_visibility,
        stats_visibility: row?.stats_visibility,
        social_links_visibility: row?.social_links_visibility,
        activity_visibility: row?.activity_visibility,
        created_at: typeof row?.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    }
}

function mapE2EMockAuthUserToProfile(user: E2EMockAuthUser): UserProfile {
    const ownedItems = user.ownedItems && typeof user.ownedItems === 'object'
        ? user.ownedItems as Record<string, unknown>
        : {}

    return {
        id: user.id,
        username: user.username,
        display_name: user.displayName?.trim() || user.username,
        avatar_url: user.avatar,
        bio: '',
        level: 'Site Admin',
        frame_type: user.frameType || 'default',
        background_type: null,
        active_profile_effect_id: null,
        social_links: [],
        owned_items: {
            frames: Array.isArray(ownedItems.frames) ? ownedItems.frames as string[] : ['default'],
            backgrounds: Array.isArray(ownedItems.backgrounds) ? ownedItems.backgrounds : [],
            patterns: Array.isArray(ownedItems.patterns) ? ownedItems.patterns : [],
            profile_effects: Array.isArray(ownedItems.profile_effects) ? ownedItems.profile_effects as string[] : [],
        },
        stones: user.stones,
        premium_expires_at: user.premiumExpiresAt ?? null,
        active_fansub_identity_tag: null,
        onboarding_completed_at: user.onboardingCompletedAt ?? null,
        created_at: new Date(0).toISOString(),
    }
}

function normalizeRpcPayload<T>(data: unknown): T | null {
    if (!data) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T | null
    return data as T
}

function isPermissionDeniedError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const typedError = error as { code?: unknown; message?: unknown }
    const code = typeof typedError.code === 'string' ? typedError.code : ''
    const message = typeof typedError.message === 'string' ? typedError.message.toLowerCase() : ''
    return code === '42501' || message.includes('permission denied')
}

function isDisplayNameProjectionUnavailable(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const typedError = error as { code?: unknown; message?: unknown; details?: unknown }
    const code = typeof typedError.code === 'string' ? typedError.code : ''
    const text = `${typedError.message || ''} ${typedError.details || ''}`.toLowerCase()
    return (
        code === '42703'
        || code === 'PGRST204'
        || (text.includes('display_name') && (text.includes('does not exist') || text.includes('schema cache')))
    )
}

async function loadProfileIdentityProjection(column: 'id' | 'username', value: string, label: string) {
    const read = (select: string) => withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('public_user_directory').select(select).eq(column, value).maybeSingle(),
            signal,
        ),
        { label },
    )

    const currentResult = await read(PROFILE_IDENTITY_SELECT)
    if (!currentResult.error || !isDisplayNameProjectionUnavailable(currentResult.error)) {
        return currentResult
    }

    // So an old view version can resolve identity without the new column; the mapper
    // falls back from display name to the unique handle, keeping rolling deploys safe.
    return read(LEGACY_PROFILE_IDENTITY_SELECT)
}

async function loadPublicProfileByRpc(
    mode: 'id' | 'username',
    identifier: string,
    includeSocialLinks: boolean,
) {
    const rpcName = mode === 'id'
        ? 'get_public_user_profile_by_id'
        : 'get_public_user_profile_by_username'
    const payload = mode === 'id'
        ? {
            p_user_id: identifier,
            p_include_social_links: includeSocialLinks,
        }
        : {
            p_username: identifier,
            p_include_social_links: includeSocialLinks,
        }

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc(rpcName, payload),
            signal,
        ),
        { label: `userService.${rpcName}` },
    )

    if (error) throw error
    return normalizeRpcPayload<Partial<UserProfile>>(data)
}

/**
 * Private account lock screen: users RLS hides a private account's row from non-followers, so
 * the view returns empty. A narrow RPC gives only the identity of an active, unbanned, private, unblocked account, so
 * the profile page draws the lock screen instead of 404. An RPC error counts as "not found".
 */
async function loadLockedProfileIdentity(identifier: string): Promise<Partial<UserProfile> | null> {
    try {
        const { data, error } = await withServiceTimeout(
            (signal) => withAbortSignal(
                supabase.rpc('get_locked_profile_identity', { p_identifier: identifier }),
                signal,
            ),
            { label: 'userService.getProfileIdentityByIdentifier.locked' },
        )
        if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null
        const row = data as Partial<UserProfile>
        return row.id ? row : null
    } catch {
        return null
    }
}

async function loadProfileIdentityByRpcFallback(identifier: string, isUuid: boolean) {
    const usernameRow = await loadPublicProfileByRpc('username', identifier, false)
    if (usernameRow?.id) return usernameRow
    if (!isUuid) return null
    return loadPublicProfileByRpc('id', identifier, false)
}

function sanitizeSafeProfileUpdates(updates: Partial<UserProfile>): SafeProfileUpdatePayload {
    const sanitized: SafeProfileUpdatePayload = {}

    if ('bio' in updates) {
        sanitized.bio = typeof updates.bio === 'string' ? updates.bio : ''
    }
    if ('avatar_url' in updates) {
        sanitized.avatar_url = typeof updates.avatar_url === 'string' ? updates.avatar_url : ''
    }
    if ('social_links' in updates) {
        sanitized.social_links = Array.isArray(updates.social_links) ? updates.social_links : []
    }

    return sanitized
}

export async function getProfileById(userId: string, options: { includeSocialLinks?: boolean } = {}) {
    const requestContext = createRequestContext('userService/profiles', 'getProfileById', { userId })
    const blockedUserIds = new Set(await getBlockedUserIds())
    if (blockedUserIds.has(userId)) {
        throw new Error('PROFILE_NOT_FOUND')
    }
    let data: Partial<UserProfile> | null = null
    let error: unknown = null

    try {
        data = await loadPublicProfileByRpc('id', userId, options.includeSocialLinks === true)
    } catch (rpcError) {
        error = rpcError
    }

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Profil yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
    if (!data) throw new Error('PROFILE_NOT_FOUND')
    return mapUserProfileRow(data as Partial<UserProfile>)
}

export async function getProfileByUsername(username: string, options: { includeSocialLinks?: boolean } = {}) {
    const requestContext = createRequestContext('userService/profiles', 'getProfileByUsername', { username })
    let data: Partial<UserProfile> | null = null
    let error: unknown = null

    try {
        data = await loadPublicProfileByRpc('username', username, options.includeSocialLinks === true)
    } catch (rpcError) {
        error = rpcError
    }

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Profil kullanici adiyla yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
    if (!data) throw new Error('PROFILE_NOT_FOUND')
    const blockedUserIds = new Set(await getBlockedUserIds())
    if (!data.id || blockedUserIds.has(data.id)) {
        throw new Error('PROFILE_NOT_FOUND')
    }
    return mapUserProfileRow(data as Partial<UserProfile>)
}

export async function getProfileByIdentifier(identifier: string, options: { includeSocialLinks?: boolean } = {}) {
    const normalized = identifier.trim()
    if (!normalized) throw new Error('PROFILE_NOT_FOUND')

    try {
        return await getProfileByUsername(normalized, options)
    } catch (error: any) {
        const isUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
        const isProfileNotFound = error instanceof Error && error.message === 'PROFILE_NOT_FOUND'

        if (!isUuid || !isProfileNotFound) throw error
        return getProfileById(normalized, options)
    }
}

export async function getProfileIdentityByIdentifier(identifier: string): Promise<UserProfileIdentity> {
    const normalized = identifier.trim()
    if (!normalized) throw new Error('PROFILE_NOT_FOUND')

    const blockedUserIds = new Set(await getBlockedUserIds())
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    const requestContext = createRequestContext('userService/profiles', 'getProfileIdentityByIdentifier', {
        identifier: normalized,
        mode: isUuid ? 'id-or-username' : 'username',
    })

    const readByUsername = async () => loadProfileIdentityProjection(
        'username',
        normalized,
        'userService.getProfileIdentityByIdentifier.username',
    )

    const readById = async () => loadProfileIdentityProjection(
        'id',
        normalized,
        'userService.getProfileIdentityByIdentifier.id',
    )

    const usernameResult = await readByUsername()
    if (usernameResult.error) {
        if (isPermissionDeniedError(usernameResult.error)) {
            const fallbackRow = await loadProfileIdentityByRpcFallback(normalized, isUuid)
            if (!fallbackRow?.id || blockedUserIds.has(fallbackRow.id)) {
                throw new Error('PROFILE_NOT_FOUND')
            }
            return mapUserProfileIdentityRow(fallbackRow)
        }

        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(usernameResult.error, 'Profil kimlik ozeti yuklenemedi.'),
            context: toRequestContextLogContext(requestContext, { strategy: 'username' }),
            error: usernameResult.error,
        })
        throw usernameResult.error
    }

    const usernameRow = usernameResult.data as Partial<UserProfile> | null
    if (usernameRow?.id) {
        if (blockedUserIds.has(usernameRow.id)) {
            throw new Error('PROFILE_NOT_FOUND')
        }
        return mapUserProfileIdentityRow(usernameRow)
    }

    const lockedOrNotFound = async (): Promise<UserProfileIdentity> => {
        const lockedRow = await loadLockedProfileIdentity(normalized)
        if (!lockedRow?.id || blockedUserIds.has(lockedRow.id)) {
            throw new Error('PROFILE_NOT_FOUND')
        }
        return mapUserProfileIdentityRow(lockedRow)
    }

    if (!isUuid) {
        return lockedOrNotFound()
    }

    const idResult = await readById()
    if (idResult.error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(idResult.error, 'Profil kimlik ozeti id ile yuklenemedi.'),
            context: toRequestContextLogContext(requestContext, { strategy: 'id' }),
            error: idResult.error,
        })
        throw idResult.error
    }

    const idRow = idResult.data as Partial<UserProfile> | null
    if (!idRow?.id) {
        return lockedOrNotFound()
    }
    if (blockedUserIds.has(idRow.id)) {
        throw new Error('PROFILE_NOT_FOUND')
    }

    return mapUserProfileIdentityRow(idRow)
}

export async function getProfileByAuthId(authId: string) {
    const requestContext = createRequestContext('userService/profiles', 'getProfileByAuthId', { authId })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_auth_user_profile', {
                p_auth_user_id: authId,
            }),
            signal,
        ),
        { label: 'userService.getProfileByAuthId' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Auth kullanicisina ait profil yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
    return mapUserProfileRow(normalizeRpcPayload<Partial<UserProfile>>(data))
}

export async function getOwnProfileById(userId: string) {
    const e2eMockUser = getE2EMockAuthUser()
    if (e2eMockUser?.id === userId) {
        return mapE2EMockAuthUserToProfile(e2eMockUser)
    }

    const requestContext = createRequestContext('userService/profiles', 'getOwnProfileById', { userId })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_my_private_user_profile'),
            signal,
        ),
        { label: 'userService.getOwnProfileById' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Kendi profiliniz yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    const payload = normalizeRpcPayload<Partial<UserProfile>>(data)
    if (!payload?.id || payload.id !== userId) {
        throw new Error('Kendi profiliniz bu kullanici kimligiyle eslesmiyor.')
    }

    return mapUserProfileRow(payload)
}

export async function getMyProfileCustomizationSnapshot(userId: string): Promise<UserProfileCustomizationSnapshot> {
    const requestContext = createRequestContext('userService/profiles', 'getMyProfileCustomizationSnapshot', { userId })
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_my_profile_customization_snapshot'),
            signal,
        ),
        { label: 'userService.getMyProfileCustomizationSnapshot' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Profil ozellestirme ozeti yuklenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    const payload = normalizeRpcPayload<Partial<UserProfile>>(data)
    if (!payload?.id || payload.id !== userId) {
        throw new Error('Profil ozellestirme ozeti aktif kullanici ile eslesmiyor.')
    }

    return {
        id: payload.id,
        frame_type: typeof payload.frame_type === 'string' ? payload.frame_type : null,
        background_type: typeof payload.background_type === 'string' ? payload.background_type : null,
        active_profile_effect_id: typeof payload.active_profile_effect_id === 'string' ? payload.active_profile_effect_id : null,
        onboarding_completed_at: typeof payload.onboarding_completed_at === 'string' ? payload.onboarding_completed_at : null,
    }
}

export async function updateMyDisplayName(displayName: string): Promise<UserDisplayNameUpdateResult> {
    const validationError = validateUserDisplayName(displayName)
    if (validationError) {
        throw new Error(validationError)
    }

    const normalizedDisplayName = normalizeUserDisplayName(displayName)
    const requestContext = createRequestContext('userService/profiles', 'updateMyDisplayName')
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('update_my_display_name', {
                p_display_name: normalizedDisplayName,
            }),
            signal,
        ),
        { label: 'Gorunen adi guncelleme' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Gorunen ad guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    const row = normalizeRpcPayload<Partial<UserProfile>>(data)
    if (!row?.id || typeof row.username !== 'string') {
        throw new Error('Gorunen ad guncelleme yaniti gecersiz.')
    }

    clearCurrentUserIdentityCache()
    return {
        id: row.id,
        username: row.username,
        display_name: typeof row.display_name === 'string' && row.display_name.trim()
            ? row.display_name.trim()
            : row.username,
    }
}

export async function updateProfile(userId: string, updates: Partial<UserProfile>) {
    const requestContext = createRequestContext('userService/profiles', 'updateProfile', { userId })
    const sanitizedUpdates = sanitizeSafeProfileUpdates(updates)
    if (Object.keys(sanitizedUpdates).length === 0) {
        throw new Error('Guvenli profil guncellemesi icin gecerli alan bulunamadi.')
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('users')
                .update(sanitizedUpdates)
                .eq('id', userId)
                .select('id')
                .single(),
            signal,
        ),
        { label: 'userService.updateProfile' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Profil guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
    return getOwnProfileById(userId)
}

// Reads favorite genres chosen in onboarding. Best effort: returns an empty array if migration
// 20260627_254 is not applied or there is no row (the Explore
// seed is an optional improvement and must not block the page).
export async function getMyPreferredGenres(userId: string): Promise<string[]> {
    const requestContext = createRequestContext('userService/profiles', 'getMyPreferredGenres', { userId })

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('users')
                .select('preferred_genres')
                .eq('id', userId)
                .maybeSingle(),
            signal,
        ),
        { label: 'userService.getMyPreferredGenres' },
    )

    if (error) {
        userProfilesLogger.warn({
            event: requestContext.event,
            message: 'Favori turler okunamadi; bos listeyle devam ediliyor.',
            context: toRequestContextLogContext(requestContext),
            error,
        })
        return []
    }

    const raw = (data as { preferred_genres?: unknown } | null)?.preferred_genres
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

// Onboarding genre selection. If migration 20260627_254 (users.preferred_genres)
// is not applied, the caller can swallow the error (does not block onboarding).
export async function updateMyPreferredGenres(userId: string, genres: string[]) {
    const requestContext = createRequestContext('userService/profiles', 'updateMyPreferredGenres', { userId })
    const cleaned = Array.from(new Set(genres.map((genre) => genre.trim()).filter(Boolean))).slice(0, 12)

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('users')
                .update({ preferred_genres: cleaned })
                .eq('id', userId)
                .select('id')
                .single(),
            signal,
        ),
        { label: 'userService.updateMyPreferredGenres' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Favori turler kaydedilemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }
    return cleaned
}

export async function updateMyProfileCustomization(
    payload: UserProfileCustomizationPayload,
): Promise<UserProfileCustomizationResult> {
    const requestContext = createRequestContext('userService/profiles', 'updateMyProfileCustomization')
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('update_my_profile_customization', {
                p_apply_frame_type: payload.applyFrameType === true,
                p_frame_type: payload.frameType ?? null,
                p_apply_background_type: payload.applyBackgroundType === true,
                p_background_type: payload.backgroundType ?? null,
                p_apply_profile_effect: payload.applyProfileEffect === true,
                p_active_profile_effect_id: payload.activeProfileEffectId ?? null,
                p_owned_items_patch: payload.ownedItemsPatch ?? null,
            }),
            signal,
        ),
        { label: 'userService.updateMyProfileCustomization' },
    )

    if (error) {
        userProfilesLogger.error({
            event: requestContext.event,
            message: toUserFacingErrorMessage(error, 'Profil ozellestirme kaydedilemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw error
    }

    const payloadRow = ((Array.isArray(data) ? data[0] : data) || null) as UserProfileCustomizationResult | null
    if (!payloadRow) {
        throw new Error('Profil ozellestirme yaniti bos dondu.')
    }

    return payloadRow
}
