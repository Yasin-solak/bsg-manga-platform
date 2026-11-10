// BSG Manga push service worker.
//
// DELIBERATELY MINIMAL: only web push receipt and notification click.
// NO 'fetch' handler: no asset cache/offline layer was added; with Vite's
// hashed assets a wrongly set SW cache risks sticking to an old bundle
// . Offline support must be designed as a separate phase with a
// cache strategy. Before adding a fetch handler here see the
// tests/contracts/web-push-contract.test.mjs guard.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// A device setting independent of the account. A storage error does not block push delivery.
function readNotificationQuietHours() {
  return new Promise((resolve) => {
    let database
    let finished = false
    const finish = (value = null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (database) database.close()
      resolve(value)
    }
    const timer = setTimeout(() => finish(), 2000)
    try {
      const request = indexedDB.open('bsg-notification-device-settings', 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings')
      }
      request.onerror = () => finish()
      request.onblocked = () => finish()
      request.onsuccess = () => {
        database = request.result
        if (finished) { database.close(); return }
        try {
          const transaction = database.transaction('settings', 'readonly')
          const value = transaction.objectStore('settings').get('quiet-hours')
          transaction.oncomplete = () => finish(value.result)
          transaction.onerror = () => finish()
          transaction.onabort = () => finish()
        } catch { finish() }
      }
    } catch { finish() }
  })
}

function isNotificationQuietHoursActive(value, date = new Date()) {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!value || value.enabled !== true || typeof value.start !== 'string' || typeof value.end !== 'string'
    || !timePattern.test(value.start) || !timePattern.test(value.end) || value.start === value.end
    || !Number.isFinite(date.getTime())) return false
  const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const start = toMinutes(value.start)
  const end = toMinutes(value.end)
  const now = date.getHours() * 60 + date.getMinutes()
  return start < end ? now >= start && now < end : now >= start || now < end
}

// Old push records are also checked at click time; the new server check alone is not enough.
function hasUnsafePathCharacters(value) {
  return value.includes('\\') || Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

function safeNotificationPath(value) {
  if (typeof value !== 'string' || value.length > 2048 || hasUnsafePathCharacters(value)) return null
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return null
  let decoded = path
  for (let depth = 0; depth < 5; depth += 1) {
    if (hasUnsafePathCharacters(decoded) || decoded.startsWith('//')) return null
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(decoded)) return null
    let next
    try { next = decodeURIComponent(decoded) } catch { return null }
    if (next === decoded) break
    decoded = next
    if (depth === 4 && /%[0-9a-f]{2}/i.test(decoded)) return null
  }
  try {
    const base = 'https://notification.invalid'
    const url = new URL(path, base)
    const decodedUrl = new URL(decoded, base)
    if (url.origin !== base || decodedUrl.origin !== base
      || url.pathname.startsWith('//') || decodedUrl.pathname.startsWith('//')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'BSG Manga', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'BSG Manga'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: safeNotificationPath(payload.url) || '/' },
    tag: payload.tag || undefined,
  }

  event.waitUntil(readNotificationQuietHours().then((quietHours) => {
    // The notification stays on screen; outside the range the browser sound/vibration preference is kept.
    if (isNotificationQuietHoursActive(quietHours)) options.silent = true
    return self.registration.showNotification(title, options)
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = safeNotificationPath(event.notification.data?.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (typeof client.navigate !== 'function' || typeof client.focus !== 'function') continue
        try {
          const destination = await client.navigate(targetUrl)
          if (destination) return await destination.focus()
        } catch { /* Kapanan pencere yerine sıradaki pencere veya yeni sekme kullanılır. */ }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
