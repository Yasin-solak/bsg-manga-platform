import { useCallback, useEffect, useState } from 'react'
import { userService, type ProfileRelationship } from '@/services/userService'
import { isAbortError } from '@/services/supabaseError'
import { toast } from '@/services/toastService'
import { reportProfilePageError, warnProfilePageIssue } from './profilePageErrors'
import { txa } from '@/i18n/activeLocale'

interface UseProfileFollowStateOptions {
  currentUserId: string | null | undefined
  profileUserId: string | null | undefined
  onVisibilityRefresh: () => void
}

/*
 * Profile follow state: not following / request sent (private account) / following. The relation
 * (private?, pending request, counts, theme) comes in one RPC; the lock screen uses it too.
 */
export function useProfileFollowState({
  currentUserId,
  profileUserId,
  onVisibilityRefresh,
}: UseProfileFollowStateOptions) {
  const [relationship, setRelationship] = useState<ProfileRelationship | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!profileUserId) {
      setRelationship(null)
      return
    }
    try {
      const next = await userService.getProfileRelationship(profileUserId)
      if (!signal?.cancelled) setRelationship(next)
    } catch (error) {
      if (signal?.cancelled || isAbortError(error)) return
      warnProfilePageIssue(
        'sync-profile-follow-state',
        'profil takip durumu senkronize edilemedi.',
        error,
        { currentUserId: currentUserId || null, profileUserId: profileUserId || null },
      )
    }
  }, [currentUserId, profileUserId])

  useEffect(() => {
    const signal = { cancelled: false }
    void load(signal)
    return () => { signal.cancelled = true }
  }, [load])

  const isFollowing = Boolean(relationship?.viewerIsFollower)
  const isRequested = Boolean(relationship?.requestPending)

  const handleFollow = async () => {
    if (!currentUserId || !profileUserId || busy) return
    setBusy(true)
    try {
      if (isFollowing) {
        await userService.unfollowUser(currentUserId, profileUserId)
        toast.info(txa('Kullanıcı takibinden çıkıldı.'))
      } else if (isRequested) {
        await userService.cancelFollowRequest(profileUserId)
        toast.info(txa('Takip isteği geri alındı.'))
      } else {
        const status = await userService.followUser(currentUserId, profileUserId)
        if (status === 'requested') toast.success(txa('Takip isteği gönderildi. Onaylanınca profili görebilirsin.'))
        else toast.success(txa('Kullanıcı takip edildi.'))
      }
      await load()
      onVisibilityRefresh()
    } catch (error) {
      const reportedError = reportProfilePageError(
        'toggle-profile-follow',
        error,
        txa('Takip işlemi sırasında bir hata oluştu.'),
        { currentUserId, profileUserId, isFollowing },
      )
      toast.error(reportedError.userMessage)
    } finally {
      setBusy(false)
    }
  }

  return {
    isFollowing,
    isRequested,
    relationship,
    followBusy: busy,
    reloadRelationship: load,
    handleFollow,
  }
}
