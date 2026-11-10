import { isReservedUsernameValue, toAppErrorMessage } from '../errorMessageService'
import { runWithRetry, withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { supabase } from '../supabase'
import {
  emitActiveSessionClaimed,
  getClientSessionContext,
} from './sessionDeviceContext'
import {
  clearMfaStateSummaryCacheState,
  readMfaStateSummary,
  resolvePendingMfaChallenge,
} from './mfaState'
import {
  decodeJwtPayload,
  isAbortLikeError,
  isAuthSessionMissingError,
  isSessionPropagationDelayError,
  isSingleSessionAuthError,
  isSingleSessionClaimInputError,
  isSingleSessionInfraMissingError,
  MFA_REQUIRED_ERROR,
  SESSION_RECONCILE_DELAYS_MS,
  SESSION_REPLACED_ERROR,
  sleep,
} from './sessionGuardUtils'
import type { AppUser, DbUser, MfaStateSummary, PendingMfaChallenge } from './types'

type MinimalAuthUser = {
  id: string
  email?: string
  user_metadata?: Record<string, any> | null
}

type AuthSessionLike = {
  access_token: string
  refresh_token: string
}

type CurrentAuthSessionSnapshot = {
  authUserId: string
  accessToken: string | null
  sessionId: string | null
  email: string | null
  emailVerifiedAt: string | null
  lastSignInAt: string | null
  sessionExpiresAt: string | null
}

type SessionGuardState = 'match' | 'missing' | 'replaced' | 'unsupported'

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const BAN_RELEASE_COOLDOWN_MS = 5_000
const AUTH_CLIENT_SNAPSHOT_TTL_MS = 4_000

let releaseExpiredOwnBanInFlight: Promise<void> | null = null
let releaseExpiredOwnBanLastRunAt = 0
let currentAuthSessionSnapshotCache: { value: CurrentAuthSessionSnapshot | null; expiresAt: number } | null = null
let currentAuthSessionSnapshotInFlight: Promise<CurrentAuthSessionSnapshot | null> | null = null
const authLogger = createScopedLogger('authService')

export function normalizeUsernameInput(username: string): string {
  return username
    .trim()
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
}

export function validateUsernameInput(username: string): string | null {
  if (!username) return 'Kullanici etiketi zorunludur.'
  if (username.length < 3) return 'Kullanici etiketi en az 3 karakter olmalidir.'
  if (username.length > 24) return 'Kullanici etiketi en fazla 24 karakter olabilir.'
  if (isReservedUsernameValue(username)) {
    return 'Bu kullanici etiketi rezerve edilmistir. Lutfen farkli bir etiket secin.'
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Kullanici etiketi sadece kucuk harf, rakam ve alt cizgi (_) icerebilir.'
  }
  return null
}

function slugifyUsername(username: string): string {
  return username.replace(/_/g, '-')
}

export async function releaseExpiredOwnBanIfNeeded() {
  const now = Date.now()
  if (releaseExpiredOwnBanInFlight) {
    return releaseExpiredOwnBanInFlight
  }

  if (now - releaseExpiredOwnBanLastRunAt < BAN_RELEASE_COOLDOWN_MS) {
    return
  }

  releaseExpiredOwnBanLastRunAt = now
  releaseExpiredOwnBanInFlight = (async () => {
    const { error } = await withServiceTimeout(
      (signal) => withAbortSignal(supabase.rpc('release_my_expired_ban'), signal),
      { label: 'Suresi dolmus ban kaydini temizleme' },
    )
    if (!error) return
    if (error.code === '42883' || error.code === '42P01' || isAbortLikeError(error)) return
    authLogger.warn('releaseExpiredOwnBanIfNeeded warning', error)
  })()

  try {
    await releaseExpiredOwnBanInFlight
  } finally {
    releaseExpiredOwnBanInFlight = null
  }
}

function isBanActive(isBanned: boolean, banUntil?: string | null) {
  if (!isBanned) return false
  if (!banUntil) return true
  const parsed = new Date(banUntil)
  if (Number.isNaN(parsed.getTime())) return true
  return parsed.getTime() > Date.now()
}

function mapDbUserToAppUser(row: DbUser, authUserId: string): AppUser {
  const activeBan = isBanActive(row.is_banned === true, row.ban_until)
  const displayName = typeof row.display_name === 'string' && row.display_name.trim()
    ? row.display_name.trim()
    : row.username
  return {
    id: row.id,
    authUserId,
    username: row.username,
    displayName,
    usernameSlug: row.username_slug,
    avatar: row.avatar_url ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.username_slug}`,
    role: row.role,
    isBanned: activeBan,
    banUntil: row.ban_until || undefined,
    isActive: row.is_active !== false,
    stones: row.stones ?? 0,
    ownedItems: {
      frames: ['default'],
      backgrounds: [],
      patterns: [],
      badges: [],
      premium: [],
      profile_effects: [],
      uploaded_background_slots: [],
      profile_background_upload_slot_limit: 1,
      ...(row.owned_items ?? {}),
    },
    premiumExpiresAt: row.premium_expires_at || null,
    frameType: row.frame_type || 'default',
    activeBadgeId: row.active_badge_id || null,
    activeProfileEffectId: row.active_profile_effect_id || null,
    onboardingCompletedAt: row.onboarding_completed_at || null,
    birthDate: row.birth_date || null,
  }
}

function normalizeRpcRow<T>(data: unknown): T | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] ?? null) as T | null
  return data as T
}

export function clearCurrentAuthSessionSnapshotCache() {
  currentAuthSessionSnapshotCache = null
  currentAuthSessionSnapshotInFlight = null
}

export async function getCurrentAuthSessionSnapshot(
  options: { force?: boolean } = {},
): Promise<CurrentAuthSessionSnapshot | null> {
  const forceRefresh = options.force === true
  const now = Date.now()

  if (!forceRefresh && currentAuthSessionSnapshotCache && currentAuthSessionSnapshotCache.expiresAt > now) {
    return currentAuthSessionSnapshotCache.value
  }

  if (!forceRefresh && currentAuthSessionSnapshotInFlight) {
    return currentAuthSessionSnapshotInFlight
  }

  const request = (async () => {
    const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] = await withServiceTimeout(
      () => Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]),
      { label: 'Mevcut auth snapshot okuma', timeoutMs: 4_000 },
    )

    if (userError) throw userError
    if (sessionError) throw sessionError

    const accessToken = sessionData.session?.access_token?.trim() || null
    const tokenPayload = accessToken
      ? (decodeJwtPayload(accessToken) as Record<string, unknown> | null)
      : null
    const authUser = userData.user ?? sessionData.session?.user ?? null
    const authUserId = authUser?.id
      || (typeof tokenPayload?.sub === 'string' ? tokenPayload.sub.trim() : '')
      || null
    const email = authUser?.email
      || (typeof tokenPayload?.email === 'string' ? tokenPayload.email.trim() : '')
      || null
    const emailVerifiedAt = authUser?.email_confirmed_at
      || (typeof tokenPayload?.email_confirmed_at === 'string' ? tokenPayload.email_confirmed_at.trim() : '')
      || null
    const lastSignInAt = authUser?.last_sign_in_at || null

    const snapshot = authUserId ? {
      authUserId,
      accessToken,
      sessionId: readSessionIdFromAccessToken(accessToken),
      email,
      emailVerifiedAt,
      lastSignInAt,
      sessionExpiresAt: sessionData.session?.expires_at
        ? new Date(sessionData.session.expires_at * 1000).toISOString()
        : null,
    } satisfies CurrentAuthSessionSnapshot : null

    currentAuthSessionSnapshotCache = {
      value: snapshot,
      expiresAt: Date.now() + AUTH_CLIENT_SNAPSHOT_TTL_MS,
    }

    return snapshot
  })()

  currentAuthSessionSnapshotInFlight = request

  try {
    return await request
  } finally {
    if (currentAuthSessionSnapshotInFlight === request) {
      currentAuthSessionSnapshotInFlight = null
    }
  }
}

export function clearMfaStateSummaryCache() {
  clearMfaStateSummaryCacheState()
}

function ensureUserCanUseApp(user: AppUser) {
  if (user.isActive === false) {
    throw new Error('Hesabiniz pasif durumda. Lutfen yoneticiyle iletisime gecin.')
  }
  if (user.isBanned) {
    throw new Error('Hesabiniz banli. Lutfen yoneticiyle iletisime gecin.')
  }
}

function getPreferredUsername(authUser: MinimalAuthUser, preferred?: string): string {
  if (preferred?.trim()) {
    const normalized = normalizeUsernameInput(preferred)
    if (normalized) return normalized
  }

  const metadataUsername = typeof authUser.user_metadata?.username === 'string'
    ? authUser.user_metadata.username
    : ''
  if (metadataUsername.trim()) {
    const normalized = normalizeUsernameInput(metadataUsername)
    if (normalized) return normalized
  }

  const mailPrefix = authUser.email?.split('@')[0] ?? ''
  if (mailPrefix.trim()) {
    const normalized = normalizeUsernameInput(mailPrefix)
    if (normalized) return normalized
  }

  return 'user'
}

async function findUserByAuthId(authUserId: string): Promise<DbUser | null> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_auth_user_profile', {
        p_auth_user_id: authUserId,
      }),
      signal,
    ),
    { label: 'Kullanici profilini auth kimligiyle bulma' },
  )

  if (error) {
    throw error
  }

  return normalizeRpcRow<DbUser>(data)
}

export async function settleAuthenticatedSession(
  session: AuthSessionLike | null | undefined,
  expectedAuthUserId?: string | null,
) {
  if (!session?.access_token || !session.refresh_token) return

  try {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  } catch {
    // signIn akisi session'i zaten yazmis olabilir; yine de asagida tekrar dogruluyoruz.
  }

  clearCurrentAuthSessionSnapshotCache()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await getCurrentAuthSessionSnapshot({ force: true })
    const userMatches = !expectedAuthUserId || snapshot?.authUserId === expectedAuthUserId
    if (snapshot?.accessToken === session.access_token && snapshot.authUserId && userMatches) {
      return
    }

    await sleep(40 * (attempt + 1))
  }
}

export async function ensureAuthenticatedClientState(expectedAuthUserId?: string | null) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const snapshot = await getCurrentAuthSessionSnapshot({ force: true })
      const userMatches = !expectedAuthUserId || snapshot?.authUserId === expectedAuthUserId
      if (snapshot?.accessToken && snapshot.authUserId && userMatches) {
        return true
      }
    } catch (error) {
      if (!isAuthSessionMissingError(error)) {
        throw error
      }
    }

    await sleep(60 * (attempt + 1))
  }

  return false
}

export async function getMfaStateSummary(options: { force?: boolean } = {}): Promise<MfaStateSummary> {
  return await readMfaStateSummary(options)
}

export function getPendingMfaChallenge(
  mfaState: MfaStateSummary,
  email: string | null | undefined,
): PendingMfaChallenge | null {
  return resolvePendingMfaChallenge(mfaState, email)
}

export function buildMfaRequiredError(challenge: PendingMfaChallenge) {
  const error = new Error('Iki asamali dogrulama gerekli.') as Error & {
    code: string
    challenge: PendingMfaChallenge
  }
  error.code = MFA_REQUIRED_ERROR
  error.challenge = challenge
  return error
}

export function isMfaRequiredError(
  error: unknown,
): error is Error & { code: string; challenge: PendingMfaChallenge } {
  return (
    error instanceof Error
    && (error as { code?: string }).code === MFA_REQUIRED_ERROR
    && typeof (error as { challenge?: PendingMfaChallenge }).challenge?.factorId === 'string'
  )
}

async function parseDirectSupabaseError(response: Response) {
  let payload: {
    code?: string | number
    error_code?: string
    message?: string
    msg?: string
    details?: string
    hint?: string
  } | null = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  return {
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : String(payload?.code || ''),
    errorCode: payload?.error_code,
    message: payload?.message || payload?.msg || response.statusText || 'Supabase istegi basarisiz oldu.',
    details: payload?.details,
    hint: payload?.hint,
  }
}

async function callDirectSupabaseJson(path: string, accessToken: string, body?: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env degerleri eksik oldugu icin dogrudan auth istegi kurulamadi.')
  }

  const response = await runWithRetry(
    () => withServiceTimeout(
      (signal) => fetch(`${SUPABASE_URL}${path}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      }),
      { label: 'Dogrudan Supabase auth RPC istegi', timeoutMs: 5_000 },
    ),
    {
      label: 'Dogrudan Supabase auth RPC istegi',
      maxAttempts: 2,
    },
  )

  if (!response.ok) {
    throw await parseDirectSupabaseError(response)
  }
}

