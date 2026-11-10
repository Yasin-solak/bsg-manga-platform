import { supabase } from './supabase'
import { isMfaFeatureEnabled } from './accountSecurityFeatureService'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { toAppErrorMessage } from './errorMessageService'
import {
  activateSingleSession,
  clearCurrentAuthSessionSnapshotCache,
  clearMfaStateSummaryCache,
  getCurrentAccountSecurityAuthSnapshot,
  getCurrentAuthenticatedEmail,
  getCurrentAuthSessionId,
  getMfaStateSummary,
  readSessionIdFromAccessToken,
  settleAuthenticatedSession,
  syncSessionContext,
} from './authService/shared'
import type { MfaStateSummary } from './authService'

export type AccountMfaStatus = 'enabled' | 'disabled' | 'unknown'

export interface AccountSecuritySnapshot {
  email: string
  emailVerifiedAt: string | null
  lastSignInAt: string | null
  currentSessionExpiresAt: string | null
  mfaStatus: AccountMfaStatus
  mfaState: MfaStateSummary | null
}

export interface TotpEnrollmentSetup {
  factorId: string
  friendlyName: string
  qrCodeDataUrl: string
  secret: string
  uri: string
}

export interface AccountSessionEntry {
  sessionId: string
  claimedAt: string
  lastSeenAt: string | null
  deviceId: string | null
  deviceLabel: string
  platform: string | null
  browser: string | null
  userAgent: string | null
  isActive: boolean
  isCurrentDevice: boolean
  isRevoked: boolean
  revokedAt: string | null
  revokeReason: string | null
}

type AccountSessionRow = {
  session_id: string
  claimed_at: string
  last_seen_at: string | null
  device_id: string | null
  device_label: string | null
  platform: string | null
  browser: string | null
  user_agent: string | null
  is_active: boolean
  is_revoked: boolean
  revoked_at: string | null
  revoke_reason: string | null
}

function isAccountSessionInfraMissingError(error: unknown) {
  const typed = error as { code?: string; message?: string; details?: string } | null
  const code = typed?.code || ''
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()

  return (
    code === 'PGRST202'
    || code === '42883'
    || code === '42P01'
    || code === '42703'
    || message.includes('auth_session_events')
    || message.includes('list_my_auth_sessions')
    || message.includes('record_auth_session_context')
    || message.includes('revoke_auth_session')
    || details.includes('auth_session_events')
    || details.includes('list_my_auth_sessions')
    || details.includes('record_auth_session_context')
    || details.includes('revoke_auth_session')
  )
}

function buildAccountSessionInfraError() {
  return new Error('Bu ozellik icin 20260228235908_account_session_management_phase2.sql migration dosyasini calistirin.')
}

function buildFriendlyMfaError(error: unknown, fallback: string) {
  return new Error(toAppErrorMessage(error, fallback))
}

function normalizeTotpCode(code: string) {
  return code.replace(/\s+/g, '').trim()
}

function getVerifiedMfaStatus(mfaState: MfaStateSummary | null): AccountMfaStatus {
  if (!mfaState) return 'unknown'
  return mfaState.factors.some((factor) => factor.status === 'verified')
    ? 'enabled'
    : 'disabled'
}

async function getCurrentSessionId() {
  return await getCurrentAuthSessionId()
}

export async function getMyAccountSecuritySnapshot(): Promise<AccountSecuritySnapshot> {
  const snapshot = await getCurrentAccountSecurityAuthSnapshot()
  if (!snapshot) {
    throw new Error('Aktif kullanici oturumu bulunamadi.')
  }

  let mfaState: MfaStateSummary | null = null
  if (isMfaFeatureEnabled()) {
    try {
      mfaState = await getMfaStateSummary()
    } catch {
      mfaState = null
    }
  }

  return {
    email: snapshot.email || '',
    emailVerifiedAt: snapshot.emailVerifiedAt || null,
    lastSignInAt: snapshot.lastSignInAt || null,
    currentSessionExpiresAt: snapshot.sessionExpiresAt || null,
    mfaStatus: getVerifiedMfaStatus(mfaState),
    mfaState,
  }
}

