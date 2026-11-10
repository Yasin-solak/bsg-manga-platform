// POST /api/push/dispatch: web push delivery endpoint triggered by the DB.
//
// Caller: the notifications trigger in Supabase (through pg_net, see
// migration 267). The request body CARRIES the target user's subscriptions,
// so this function works without a service-role key (repo
// policy: no service role on the Cloudflare side).
//
// Auth: the X-Push-Dispatch-Secret header is compared with env.PUSH_DISPATCH_SECRET
// in constant time. Without a secret the endpoint is disabled (503).

import { sendWebPush } from '../../_shared/web-push-crypto.js'

const MAX_SUBSCRIPTIONS_PER_DISPATCH = 20
const MAX_TEXT_LENGTH = 180

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

// Constant-time comparison: compare the SHA-256 digests of both values so that
// a character-by-character early exit does not leak timing.
async function secretsMatch(provided, expected) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(provided))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(expected))),
  ])
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

function clampText(value) {
  const text = String(value || '').trim()
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text
}

/** Site-internal paths only; URL normalization and nested encodings cannot produce an external target. */
function hasUnsafePathCharacters(value) {
  return value.includes('\\') || Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

export function safeNotificationPath(value) {
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

function routeIdentifier(value) {
  return typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,199}$/u.test(value) ? value : null
}

export function resolvePushNotificationPath(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  const event = data.event || body?.tag
  if (event === 'manga_chapter_release' || event === 'fansub_new_chapter') {
    const manga = routeIdentifier(data.manga_id) || routeIdentifier(data.manga_slug)
    const chapter = typeof data.chapter_number === 'number'
      || (typeof data.chapter_number === 'string' && /^\d+(?:\.\d+)?$/.test(data.chapter_number))
      ? Number(data.chapter_number) : NaN
    if (manga && Number.isFinite(chapter) && chapter > 0) {
      const fansub = routeIdentifier(data.fansub_id) || routeIdentifier(data.fansub_slug)
      const version = routeIdentifier(data.chapter_id)
      const path = `/oku/${encodeURIComponent(manga)}/${chapter}`
        + (fansub ? `/${encodeURIComponent(fansub)}` : '')
        + (version ? `?surum=${encodeURIComponent(version)}` : '')
      return safeNotificationPath(path) || '/'
    }
  }
  return safeNotificationPath(data.route_hint) || safeNotificationPath(body?.route_hint)
    || safeNotificationPath(body?.url) || safeNotificationPath(data.url) || '/'
}

export async function onRequestPost({ request, env }) {
  const expectedSecret = env.PUSH_DISPATCH_SECRET
  const vapidPublicKey = env.PUSH_VAPID_PUBLIC_KEY
  const vapidPrivateKey = env.PUSH_VAPID_PRIVATE_KEY
  const vapidSubject = env.PUSH_VAPID_SUBJECT

  if (!expectedSecret || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return json({ error: 'Push gonderimi yapilandirilmamis.' }, 503)
  }

  const providedSecret = request.headers.get('x-push-dispatch-secret') || ''
  if (!(await secretsMatch(providedSecret, expectedSecret))) {
    return json({ error: 'Yetkisiz.' }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Gecersiz istek govdesi.' }, 400)
  }

  const subscriptions = Array.isArray(body?.subscriptions)
    ? body.subscriptions.slice(0, MAX_SUBSCRIPTIONS_PER_DISPATCH)
    : []
  if (subscriptions.length === 0) {
    return json({ sent: 0, failed: 0, goneEndpoints: [] })
  }

  const payload = JSON.stringify({
    title: clampText(body.title) || 'BSG Manga',
    body: clampText(body.body),
    url: resolvePushNotificationPath(body),
    tag: typeof body.tag === 'string' ? body.tag.slice(0, 64) : undefined,
  })

  const vapid = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject }
  const results = await Promise.allSettled(
    subscriptions.map((subscription) => sendWebPush({ subscription, payload, vapid })),
  )

  let sent = 0
  let failed = 0
  const goneEndpoints = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      sent += 1
      return
    }
    failed += 1
    if (result.status === 'fulfilled' && result.value.gone) {
      goneEndpoints.push(subscriptions[index]?.endpoint || '')
    }
  })

  return json({ sent, failed, goneEndpoints: goneEndpoints.filter(Boolean) })
}

export function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      allow: 'POST',
      'cache-control': 'no-store',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  })
}
