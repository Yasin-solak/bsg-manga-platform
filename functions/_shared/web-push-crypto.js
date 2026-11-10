// Web Push protocol cryptography (no dependencies, based on WebCrypto)
//
// - RFC 8291: payload encryption (ECDH P-256 + HKDF-SHA256 + AES-128-GCM, aes128gcm)
// - RFC 8292: VAPID authorization header (ES256-signed JWT)
//
// Why handwritten: the 'web-push' npm package depends on Node crypto and does not run in the
// Cloudflare Pages Functions runtime. This implementation is verified against the RFC 8291
// Appendix A test vector in a contract test
// (tests/contracts/web-push-contract.test.mjs): if the vector breaks, the test breaks.

const encoder = new TextEncoder()

export function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, item) => sum + item.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const item of arrays) {
    merged.set(item, offset)
    offset += item.length
  }
  return merged
}

// HKDF-SHA256 (extract + expand in one step; WebCrypto semantics match RFC 5869)
async function hkdfDerive(saltBytes, ikmBytes, infoBytes, byteLength) {
  const ikmKey = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    ikmKey,
    byteLength * 8,
  )
  return new Uint8Array(bits)
}

async function importUserAgentPublicKey(uaPublicBytes) {
  return crypto.subtle.importKey('raw', uaPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

/**
 * RFC 8291 aes128gcm encryption (single record).
 *
 * @param payloadBytes Uint8Array: content to encrypt (JSON string bytes)
 * @param p256dh string: subscription client public key (base64url, 65 bytes)
 * @param auth string: subscription auth secret (base64url, 16 bytes)
 * @param testOverrides: ONLY for contract tests, deterministic
 * { applicationServerKeys: CryptoKeyPair, salt: base64url } injection.
 * @returns Uint8Array: coded header (salt|rs|idlen|as_public) + ciphertext
 */
export async function encryptWebPushPayload(payloadBytes, p256dh, auth, testOverrides = {}) {
  const uaPublicBytes = base64UrlToBytes(p256dh)
  const authSecret = base64UrlToBytes(auth)
  if (uaPublicBytes.length !== 65) throw new Error('Invalid p256dh key (65 bytes expected).')
  if (authSecret.length !== 16) throw new Error('Invalid auth secret (16 bytes expected).')

  const uaPublicKey = await importUserAgentPublicKey(uaPublicBytes)
  const asKeys = testOverrides.applicationServerKeys
    || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey))

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeys.privateKey, 256),
  )

  // IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info="WebPush: info"||0x00||ua_public||as_public, 32)
  const keyInfo = concatBytes(encoder.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes)
  const ikm = await hkdfDerive(authSecret, ecdhSecret, keyInfo, 32)

  const salt = testOverrides.salt
    ? base64UrlToBytes(testOverrides.salt)
    : crypto.getRandomValues(new Uint8Array(16))

  const contentEncryptionKey = await hkdfDerive(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfDerive(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  // Single record: payload + 0x02 (last record delimiter, RFC 8188)
  const record = concatBytes(payloadBytes, new Uint8Array([2]))
  const gcmKey = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, gcmKey, record))

  // Coded header: salt(16) | record size uint32 BE (4096) | keyid len (65) | as_public(65)
  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = 65
  header.set(asPublicBytes, 21)

  return concatBytes(header, ciphertext)
}

// VAPID private key (base64url 32-bayt skaler) + public key (base64url 65-bayt
// sikistirilmamis nokta) ikilisini WebCrypto imza anahtarina cevirir.
async function importVapidSigningKey(publicKeyB64, privateKeyB64) {
  const publicBytes = base64UrlToBytes(publicKeyB64)
  if (publicBytes.length !== 65) throw new Error('Invalid VAPID public key (65 bytes expected).')
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64,
    x: bytesToBase64Url(publicBytes.slice(1, 33)),
    y: bytesToBase64Url(publicBytes.slice(33, 65)),
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/**
 * RFC 8292 VAPID Authorization basligi uretir: `vapid t=<jwt>, k=<public>`
 * aud = push endpoint origin'i; exp = 12 saat (24 saat ustu reddedilir).
 */
export async function buildVapidAuthHeader({ endpoint, publicKey, privateKey, subject }) {
  const audience = new URL(endpoint).origin
  const headerPart = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claimsPart = bytesToBase64Url(encoder.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })))
  const unsignedToken = `${headerPart}.${claimsPart}`
  const signingKey = await importVapidSigningKey(publicKey, privateKey)
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(unsignedToken)),
  )
  return `vapid t=${unsignedToken}.${bytesToBase64Url(signature)}, k=${publicKey}`
}

/**
 * Sends a push to one subscription. Failures do not become exceptions; a status is
 * returned so the caller can clean up subscriptions marked `gone`.
 */
export async function sendWebPush({ subscription, payload, vapid, ttlSeconds = 86400 }) {
  const body = await encryptWebPushPayload(
    encoder.encode(payload),
    subscription.p256dh,
    subscription.auth,
  )
  const authorization = await buildVapidAuthHeader({
    endpoint: subscription.endpoint,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
    subject: vapid.subject,
  })
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttlSeconds),
      urgency: 'normal',
    },
    body,
  })
  // 404/410: the subscription is dead (the user revoked permission or the browser deleted it)
  return { ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 }
}
