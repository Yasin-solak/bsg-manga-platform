/**
 * Chapter end follow + notification invite decision engine (pure function).
 *
 * Why here: whether the invite shows depends on a combination of seven inputs
 * (fansub present, sign-in, follow state, flag, browser support, permission state,
 * iOS tab, dismissed). In v1 these conditions were scattered in the component and
 * "why is it not showing" could only be answered by trying in the browser.
 *
 * Design decision: push permission is asked EXACTLY NOW. The user just experienced the value
 * (finished the chapter), the point of highest acceptance. The site-wide
 * cold invite (PushAdoptionNudge) stays in v1.
 */

export type ReaderV2NotifyInviteVariant = 'hidden' | 'signin' | 'follow' | 'push' | 'install'

export type ReaderV2PushState = 'subscribed' | 'unsubscribed' | 'denied' | 'unknown'

export interface ReaderV2NotifyInviteInput {
  hasFansub: boolean
  signedIn: boolean
  isFollowing: boolean
  /** notifications.web_push bayragi. */
  pushFlagEnabled: boolean
  pushSupported: boolean
  pushState: ReaderV2PushState
  /** Browser tab on iOS: push works only in a PWA added to the home screen. */
  isIosBrowserTab: boolean
  dismissed: boolean
}

export function resolveReaderV2NotifyInvite(input: ReaderV2NotifyInviteInput): ReaderV2NotifyInviteVariant {
  const {
    hasFansub,
    signedIn,
    isFollowing,
    pushFlagEnabled,
    pushSupported,
    pushState,
    isIosBrowserTab,
    dismissed,
  } = input

  // On a chapter with no fansub there is no team to follow.
  if (!hasFansub) return 'hidden'
  // Once the user says "close" it is not asked again.
  if (dismissed) return 'hidden'
  if (!signedIn) return 'signin'
  if (!isFollowing) return 'follow'

  // Buradan sonrasi: zaten takip ediyor, geriye yalnizca bildirim kaldi.
  if (!pushFlagEnabled) return 'hidden'
  if (isIosBrowserTab) return 'install'
  if (!pushSupported) return 'hidden'
  // If permission is denied it cannot be fixed here (browser settings); showing an unfixable warning
  // at chapter end is noise.
  if (pushState === 'denied') return 'hidden'
  if (pushState === 'subscribed') return 'hidden'
  // If the state is not resolved yet, show nothing rather than the wrong card.
  if (pushState === 'unknown') return 'hidden'

  return 'push'
}

/**
 * Whether follow and notification enabling merge in ONE tap.
 *
 * The plan says "one step": following and then asking for notifications separately would be two
 * approvals. Both are tried in the same tap; if the push side is not possible
 * following still completes.
 */
export function shouldBundlePushWithFollow(input: ReaderV2NotifyInviteInput): boolean {
  return input.pushFlagEnabled
    && input.pushSupported
    && !input.isIosBrowserTab
    && input.pushState === 'unsubscribed'
}
