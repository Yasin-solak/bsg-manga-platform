import { useEffect } from 'react'
import type { ScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import type { ResolvedUserHoverData } from '@/services/hoverCardService/types'
import { isAbortError } from '@/services/supabaseError'

type UserHoverMembership = ResolvedUserHoverData['fansubMemberships'][number]

interface UseUserHoverBlockStateLoaderOptions {
  deps: readonly unknown[]
  enabled: boolean
  logger: ScopedLogger
  scope: string
  currentUserId: string
  targetUserId: string
  message: string
  load: () => Promise<{
    blockedByCurrentUser: boolean
  }>
  applyBlocked: (value: boolean) => void
  applyLoading: (value: boolean) => void
}

export function useUserHoverBlockStateLoader({
  deps,
  enabled,
  logger,
  scope,
  currentUserId,
  targetUserId,
  message,
  load,
  applyBlocked,
  applyLoading,
}: UseUserHoverBlockStateLoaderOptions) {
  useEffect(() => {
    if (!enabled || !currentUserId || !targetUserId) return

    let cancelled = false
    applyLoading(true)

    void (async () => {
      try {
        const blockState = await load()
        if (!cancelled) {
          applyBlocked(blockState.blockedByCurrentUser)
        }
      } catch (error) {
        if (cancelled || isAbortError(error)) return
        const requestContext = createRequestContext(scope, 'load-block-state', {
          currentUserId,
          targetUserId,
        })
        logger.warn({
          event: requestContext.event,
          message,
          context: requestContext.context,
          error,
        })
      } finally {
        if (!cancelled) {
          applyLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, deps)
}

interface UseCurrentUserFansubMembershipLoaderOptions {
  deps: readonly unknown[]
  enabled: boolean
  logger: ScopedLogger
  scope: string
  currentUserId: string
  message: string
  load: () => Promise<Pick<ResolvedUserHoverData, 'fansubMemberships'> | null>
  applyMemberships: (memberships: UserHoverMembership[]) => void
}

export function useCurrentUserFansubMembershipLoader({
  deps,
  enabled,
  logger,
  scope,
  currentUserId,
  message,
  load,
  applyMemberships,
}: UseCurrentUserFansubMembershipLoaderOptions) {
  useEffect(() => {
    if (!enabled || !currentUserId) return

    let cancelled = false

    void (async () => {
      try {
        const hoverData = await load()
        if (!cancelled) {
          applyMemberships(hoverData?.fansubMemberships ?? [])
        }
      } catch (error) {
        if (cancelled || isAbortError(error)) return
        const requestContext = createRequestContext(scope, 'load-current-user-memberships', {
          currentUserId,
        })
        logger.warn({
          event: requestContext.event,
          message,
          context: requestContext.context,
          error,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, deps)
}