export async function sendPasswordResetForCurrentUser(origin: string) {
  const email = await getCurrentAuthenticatedEmail()
  if (!email) {
    throw new Error('E-posta bulunamadi.')
  }

  const { error: resetError } = await withServiceTimeout(
    () => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/giris`,
    }),
    { label: 'Sifre sifirlama e-postasi gonderme' },
  )
  if (resetError) throw resetError
}

export async function signOutOtherSessions() {
  const { error } = await withServiceTimeout(
    () => supabase.auth.signOut({ scope: 'others' }),
    { label: 'Diger oturumlari kapatma' },
  )
  if (error) throw error
}

export async function beginTotpEnrollment(friendlyName?: string): Promise<TotpEnrollmentSetup> {
  if (!isMfaFeatureEnabled()) {
    throw new Error('2FA su anda aktif degil.')
  }

  let existingState: MfaStateSummary | null = null
  try {
    existingState = await getMfaStateSummary({ force: true })
  } catch (error) {
    throw buildFriendlyMfaError(error, '2FA durumu okunamadi.')
  }

  const pendingFactors = (existingState?.factors || []).filter(
    (factor) => factor.factorType === 'totp' && factor.status === 'unverified',
  )

  for (const factor of pendingFactors) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) {
      throw buildFriendlyMfaError(error, 'Eski 2FA kurulumu temizlenemedi.')
    }
  }

  const finalFriendlyName = friendlyName?.trim() || 'BSG Manga Authenticator'
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: finalFriendlyName,
    issuer: 'BSG Manga',
  })

  if (error) {
    throw buildFriendlyMfaError(error, '2FA kurulumu baslatilamadi.')
  }

  const qrCodeDataUrl = data.totp.qr_code.startsWith('data:image')
    ? data.totp.qr_code
    : `data:image/svg+xml;utf-8,${data.totp.qr_code}`

  return {
    factorId: data.id,
    friendlyName: data.friendly_name || finalFriendlyName,
    qrCodeDataUrl,
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

export async function verifyTotpEnrollment(
  factorId: string,
  code: string,
): Promise<AccountSecuritySnapshot> {
  if (!isMfaFeatureEnabled()) {
    throw new Error('2FA su anda aktif degil.')
  }

  const normalizedCode = normalizeTotpCode(code)
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error('Lutfen 6 haneli dogrulama kodunu girin.')
  }

  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalizedCode,
  })

  if (error) {
    throw buildFriendlyMfaError(error, '2FA dogrulamasi basarisiz oldu.')
  }

  clearCurrentAuthSessionSnapshotCache()
  clearMfaStateSummaryCache()
  await settleAuthenticatedSession(data)
  const sessionId = readSessionIdFromAccessToken(data.access_token)
  if (sessionId) {
    await activateSingleSession(sessionId, true, data.access_token, data.user.id)
  }

  return getMyAccountSecuritySnapshot()
}

export async function disableMfaFactor(factorId: string): Promise<AccountSecuritySnapshot> {
  if (!isMfaFeatureEnabled()) {
    throw new Error('2FA su anda aktif degil.')
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    throw buildFriendlyMfaError(error, '2FA kaldirilamadi.')
  }

  clearMfaStateSummaryCache()
  return getMyAccountSecuritySnapshot()
}

export async function listMyAccountSessions(): Promise<AccountSessionEntry[]> {
  const currentSessionId = await getCurrentSessionId()
  if (currentSessionId) {
    try {
      await syncSessionContext(currentSessionId)
    } catch (error) {
      if (!isAccountSessionInfraMissingError(error)) throw error
    }
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('list_my_auth_sessions'), signal),
    { label: 'Hesap oturumlarini listeleme' },
  )
  if (error) {
    if (isAccountSessionInfraMissingError(error)) throw buildAccountSessionInfraError()
    throw error
  }

  return ((data || []) as AccountSessionRow[])
    .slice(0, 5)
    .map((row) => ({
      sessionId: row.session_id,
      claimedAt: row.claimed_at,
      lastSeenAt: row.last_seen_at,
      deviceId: row.device_id,
      deviceLabel: row.device_label?.trim() || 'Bilinmeyen cihaz',
      platform: row.platform,
      browser: row.browser,
      userAgent: row.user_agent,
      isActive: row.is_active === true,
      isCurrentDevice: currentSessionId != null && row.session_id === currentSessionId,
      isRevoked: row.is_revoked === true,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
    }))
}

export async function revokeAccountSession(sessionId: string, reason?: string) {
  const currentSessionId = await getCurrentSessionId()
  if (currentSessionId && currentSessionId === sessionId) {
    throw new Error('Bu cihazdaki aktif oturumu bu listeden kapatamazsin.')
  }

  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('revoke_auth_session', {
      p_session_id: sessionId,
      p_reason: reason?.trim() || null,
    }), signal),
    { label: 'Hesap oturumunu sonlandirma' },
  )

  if (error) {
    if (isAccountSessionInfraMissingError(error)) throw buildAccountSessionInfraError()
    throw error
  }
}
