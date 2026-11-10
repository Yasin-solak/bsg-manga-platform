import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'

const profilePageLogger = createScopedLogger('ProfilePage')

export function warnProfilePageIssue(
  event: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const requestContext = createRequestContext('ProfilePage', event, context)
  profilePageLogger.warn({
    event: requestContext.event,
    message,
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

export function reportProfilePageError(
  event: string,
  error: unknown,
  fallback: string,
  context?: Record<string, unknown>,
) {
  const requestContext = createRequestContext('ProfilePage', event, context)
  return reportUserFacingError(profilePageLogger, {
    event: requestContext.event,
    error,
    fallback,
    requestContext,
  })
}
