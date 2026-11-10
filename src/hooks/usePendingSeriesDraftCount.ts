import { useEffect, useState } from 'react'
import { countPendingSeriesDrafts } from '@/services/translationStudioService'
import { createScopedLogger } from '@/services/logger'

const logger = createScopedLogger('admin.seriesRequests')

/**
 * Translation Studio series requests appear as a badge in the admin menu and a banner in
 * "Pending Approval" (in a separate tab they were being missed). Refreshes when the section changes.
 */
export function usePendingSeriesDraftCount(refreshKey: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    countPendingSeriesDrafts(controller.signal)
      .then((next) => { if (!controller.signal.aborted) setCount(next) })
      .catch((error: unknown) => { if (!controller.signal.aborted) logger.warn('seri talebi sayisi okunamadi', { error }) })
    return () => controller.abort()
  }, [refreshKey])
  return count
}