export function readSessionIdFromAccessToken(accessToken?: string | null) {
  if (!accessToken) return null
  const payload = decodeJwtPayload(accessToken)
  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim() : ''
  if (!sessionId) return null
  return UUID_PATTERN.test(sessionId) ? sessionId : null
}

export async function getCurrentAuthSessionId() {
  const snapshot = await getCurrentAuthSessionSnapshot()
  return snapshot?.sessionId || null
}

export async function getCurrentAccessToken() {
  const snapshot = await getCurrentAuthSessionSnapshot()
  return snapshot?.accessToken || null
}

export async function getCurrentAuthUserId() {
  const snapshot = await getCurrentAuthSessionSnapshot()
  return snapshot?.authUserId || null
}

export async function getCurrentAuthenticatedEmail() {
  const snapshot = await getCurrentAuthSessionSnapshot()
  return snapshot?.email || null
}

export async function getCurrentAccountSecurityAuthSnapshot() {
  return await getCurrentAuthSessionSnapshot()
}

async function readCurrentClientSessionId() {
  const snapshot = await getCurrentAuthSessionSnapshot().catch(() => null)
  return snapshot?.sessionId || null
}

function normalizeSessionGuardState(value: unknown): SessionGuardState {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized === 'match' || normalized === 'missing' || normalized === 'replaced') {
    return normalized
  }
  return 'unsupported'
}

