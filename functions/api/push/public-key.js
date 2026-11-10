// GET /api/push/public-key: only the VAPID public key is published for subscribing.
// The env object is never returned; secrets such as the delivery or private key are not read here.
function json(payload, status, cacheControl = 'no-store') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
      ...(status === 405 ? { allow: 'GET' } : {}),
    },
  })
}

async function validatePublicKey(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().replace(/=$/, '')
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) return null
  try {
    const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), character => character.charCodeAt(0))
    if (bytes.length !== 65 || bytes[0] !== 4) return null
    // The 65-byte format alone is not enough; the point must actually be on P-256.
    await crypto.subtle.importKey('raw', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return key
  } catch { return null }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Yalnız GET desteklenir.' }, 405)
  const publicKey = await validatePublicKey(env.PUSH_VAPID_PUBLIC_KEY)
  if (!publicKey) return json({ error: 'Push bildirimleri şu anda kullanılamıyor.' }, 503)
  return json({ publicKey }, 200, 'public, max-age=300, s-maxage=300')
}
