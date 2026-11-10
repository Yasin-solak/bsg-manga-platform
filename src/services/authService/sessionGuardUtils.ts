export const SESSION_REPLACED_ERROR = 'SESSION_REPLACED'
export const MFA_REQUIRED_ERROR = 'MFA_REQUIRED'
export const SESSION_RECONCILE_DELAYS_MS = [120, 280, 520, 900] as const

export function isSingleSessionInfraMissingError(error: unknown) {
  const typed = error as { code?: string; message?: string; details?: string } | null
  const code = typed?.code || ''
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()

  return (
    code === 'PGRST202'
    || code === '42883'
    || code === '42P01'
    || code === '42703'
    || message.includes('claim_active_session')
    || message.includes('active_session_id')
    || message.includes('record_auth_session_context')
    || message.includes('list_my_auth_sessions')
    || message.includes('revoke_auth_session')
    || message.includes('auth_session_events')
    || details.includes('claim_active_session')
    || details.includes('active_session_id')
    || details.includes('record_auth_session_context')
    || details.includes('list_my_auth_sessions')
    || details.includes('revoke_auth_session')
    || details.includes('auth_session_events')
  )
}

export function isSingleSessionClaimInputError(error: unknown) {
  const typed = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const code = typed?.code || ''
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()
  const hint = (typed?.hint || '').toLowerCase()

  return (
    code === '22P02'
    || message.includes('invalid input syntax for type uuid')
    || details.includes('invalid input syntax for type uuid')
    || hint.includes('uuid')
  )
}

export function isSingleSessionAuthError(error: unknown) {
  const typed = error as {
    code?: string
    errorCode?: string
    message?: string
    details?: string
    hint?: string
    status?: number
  } | null
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()
  const hint = (typed?.hint || '').toLowerCase()
  const errorCode = (typed?.errorCode || '').toLowerCase()

  return (
    typed?.status === 400
    || typed?.status === 401
    || typed?.status === 403
    || errorCode === 'session_not_found'
    || message.includes('giris yapmalisiniz')
    || message.includes('jwt')
    || message.includes('forbidden')
    || message.includes('session from session_id claim in jwt does not exist')
    || details.includes('jwt')
    || hint.includes('jwt')
  )
}

export function isSessionPropagationDelayError(error: unknown) {
  const typed = error as {
    code?: string
    errorCode?: string
    message?: string
    details?: string
    status?: number
  } | null
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()
  const errorCode = (typed?.errorCode || '').toLowerCase()

  return Boolean(
    typed?.status === 403
      && (
        errorCode === 'session_not_found'
        || message.includes('session from session_id claim in jwt does not exist')
        || details.includes('session from session_id claim in jwt does not exist')
      ),
  )
}

export function isAuthSessionMissingError(error: unknown): boolean {
  const maybe = error as { name?: string; message?: string; status?: number; code?: string } | null
  const message = maybe?.message?.toLowerCase() || ''
  return (
    maybe?.name === 'AuthSessionMissingError'
    || maybe?.status === 401
    || maybe?.status === 403
    || maybe?.code === 'session_not_found'
    || message.includes('auth session missing')
    || message.includes('session not found')
    || message.includes('forbidden')
  )
}

export function isAbortLikeError(error: unknown) {
  const typed = error as { name?: string; message?: string; details?: string } | null
  const name = (typed?.name || '').toLowerCase()
  const message = (typed?.message || '').toLowerCase()
  const details = (typed?.details || '').toLowerCase()

  return (
    name === 'aborterror'
    || message.includes('signal is aborted')
    || details.includes('signal is aborted')
  )
}

export function decodeJwtPayload(accessToken: string) {
  const parts = accessToken.split('.')
  if (parts.length < 2) return null

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = atob(padded)
    return JSON.parse(decoded) as { session_id?: string | null }
  } catch {
    return null
  }
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