async function readMySessionGuardState(sessionId: string): Promise<SessionGuardState> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_my_session_guard_state', {
      p_session_id: sessionId,
    }), signal),
    { label: 'Aktif oturum koruma durumunu okuma' },
  )

  if (error) {
    if (isSingleSessionInfraMissingError(error)) {
      return 'unsupported'
    }
    throw error
  }

  return normalizeSessionGuardState(Array.isArray(data) ? data[0] : data)
}

export async function syncSessionContext(sessionId: string, accessToken?: string | null) {
  const context = getClientSessionContext()

  if (accessToken) {
    for (const delayMs of [0, 150, 400]) {
      if (delayMs > 0) {
        await sleep(delayMs)
      }

      try {
        await callDirectSupabaseJson('/rest/v1/rpc/record_auth_session_context', accessToken, {
          p_session_id: sessionId,
          p_device_id: context.deviceId,
          p_device_label: context.deviceLabel,
          p_platform: context.platform,
          p_browser: context.browser,
          p_user_agent: context.userAgent,
        })
        return true
      } catch (error) {
        if (isSingleSessionInfraMissingError(error)) {
          return false
        }

        if (isSingleSessionAuthError(error) || isSessionPropagationDelayError(error)) {
          continue
        }

        throw error
      }
    }
  }

  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('record_auth_session_context', {
      p_session_id: sessionId,
      p_device_id: context.deviceId,
      p_device_label: context.deviceLabel,
      p_platform: context.platform,
      p_browser: context.browser,
      p_user_agent: context.userAgent,
    }), signal),
    { label: 'Oturum baglamini kaydetme' },
  )

  if (error) {
    if (isSingleSessionInfraMissingError(error)) {
      return false
    }
    if (isSingleSessionAuthError(error) || isSessionPropagationDelayError(error)) {
      return false
    }
    throw error
  }

  return true
}

