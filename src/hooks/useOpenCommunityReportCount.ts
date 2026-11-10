import { useEffect, useState } from 'react'
import { communityAdmin } from '@/services/communityAdminService'
import { createScopedLogger } from '@/services/logger'

const logger = createScopedLogger('admin.communityReportCount')

/**
 * "Community" badge in the admin sidebar: open message reports across all
 * servers. Refreshes when the section changes; the Community page updates it right away with
 * setCount as decisions are made. If it cannot be read, the badge silently stays 0.
 */
export function useOpenCommunityReportCount(refreshKey: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    communityAdmin.overview(controller.signal)
      .then((next) => { if (!controller.signal.aborted) setCount(next.reports_open) })
      .catch((error: unknown) => { if (!controller.signal.aborted) logger.warn('topluluk sikayet sayisi okunamadi', { error }) })
    return () => controller.abort()
  }, [refreshKey])
  return [count, setCount] as const
}
