import { toAppErrorMessage } from './errorMessageService'
import type { ScopedLogger } from './logger'
import { toRequestContextLogContext, type RequestContext } from './requestContext'

export interface UserFacingErrorPayload {
  userMessage: string
  technicalMessage: string | null
}

export interface ReportUserFacingErrorOptions {
  event: string
  error: unknown
  fallback?: string
  loggerMessage?: string
  context?: Record<string, unknown>
  requestContext?: RequestContext | null
}

export interface ReportedUserFacingErrorPayload extends UserFacingErrorPayload {
  requestId: string | null
}

export function toUserFacingErrorMessage(error: unknown, fallback = 'Islem sirasinda bir hata olustu.') {
  return toAppErrorMessage(error, fallback)
}

export function buildUserFacingErrorPayload(error: unknown, fallback = 'Islem sirasinda bir hata olustu.'): UserFacingErrorPayload {
  const technicalMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : null

  return {
    userMessage: toAppErrorMessage(error, fallback),
    technicalMessage,
  }
}

export function reportUserFacingError(
  logger: ScopedLogger,
  options: ReportUserFacingErrorOptions,
): ReportedUserFacingErrorPayload {
  const payload = buildUserFacingErrorPayload(options.error, options.fallback)
  const requestId = options.requestContext?.requestId || null
  const context = options.requestContext
    ? toRequestContextLogContext(options.requestContext, options.context)
    : (options.context || null)

  logger.error({
    event: options.event,
    message: options.loggerMessage || payload.technicalMessage || payload.userMessage,
    context: context || undefined,
    error: options.error,
  })

  return {
    ...payload,
    requestId,
  }
}