async function claimActiveSession(sessionId: string, accessToken?: string | null) {
  if (accessToken) {
    let lastTransientError: unknown = null

    for (const delayMs of [0, 150, 400, 900]) {
      if (delayMs > 0) {
        await sleep(delayMs)
      }

      try {
        await callDirectSupabaseJson('/rest/v1/rpc/claim_active_session', accessToken, {
          p_session_id: sessionId,
        })
        return true
      } catch (error) {
        if (isSingleSessionInfraMissingError(error) || isSingleSessionClaimInputError(error)) {
          authLogger.warn('single-session claim skipped; migration eksigi veya gecersiz session id olabilir.', error)
          return false
        }

        if (isSingleSessionAuthError(error) || isSessionPropagationDelayError(error)) {
          lastTransientError = error
          continue
        }

        throw error
      }
    }

    if (lastTransientError) {
      authLogger.warn('direct single-session claim tekrar denendi ama auth session henuz hazir degildi; istemci RPC fallback deneniyor.', lastTransientError)
    }
  }

  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('claim_active_session', {
      p_session_id: sessionId,
    }), signal),
    { label: 'Aktif oturumu claim etme' },
  )

  if (error) {
    if (
      isSingleSessionInfraMissingError(error)
      || isSingleSessionClaimInputError(error)
      || isSingleSessionAuthError(error)
    ) {
      authLogger.warn('single-session claim skipped; migration eksigi veya gecersiz session id olabilir.', error)
      return false
    }
    throw error
  }

  return true
}

