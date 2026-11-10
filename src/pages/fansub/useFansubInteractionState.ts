import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ExtendedFansub } from './types'
import { checkFansubAdmin } from '@/services/fansubService'
import { userService } from '@/services/userService'
import { toast } from '@/services/toastService'
import { reportFansubDetailError, warnFansubDetailIssue } from './fansubDetailErrors'
import { txa } from '@/i18n/activeLocale'

interface UseFansubInteractionStateOptions {
  fansubId: string | null | undefined
  currentUserId: string | null
  setFansub: Dispatch<SetStateAction<ExtendedFansub | null>>
}

export function useFansubInteractionState({
  fansubId,
  currentUserId,
  setFansub,
}: UseFansubInteractionStateOptions) {
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFansubAdmin, setIsFansubAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function syncFollowState() {
      if (!currentUserId || !fansubId) {
        if (!cancelled) setIsFollowing(false)
        return
      }

      try {
        const followState = await userService.isFollowingFansub(currentUserId, fansubId)
        if (!cancelled) setIsFollowing(followState)
      } catch (error) {
        warnFansubDetailIssue(
          'sync-fansub-follow-state',
          'fansub takip durumu senkronize edilemedi.',
          error,
          { fansubId: fansubId || null, currentUserId: currentUserId || null },
        )
      }
    }

    void syncFollowState()

    return () => {
      cancelled = true
    }
  }, [currentUserId, fansubId])

  useEffect(() => {
    let cancelled = false

    async function syncAdminState() {
      if (!currentUserId || !fansubId) {
        if (!cancelled) setIsFansubAdmin(false)
        return
      }

      try {
        const isAdmin = await checkFansubAdmin(fansubId, currentUserId)
        if (!cancelled) setIsFansubAdmin(isAdmin)
      } catch (error) {
        warnFansubDetailIssue(
          'sync-fansub-admin-state',
          'fansub admin durumu senkronize edilemedi.',
          error,
          { fansubId: fansubId || null, currentUserId: currentUserId || null },
        )
      }
    }

    void syncAdminState()

    return () => {
      cancelled = true
    }
  }, [currentUserId, fansubId])

  const handleFollow = async () => {
    if (!fansubId) return
    if (!currentUserId) {
      toast.info(txa('Takip etmek için giriş yapmalısın.'))
      return
    }

    try {
      if (isFollowing) {
        await userService.unfollowFansub(currentUserId, fansubId)
        setIsFollowing(false)
        setFansub((prev) => (prev ? { ...prev, followerCount: Math.max(0, (prev.followerCount || 0) - 1) } : prev))
        toast.info(txa('Fansub takibinden çıkıldı.'))
      } else {
        await userService.followFansub(currentUserId, fansubId)
        setIsFollowing(true)
        setFansub((prev) => (prev ? { ...prev, followerCount: (prev.followerCount || 0) + 1 } : prev))
        toast.success(txa('Fansub takip edildi.'))
      }
    } catch (error) {
      const reportedError = reportFansubDetailError(
        'toggle-fansub-follow',
        error,
        txa('Takip işlemi başarısız oldu.'),
        { fansubId, currentUserId, isFollowing },
      )
      toast.error(reportedError.userMessage)
    }
  }

  return {
    isFollowing,
    isFansubAdmin,
    setIsFansubAdmin,
    handleFollow,
  }
}
