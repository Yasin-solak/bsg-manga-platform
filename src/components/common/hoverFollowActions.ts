import { useEffect } from 'react'
import type { ScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { isAbortError } from '@/services/supabaseError'
import { toast } from '@/services/toastService'
import { reportUserFacingError } from '@/services/userFacingError'
import { txa } from '@/i18n/activeLocale'

interface LoadHoverFollowStateOptions {
  logger: ScopedLogger
  scope: string
  currentUserId: string
  targetId: string
  targetContextKey: string
  message: string
  load: () => Promise<boolean>
  apply: (value: boolean) => void
  applyLoading: (value: boolean) => void
  isCancelled: () => boolean
}

export async function loadHoverFollowState({
  logger,
  scope,
  currentUserId,
  targetId,
  targetContextKey,
  message,
  load,
  apply,
  applyLoading,
  isCancelled,
}: LoadHoverFollowStateOptions) {
  try {
    const followState = await load()
    if (!isCancelled()) apply(followState)
  } catch (error) {
    if (isCancelled() || isAbortError(error)) return
    const requestContext = createRequestContext(scope, 'load-follow-state', {
      currentUserId,
      [targetContextKey]: targetId,
    })
    logger.warn({
      event: requestContext.event,
      message,
      context: requestContext.context,
      error,
    })
  } finally {
    if (!isCancelled()) applyLoading(false)
  }
}

interface RunOptimisticHoverFollowToggleOptions {
  logger: ScopedLogger
  scope: string
  currentUserId: string
  targetId: string
  targetContextKey: string
  isActionLoading: boolean
  isFollowing: boolean
  displayFollowerCount: number
  setActionLoading: (value: boolean) => void
  setFollowing: (value: boolean) => void
  setDisplayFollowerCount: (value: number | ((prev: number) => number)) => void
  /** 'requested': gizli hesaba takip istegi gitti (takip baslamadi). */
  follow: () => Promise<void | 'following' | 'requested'>
  unfollow: () => Promise<void>
  onHydratedCountSync?: (nextFollowState: boolean) => void
  missingTargetMessage: string
  missingCurrentUserMessage: string
  successFollowMessage: string
  successUnfollowMessage: string
  failureFallback: string
  blockedMessage?: string
}

export async function runOptimisticHoverFollowToggle({
  logger,
  scope,
  currentUserId,
  targetId,
  targetContextKey,
  isActionLoading,
  isFollowing,
  displayFollowerCount,
  setActionLoading,
  setFollowing,
  setDisplayFollowerCount,
  follow,
  unfollow,
  onHydratedCountSync,
  missingTargetMessage,
  missingCurrentUserMessage,
  successFollowMessage,
  successUnfollowMessage,
  failureFallback,
  blockedMessage,
}: RunOptimisticHoverFollowToggleOptions) {
  if (!targetId) {
    toast.info(missingTargetMessage)
    return
  }
  if (!currentUserId) {
    toast.info(missingCurrentUserMessage)
    return
  }
  if (isActionLoading) return

  const nextFollowState = !isFollowing
  const followerCountBefore = displayFollowerCount
  setActionLoading(true)
  setFollowing(nextFollowState)
  setDisplayFollowerCount((prev) => (nextFollowState ? prev + 1 : Math.max(0, prev - 1)))

  try {
    if (nextFollowState) {
      const status = await follow()
      if (status === 'requested') {
        // Private account: following did not start, a request was sent; the optimistic state is rolled back.
        setFollowing(false)
        setDisplayFollowerCount(followerCountBefore)
        toast.info(txa('Takip isteği gönderildi. Onaylanınca profili görebilirsin.'))
        return
      }
      toast.success(successFollowMessage)
    } else {
      await unfollow()
      toast.info(successUnfollowMessage)
    }
    onHydratedCountSync?.(nextFollowState)
  } catch (error) {
    const requestContext = createRequestContext(scope, `toggle-follow-${targetContextKey}`, {
      currentUserId,
      [targetContextKey]: targetId,
      nextFollowState,
    })
    const reportedError = reportUserFacingError(logger, {
      event: requestContext.event,
      error,
      fallback: failureFallback,
      requestContext,
    })
    setFollowing(!nextFollowState)
    setDisplayFollowerCount(followerCountBefore)
    const technicalMessage = reportedError.technicalMessage?.toLowerCase() || ''
    if (blockedMessage && technicalMessage.includes('engelleme')) {
      toast.info(blockedMessage)
      return
    }
    toast.error(reportedError.userMessage)
  } finally {
    setActionLoading(false)
  }
}

interface UseHoverFollowStateLoaderOptions {
  deps: readonly unknown[]
  enabled: boolean
  blocked?: boolean
  onBlocked?: () => void
  logger: ScopedLogger
  scope: string
  currentUserId: string
  targetId: string
  targetContextKey: string
  message: string
  load: () => Promise<boolean>
  apply: (value: boolean) => void
  applyLoading: (value: boolean) => void
}

export function useHoverFollowStateLoader({
  deps,
  enabled,
  blocked = false,
  onBlocked,
  logger,
  scope,
  currentUserId,
  targetId,
  targetContextKey,
  message,
  load,
  apply,
  applyLoading,
}: UseHoverFollowStateLoaderOptions) {
  useEffect(() => {
    if (!enabled || !currentUserId || !targetId) return
    if (blocked) {
      onBlocked?.()
      return
    }

    let cancelled = false
    applyLoading(true)

    void (async () => {
      await loadHoverFollowState({
        logger,
        scope,
        currentUserId,
        targetId,
        targetContextKey,
        message,
        load,
        apply,
        applyLoading,
        isCancelled: () => cancelled,
      })
    })()

    return () => {
      cancelled = true
    }
  }, deps)
}

interface ResetHoverFollowStateOptions {
  setFollowing: (value: boolean) => void
  setFollowStateLoading: (value: boolean) => void
  setFollowActionLoading: (value: boolean) => void
  setDisplayFollowerCount: (value: number) => void
  setIsActionMenuOpen: (value: boolean) => void
  resetExtra?: () => void
}

export function resetHoverFollowState({
  setFollowing,
  setFollowStateLoading,
  setFollowActionLoading,
  setDisplayFollowerCount,
  setIsActionMenuOpen,
  resetExtra,
}: ResetHoverFollowStateOptions) {
  setFollowing(false)
  setFollowStateLoading(false)
  setFollowActionLoading(false)
  setDisplayFollowerCount(0)
  setIsActionMenuOpen(false)
  resetExtra?.()
}

export function syncHoverFollowerCount(
  resolvedFollowerCount: number,
  setDisplayFollowerCount: (value: number) => void,
) {
  setDisplayFollowerCount(resolvedFollowerCount)
}

export function createHydratedFollowerCountSync<TData extends { followerCount: number }>({
  setHydrated,
}: {
  setHydrated: (value: TData | null | ((prev: TData | null) => TData | null)) => void
}) {
  return (nextFollowState: boolean) => {
    setHydrated((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        followerCount: nextFollowState ? prev.followerCount + 1 : Math.max(0, prev.followerCount - 1),
      }
    })
  }
}
