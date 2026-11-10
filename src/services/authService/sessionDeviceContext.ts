export interface ActiveSessionSyncPayload {
  authUserId: string
  sessionId: string
  claimedAt: number
}

const ACTIVE_SESSION_SYNC_EVENT = 'bsgmanga:active-session-claimed'
const ACTIVE_SESSION_SYNC_STORAGE_KEY = 'bsgmanga:active-session-sync'
const ACTIVE_SESSION_DEVICE_ID_KEY = 'bsgmanga:device-id'

function getClientDeviceId() {
  if (typeof window === 'undefined') return 'server'

  try {
    const existing = window.localStorage.getItem(ACTIVE_SESSION_DEVICE_ID_KEY)?.trim()
    if (existing) return existing
    const created = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Math.random().toString(36).slice(2, 10)}`
    window.localStorage.setItem(ACTIVE_SESSION_DEVICE_ID_KEY, created)
    return created
  } catch {
    return 'device-storage-unavailable'
  }
}

function detectPlatformLabel(userAgent: string) {
  const ua = userAgent.toLowerCase()
  if (ua.includes('windows')) return 'Windows'
  if (ua.includes('android')) return 'Android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  return 'Bilinmeyen platform'
}

function detectBrowserLabel(userAgent: string) {
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'Edge'
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera'
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome'
  if (ua.includes('firefox/')) return 'Firefox'
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari'
  return 'Bilinmeyen tarayici'
}

export function getClientSessionContext() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const platform = detectPlatformLabel(userAgent)
  const browser = detectBrowserLabel(userAgent)

  return {
    deviceId: getClientDeviceId(),
    deviceLabel: `${browser} / ${platform}`,
    platform,
    browser,
    userAgent: userAgent || null,
  }
}

export function emitActiveSessionClaimed(payload: ActiveSessionSyncPayload) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<ActiveSessionSyncPayload>(ACTIVE_SESSION_SYNC_EVENT, {
    detail: payload,
  }))

  try {
    window.localStorage.setItem(ACTIVE_SESSION_SYNC_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage engelli ortamlarda custom event yeterli.
  }
}

export function listenActiveSessionClaims(handler: (payload: ActiveSessionSyncPayload) => void) {
  if (typeof window === 'undefined') {
    return () => { }
  }

  const onCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<ActiveSessionSyncPayload>
    const payload = customEvent.detail
    if (!payload?.authUserId || !payload?.sessionId) return
    handler(payload)
  }

  const onStorageEvent = (event: StorageEvent) => {
    if (event.key !== ACTIVE_SESSION_SYNC_STORAGE_KEY || !event.newValue) return

    try {
      const payload = JSON.parse(event.newValue) as ActiveSessionSyncPayload
      if (!payload?.authUserId || !payload?.sessionId) return
      handler(payload)
    } catch {
      // parse hatasi ignore
    }
  }

  window.addEventListener(ACTIVE_SESSION_SYNC_EVENT, onCustomEvent as EventListener)
  window.addEventListener('storage', onStorageEvent)

  return () => {
    window.removeEventListener(ACTIVE_SESSION_SYNC_EVENT, onCustomEvent as EventListener)
    window.removeEventListener('storage', onStorageEvent)
  }
}
