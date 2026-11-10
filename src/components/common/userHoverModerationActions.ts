import type { MutableRefObject } from 'react'
import type { ScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'
import { isFeatureEnabled } from '@/services/featureFlagService'
import { userService } from '@/services/userService'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { toast } from '@/services/toastService'
import { closeHoverActionMenu } from './hoverMenuActions'
import { txa } from '@/i18n/activeLocale'

interface RunUserHoverBlockToggleOptions {
  logger: ScopedLogger
  currentUserId: string
  targetUserId: string
  isOwnHoverProfile: boolean
  isBlockActionLoading: boolean
  isBlockedByCurrentUser: boolean
  isFollowingUser: boolean
  displayFollowerCount: number
  setIsBlockActionLoading: (value: boolean) => void
  setIsBlockedByCurrentUser: (value: boolean) => void
  setIsFollowingUser: (value: boolean) => void
  setDisplayFollowerCount: (value: number | ((prev: number) => number)) => void
  actionMenuOpenRef: MutableRefObject<boolean>
  setIsActionMenuOpen: (value: boolean) => void
}

export async function runUserHoverBlockToggle({
  logger,
  currentUserId,
  targetUserId,
  isOwnHoverProfile,
  isBlockActionLoading,
  isBlockedByCurrentUser,
  isFollowingUser,
  displayFollowerCount,
  setIsBlockActionLoading,
  setIsBlockedByCurrentUser,
  setIsFollowingUser,
  setDisplayFollowerCount,
  actionMenuOpenRef,
  setIsActionMenuOpen,
}: RunUserHoverBlockToggleOptions) {
  if (isOwnHoverProfile) {
    toast.info(txa('Kendinizi engelleyemezsiniz.'))
    return
  }
  if (!currentUserId) {
    toast.info(txa('Kullanıcı engellemek için giriş yapmalısınız.'))
    return
  }
  if (!targetUserId) {
    toast.info(txa('Kullanıcı bilgisi yükleniyor, tekrar deneyin.'))
    return
  }
  if (isBlockActionLoading) return

  const nextBlockedState = !isBlockedByCurrentUser
  const followerCountBefore = displayFollowerCount
  const followingBefore = isFollowingUser

  setIsBlockActionLoading(true)

  if (nextBlockedState && isFollowingUser) {
    setIsFollowingUser(false)
    setDisplayFollowerCount((prev) => Math.max(0, prev - 1))
  }

  try {
    if (nextBlockedState) {
      await userService.blockUser(targetUserId)
      setIsBlockedByCurrentUser(true)
      toast.success(txa('Kullanıcı engellendi.'))
    } else {
      await userService.unblockUser(targetUserId)
      setIsBlockedByCurrentUser(false)
      toast.info(txa('Kullanıcı engeli kaldırıldı.'))
    }
    closeHoverActionMenu({
      actionMenuOpenRef,
      setIsActionMenuOpen,
    })
  } catch (error) {
    const requestContext = createRequestContext('UserHoverCard', 'toggle-block-user', {
      currentUserId,
      targetUserId,
      nextBlockedState,
    })
    const reportedError = reportUserFacingError(logger, {
      event: requestContext.event,
      error,
      fallback: txa('Kullanıcı engelleme işlemi şu anda tamamlanamadı.'),
      requestContext,
    })
    setIsBlockedByCurrentUser(!nextBlockedState)
    setIsFollowingUser(followingBefore)
    setDisplayFollowerCount(followerCountBefore)
    const message = reportedError.technicalMessage || ''
    if (message === 'USER_BLOCKS_NOT_READY') {
      toast.error('Kullanici engelleme altyapisi henuz veritabaninda aktif degil.')
    } else {
      toast.error(reportedError.userMessage)
    }
  } finally {
    setIsBlockActionLoading(false)
  }
}

interface OpenUserHoverReportOptions {
  currentUserId: string
  targetUserId: string
  isOwnHoverProfile: boolean
  actionMenuOpenRef: MutableRefObject<boolean>
  setIsActionMenuOpen: (value: boolean) => void
  setIsUserReportModalOpen: (value: boolean) => void
}

export async function openUserHoverReport({
  currentUserId,
  targetUserId,
  isOwnHoverProfile,
  actionMenuOpenRef,
  setIsActionMenuOpen,
  setIsUserReportModalOpen,
}: OpenUserHoverReportOptions) {
  if (isOwnHoverProfile) {
    toast.info(txa('Kendinizi raporlayamazsınız.'))
    return
  }
  if (!currentUserId) {
    toast.info(txa('Rapor göndermek için giriş yapmalısınız.'))
    return
  }
  if (!targetUserId) {
    toast.info(txa('Kullanıcı bilgisi yükleniyor, tekrar deneyin.'))
    return
  }

  const reportsEnabled = await isFeatureEnabled('moderation.reports', false)
  if (!reportsEnabled) {
    showInactiveFeatureToast('Kullanici bildirme')
    return
  }

  closeHoverActionMenu({
    actionMenuOpenRef,
    setIsActionMenuOpen,
  })
  setIsUserReportModalOpen(true)
}
