/**
 * React binding of the chapter end follow + notification invite.
 *
 * Decision logic is in a pure module (readerV2NotifyInviteEngine); here state is only
 * gathered (follow state, push support/permission, flag) and actions run.
 *
 * Measuring happens when chapter end comes into view: for someone just starting to read,
 * a follow query and service worker state are wasted cost.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  enableWebPush,
  getWebPushState,
  isWebPushSupported,
} from '@/services/pushNotificationService'
import { isFeatureEnabled } from '@/services/featureFlagService'
import { followFansub, isFollowingFansub } from '@/services/userService/follows'
import { createScopedLogger } from '@/services/logger'
import { toast } from '@/services/toastService'
import {
  resolveReaderV2NotifyInvite,
  shouldBundlePushWithFollow,
  type ReaderV2NotifyInviteInput,
  type ReaderV2PushState,
} from '@/pages/reader/readerV2NotifyInviteEngine'
import { txa } from '@/i18n/activeLocale'

const readerV2NotifyLogger = createScopedLogger('ReaderV2NotifyInvite')

/**
 * SEPARATE from v1's `mz-push-nudge` key: v2's offer differs (follow +
 * notification), and a decision on the old cold invite should not silence it.
 */
const NOTIFY_INVITE_STORAGE_KEY = 'reader-v2-notify-invite'

function readDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(NOTIFY_INVITE_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(NOTIFY_INVITE_STORAGE_KEY, 'dismissed')
  } catch {
    // localStorage kapali olabilir; oturum icinde durum zaten gizliyor.
  }
}

/** iOS browser tab detection (push works only in an installed PWA). */
function isIosBrowserTab(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIosDevice = /iphone|ipod|ipad/i.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  if (!isIosDevice) return false
  const inStandalone = ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    || window.matchMedia?.('(display-mode: standalone)').matches
  return !inStandalone
}

interface UseReaderV2NotifyInviteArgs {
  fansubId: string | null | undefined
  fansubName: string | null | undefined
  currentUserId: string | null | undefined
  /** No measuring until chapter end is visible. */
  active: boolean
}

export function useReaderV2NotifyInvite({
  fansubId,
  fansubName,
  currentUserId,
  active,
}: UseReaderV2NotifyInviteArgs) {
  const [isFollowing, setIsFollowing] = useState(false)
  const [pushFlagEnabled, setPushFlagEnabled] = useState(false)
  const [pushState, setPushState] = useState<ReaderV2PushState>('unknown')
  const [dismissed, setDismissed] = useState(() => readDismissed())
  const [isBusy, setIsBusy] = useState(false)

  // Follow state is remeasured on chapter/fansub change.
  useEffect(() => {
    if (!active || !fansubId || !currentUserId) {
      setIsFollowing(false)
      return
    }
    let alive = true
    void (async () => {
      try {
        const following = await isFollowingFansub(currentUserId, fansubId)
        if (alive) setIsFollowing(following === true)
      } catch (error) {
        readerV2NotifyLogger.error({ event: 'follow-state-error', error })
      }
    })()
    return () => {
      alive = false
    }
  }, [active, currentUserId, fansubId])

  useEffect(() => {
    if (!active) return
    let alive = true
    void (async () => {
      try {
        const flagEnabled = await isFeatureEnabled('notifications.web_push', false)
        if (!alive) return
        setPushFlagEnabled(flagEnabled === true)
        // If the flag is off or the browser lacks support, the state is not asked;
        // it stays 'unknown' and the decision engine hides the invite.
        if (!flagEnabled || !isWebPushSupported()) {
          setPushState('unknown')
          return
        }
        const state = await getWebPushState()
        if (!alive) return
        setPushState(state === 'subscribed' || state === 'unsubscribed' || state === 'denied' ? state : 'unknown')
      } catch (error) {
        readerV2NotifyLogger.error({ event: 'push-state-error', error })
      }
    })()
    return () => {
      alive = false
    }
  }, [active])

  const input: ReaderV2NotifyInviteInput = useMemo(() => ({
    hasFansub: Boolean(fansubId),
    signedIn: Boolean(currentUserId),
    isFollowing,
    pushFlagEnabled,
    pushSupported: isWebPushSupported(),
    pushState,
    isIosBrowserTab: isIosBrowserTab(),
    dismissed,
  }), [currentUserId, dismissed, fansubId, isFollowing, pushFlagEnabled, pushState])

  const variant = resolveReaderV2NotifyInvite(input)

  const dismiss = useCallback(() => {
    writeDismissed()
    setDismissed(true)
  }, [])

  /** Takip + (mumkunse) bildirim acilisi TEK tikta. */
  const followAndNotify = useCallback(async () => {
    if (isBusy || !fansubId || !currentUserId) return
    setIsBusy(true)
    try {
      await followFansub(currentUserId, fansubId)
      setIsFollowing(true)
      toast.success(fansubName ? txa('{v1} takip ediliyor.', { v1: fansubName }) : txa('Ekip takip ediliyor.'))

      if (!shouldBundlePushWithFollow(input)) return

      // If the push side fails following is still valid, hence a separate
      // try block and message.
      try {
        const nextState = await enableWebPush()
        setPushState(nextState === 'subscribed' || nextState === 'denied' ? nextState : 'unsubscribed')
        if (nextState === 'subscribed') toast.success(txa('Yeni bolum bildirimleri acildi.'))
      } catch (error) {
        readerV2NotifyLogger.error({ event: 'enable-push-after-follow-error', error })
      }
    } catch (error) {
      readerV2NotifyLogger.error({ event: 'follow-fansub-error', error })
      toast.error(error instanceof Error ? error.message : txa('Takip islemi tamamlanamadi.'))
    } finally {
      setIsBusy(false)
    }
  }, [currentUserId, fansubId, fansubName, input, isBusy])

  const enableNotifications = useCallback(async () => {
    if (isBusy) return
    setIsBusy(true)
    try {
      const nextState = await enableWebPush()
      setPushState(nextState === 'subscribed' || nextState === 'denied' ? nextState : 'unsubscribed')
      if (nextState === 'subscribed') {
        toast.success(txa('Yeni bolum bildirimleri acildi.'))
      } else if (nextState === 'denied') {
        toast.info(txa('Bildirim izni verilmedi; tarayici ayarlarindan acabilirsin.'))
      }
    } catch (error) {
      readerV2NotifyLogger.error({ event: 'enable-push-error', error })
      toast.error(error instanceof Error ? error.message : txa('Bildirimler acilamadi.'))
    } finally {
      setIsBusy(false)
    }
  }, [isBusy])

  return { variant, isBusy, dismiss, followAndNotify, enableNotifications }
}
