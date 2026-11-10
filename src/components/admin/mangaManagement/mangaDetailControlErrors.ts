import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'

const mangaDetailControlLogger = createScopedLogger('admin.mangaDetailControl')

export function reportMangaDetailControlError(
  event: string,
  error: unknown,
  fallback: string,
  context?: Record<string, unknown>,
) {
  const requestContext = createRequestContext('admin.mangaDetailControl', event, context)
  return reportUserFacingError(mangaDetailControlLogger, {
    event: requestContext.event,
    error,
    fallback,
    requestContext,
  })
}
