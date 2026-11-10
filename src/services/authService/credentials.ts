import { withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { setPreferredAuthPersistenceMode, supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  activateSingleSession,
  ensureUserProfile,
  getMfaStateSummary,
  getPendingMfaChallenge,
  normalizeUsernameInput,
  readSessionIdFromAccessToken,
  releaseExpiredOwnBanIfNeeded,
  settleAuthenticatedSession,
  toFriendlyAuthError,
  validateUsernameInput,
} from './shared'
import { hydrateAppUserAccountEconomy } from './economy'
import { hydrateAppUserAccountRuntime } from './runtime'
import type { AppUser, PendingMfaChallenge, SignInResult, SignUpResult } from './types'

const authCredentialsLogger = createScopedLogger('authService/credentials')

type AuthPersistenceOptions = {
  persistAcrossBrowserRestart?: boolean
}

function applyRequestedAuthPersistence(options?: AuthPersistenceOptions) {
  setPreferredAuthPersistenceMode(options?.persistAcrossBrowserRestart === true ? 'local' : 'session')
}

export async function signUpWithEmail(
  email: string,
  password: string,
  username: string,
  options?: AuthPersistenceOptions,
): Promise<SignUpResult> {
  const requestContext = createRequestContext('authService/credentials', 'signUpWithEmail', { email })
  const normalizedUsername = normalizeUsernameInput(username)
  const usernameValidationError = validateUsernameInput(normalizedUsername)
  if (usernameValidationError) {
    throw new Error(usernameValidationError)
  }

  applyRequestedAuthPersistence(options)

  const { data: signUpData, error: signUpError } = await withServiceTimeout(
    () => supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: normalizedUsername,
        },
      },
    }),
    { label: 'authService.signUpWithEmail' },
  )

  if (signUpError) {
    authCredentialsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(signUpError, 'Kayit islemi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext, { username: normalizedUsername }),
      error: signUpError,
    })
    throw new Error(toFriendlyAuthError(signUpError, 'Kayit islemi basarisiz oldu.'))
  }

  const authUser = signUpData.user
  if (!authUser) {
    throw new Error('Kullanici kaydi tamamlanamadi (auth user yok).')
  }

  if (!signUpData.session) {
    return {
      status: 'email_confirmation_required',
      email,
    }
  }

  const appUser = await hydrateAppUserAccountEconomy(
    await hydrateAppUserAccountRuntime(
      await ensureUserProfile(authUser, normalizedUsername),
    ),
  )
  await settleAuthenticatedSession(signUpData.session, authUser.id)
  const sessionId = readSessionIdFromAccessToken(signUpData.session.access_token)
  if (sessionId) {
    await activateSingleSession(sessionId, true, signUpData.session.access_token, authUser.id)
  }
  return {
    status: 'authenticated',
    user: appUser,
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
  options?: AuthPersistenceOptions,
): Promise<SignInResult> {
  const requestContext = createRequestContext('authService/credentials', 'signInWithEmail', { email })
  applyRequestedAuthPersistence(options)
  const { data, error } = await withServiceTimeout(
    () => supabase.auth.signInWithPassword({ email, password }),
    { label: 'authService.signInWithEmail' },
  )
  if (error) {
    authCredentialsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Giris islemi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw new Error(toFriendlyAuthError(error, 'Giris islemi basarisiz oldu.'))
  }

  const authUser = data.user
  if (!authUser) {
    throw new Error('Giris basarisiz (auth user yok).')
  }

  await settleAuthenticatedSession(data.session, authUser.id)
  await releaseExpiredOwnBanIfNeeded()
  const appUser = await hydrateAppUserAccountEconomy(
    await hydrateAppUserAccountRuntime(
      await ensureUserProfile(authUser),
    ),
  )

  const mfaState = await getMfaStateSummary()
  const pendingChallenge = getPendingMfaChallenge(mfaState, authUser.email ?? email)
  if (pendingChallenge) {
    return {
      status: 'mfa_required',
      challenge: pendingChallenge,
    }
  }

  const sessionId = readSessionIdFromAccessToken(data.session?.access_token || null)
  if (sessionId) {
    await activateSingleSession(sessionId, true, data.session?.access_token || null, authUser.id)
  }
  return {
    status: 'authenticated',
    user: appUser,
  }
}

function normalizeTotpCode(code: string) {
  return code.replace(/\s+/g, '').trim()
}

function validateTotpCode(code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Lutfen 6 haneli dogrulama kodunu girin.')
  }
}

export async function verifyPendingMfaChallenge(
  challenge: PendingMfaChallenge,
  code: string,
): Promise<AppUser> {
  const requestContext = createRequestContext('authService/credentials', 'verifyPendingMfaChallenge', {
    factorId: challenge.factorId,
    email: challenge.email,
  })
  const normalizedCode = normalizeTotpCode(code)
  validateTotpCode(normalizedCode)

  const { data, error } = await withServiceTimeout(
    () => supabase.auth.mfa.challengeAndVerify({
      factorId: challenge.factorId,
      code: normalizedCode,
    }),
    { label: 'authService.verifyPendingMfaChallenge' },
  )

  if (error) {
    authCredentialsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Iki asamali dogrulama basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw new Error(toFriendlyAuthError(error, 'Iki asamali dogrulama basarisiz oldu.'))
  }

  await settleAuthenticatedSession(data, data.user.id)
  await releaseExpiredOwnBanIfNeeded()
  const appUser = await hydrateAppUserAccountEconomy(
    await hydrateAppUserAccountRuntime(
      await ensureUserProfile(data.user),
    ),
  )
  const sessionId = readSessionIdFromAccessToken(data.access_token)
  if (sessionId) {
    await activateSingleSession(sessionId, true, data.access_token, data.user.id)
  }

  return appUser
}
