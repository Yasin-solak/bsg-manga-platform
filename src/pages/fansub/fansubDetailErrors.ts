import { createScopedLogger } from '@/services/logger'
import { createRequestContext, toRequestContextLogContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'

const fansubDetailLogger = createScopedLogger('FansubDetailPage')

export function warnFansubDetailIssue(
  event: string,
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const requestContext = createRequestContext('FansubDetailPage', event, context)
  fansubDetailLogger.warn({
    event: requestContext.event,
    message,
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

export function reportFansubDetailError(
  event: string,
  error: unknown,
  fallback: string,
  context?: Record<string, unknown>,
) {
  const requestContext = createRequestContext('FansubDetailPage', event, context)
  return reportUserFacingError(fansubDetailLogger, {
    event: requestContext.event,
    error,
    fallback,
    requestContext,
  })
}
