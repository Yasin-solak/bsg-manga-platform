import { useEffect, useState } from 'react'
import { countOpenSupportRequests } from '@/services/supportRequestService'
import { createScopedLogger } from '@/services/logger'

const logger = createScopedLogger('admin.supportCount')

/**
 * "Support requests" badge in the admin sidebar. Refreshes when the section changes;
 * if it cannot be read, the badge silently stays 0 (the page shows no error).
 */
export function useOpenSupportRequestCount(refreshKey: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    countOpenSupportRequests(controller.signal)
      .then((next) => { if (!controller.signal.aborted) setCount(next) })
      .catch((error: unknown) => { if (!controller.signal.aborted) logger.warn('destek talebi sayisi okunamadi', { error }) })
    return () => controller.abort()
  }, [refreshKey])
  return count
}
