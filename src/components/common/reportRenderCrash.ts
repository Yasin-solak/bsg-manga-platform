import type { ErrorInfo } from 'react'
import { createScopedLogger } from '@/services/logger'

const logger = createScopedLogger('AppErrorBoundary')

/**
 * Shared render-crash report for every error boundary (app-wide, route-level and silent widgets),
 * so all of them land in the same diagnostics channel.
 */
export function reportRenderCrash(
  error: Error,
  errorInfo: ErrorInfo,
  details: { resetKey?: string, boundary?: string } = {},
) {
  logger.error({
    event: 'render-crash',
    message: 'Uygulama agaci render sirasinda yakalandi',
    context: {
      boundary: details.boundary ?? 'app',
      resetKey: details.resetKey,
      componentStack: errorInfo.componentStack,
    },
    error,
  })
}
