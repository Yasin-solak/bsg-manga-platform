import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { withServiceTimeout } from '../apiResilience'
import {
  activateSingleSession,
  buildMfaRequiredError,
  clearCurrentAuthSessionSnapshotCache,
  ensureAuthenticatedClientState,
  ensureExpectedSession,
  ensureUserProfile,
  getCurrentAuthSessionSnapshot,
  getMfaStateSummary,
  getPendingMfaChallenge,
  isAuthSessionMissingError,
  isSessionReplacedError,
  releaseExpiredOwnBanIfNeeded,
} from './shared'
import { hydrateAppUserAccountEconomy } from './economy'
import { hydrateAppUserAccountRuntime } from './runtime'
import type { AppUser } from './types'

const authSessionLogger = createScopedLogger('authSession')

async function clearLocalSession() {
  await withServiceTimeout(
    () => supabase.auth.signOut({ scope: 'local' }),
    { label: 'Yerel oturumu kapatma' },
  ).catch(() => undefined)
}

async function clearLocalSessionIfStillMissing() {
  const { data } = await withServiceTimeout(
    () => supabase.auth.getSession(),
    { label: 'Yerel oturumu yeniden kontrol etme' },
  ).catch(() => ({ data: { session: null } }))
  if (data.session) {
    return false
  }

  await clearLocalSession()
  return true
}

export async function signOut(): Promise<void> {
  const requestContext = createRequestContext('authSession', 'sign-out')
  const { error } = await withServiceTimeout(
    () => supabase.auth.signOut(),
    { label: 'Kullanici cikis islemi' },
  )
  if (error) {
    authSessionLogger.error({
      event: 'sign-out-failed',
      message: toUserFacingErrorMessage(error, 'Cikis islemi tamamlanamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
}

export async function fetchCurrentUser(): Promise<AppUser | null> {
  const requestContext = createRequestContext('authSession', 'fetch-current-user')
  let authSnapshot = null

  try {
    authSnapshot = await getCurrentAuthSessionSnapshot({ force: true })
    if (!authSnapshot?.authUserId) {
      const settled = await ensureAuthenticatedClientState()
      if (settled) {
        authSnapshot = await getCurrentAuthSessionSnapshot({ force: true })
      }
    }
  } catch (error) {
    if (isAuthSessionMissingError(error)) {
      await clearLocalSessionIfStillMissing()
      return null
    }

    authSessionLogger.error({
      event: 'fetch-current-user-auth-snapshot-failed',
      message: toUserFacingErrorMessage(error, 'Kullanici oturumu okunamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  if (!authSnapshot?.authUserId) return null

  try {
    await releaseExpiredOwnBanIfNeeded()
    const user = await hydrateAppUserAccountEconomy(
      await hydrateAppUserAccountRuntime(
        await ensureUserProfile({
          id: authSnapshot.authUserId,
          email: authSnapshot.email || undefined,
        }),
      ),
    )
    const pendingMfaChallenge = getPendingMfaChallenge(await getMfaStateSummary(), authSnapshot.email || null)
    if (pendingMfaChallenge) {
      throw buildMfaRequiredError(pendingMfaChallenge)
    }
    const sessionId = authSnapshot.sessionId
    const sessionGuardState = await ensureExpectedSession(sessionId)

    if (sessionGuardState === 'missing' && sessionId) {
      await activateSingleSession(
        sessionId,
        true,
        authSnapshot.accessToken || null,
        authSnapshot.authUserId,
      )
      clearCurrentAuthSessionSnapshotCache()
    }

    return user
  } catch (error) {
    if (isSessionReplacedError(error)) {
      // If this device is no longer the active session, do not stay half authenticated.
      await clearLocalSession()
      throw error
    }
    await clearLocalSessionIfStillMissing()
    if (error instanceof Error && (error.message.includes('banli') || error.message.includes('pasif'))) {
      return null
    }
    throw error
  }
}