export async function activateSingleSession(
  sessionId: string,
  shouldRevokeOtherSessions = true,
  accessToken?: string | null,
  authUserId?: string | null,
) {
  const claimed = await claimActiveSession(sessionId, accessToken)

  if (claimed) {
    await syncSessionContext(sessionId, accessToken)
  }

  if (claimed && authUserId) {
    emitActiveSessionClaimed({
      authUserId,
      sessionId,
      claimedAt: Date.now(),
    })
  }

  if (!shouldRevokeOtherSessions) return

  // Note: the browser-side "scope=others" auth endpoint behaves inconsistently in this project, so
  // the real source of single-session enforcement is the DB claim + client guard chain.
  if (!claimed) {
    authLogger.warn('single-session DB guard devrede degil; yeni login oturum claim edilemedi.')
  }
}

export async function ensureExpectedSession(sessionId: string | null): Promise<SessionGuardState> {
  if (!sessionId) return 'missing'

  const initialState = await readMySessionGuardState(sessionId)
  if (initialState !== 'replaced') {
    return initialState
  }

  for (const delayMs of SESSION_RECONCILE_DELAYS_MS) {
    await sleep(delayMs)
    const nextSessionId = await readCurrentClientSessionId()
    if (!nextSessionId) continue

    const nextState = await readMySessionGuardState(nextSessionId)
    if (nextState !== 'replaced') {
      return nextState
    }
  }

  throw new Error(SESSION_REPLACED_ERROR)
}

export function isSessionReplacedError(error: unknown) {
  return error instanceof Error && error.message === SESSION_REPLACED_ERROR
}

async function createUserProfile(authUser: MinimalAuthUser, preferredUsername?: string): Promise<DbUser> {
  const baseUsername = getPreferredUsername(authUser, preferredUsername)
  const baseSlug = slugifyUsername(baseUsername)

  for (let i = 0; i < 5; i += 1) {
    const suffix = i === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`
    const usernameSlug = `${baseSlug}${suffix}`

    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('users')
          .insert({
            auth_user_id: authUser.id,
            username: baseUsername,
            username_slug: usernameSlug,
            avatar_url: null,
            role: 'user',
          })
          .select('id')
          .single<{ id: string }>(),
        signal,
      ),
      { label: 'Kullanici profilini olusturma' },
    )

    if (!error && data?.id) {
      const created = await findUserByAuthId(authUser.id)
      if (created) return created
      throw new Error('Olusan kullanici profili tekrar okunamadi.')
    }

    if ((error as { code?: string } | null)?.code === '23505') {
      const alreadyCreated = await findUserByAuthId(authUser.id)
      if (alreadyCreated) return alreadyCreated
      continue
    }

    throw error ?? new Error('Kullanici profili olusturulamadi.')
  }

  throw new Error('Kullanici adi olusturulamadi. Lutfen farkli bir kullanici adi deneyin.')
}

export async function ensureUserProfile(authUser: MinimalAuthUser, preferredUsername?: string): Promise<AppUser> {
  const existing = await findUserByAuthId(authUser.id)
  if (existing) {
    const mapped = mapDbUserToAppUser(existing, authUser.id)
    ensureUserCanUseApp(mapped)
    return mapped
  }

  const created = await createUserProfile(authUser, preferredUsername)
  const mapped = mapDbUserToAppUser(created, authUser.id)
  ensureUserCanUseApp(mapped)
  return mapped
}

export function toFriendlyAuthError(error: unknown, fallback: string) {
  return toAppErrorMessage(error, fallback)
}


export { listenActiveSessionClaims } from './sessionDeviceContext'
export { isAuthSessionMissingError } from './sessionGuardUtils'
