const SUPPRESS_AUTH_FOCUS_SYNC_UNTIL_KEY = '__BSGMANGA_SUPPRESS_AUTH_FOCUS_SYNC_UNTIL__'
const DEFAULT_SUPPRESS_DURATION_MS = 6_000

type NativeFileDialogFocusWindow = Window & {
  [SUPPRESS_AUTH_FOCUS_SYNC_UNTIL_KEY]?: number
}

function getWindowScope() {
  if (typeof window === 'undefined') return null
  return window as NativeFileDialogFocusWindow
}

export function suppressAuthFocusSyncForNativeFileDialog(durationMs = DEFAULT_SUPPRESS_DURATION_MS) {
  const windowScope = getWindowScope()
  if (!windowScope) return

  windowScope[SUPPRESS_AUTH_FOCUS_SYNC_UNTIL_KEY] = Date.now() + Math.max(250, Math.trunc(durationMs))
}

export function shouldSuppressAuthFocusSync() {
  const windowScope = getWindowScope()
  if (!windowScope) return false

  const suppressUntil = Number(windowScope[SUPPRESS_AUTH_FOCUS_SYNC_UNTIL_KEY] || 0)
  return Number.isFinite(suppressUntil) && suppressUntil > Date.now()
}
