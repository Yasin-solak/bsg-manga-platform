// Generates a VAPID key pair (RFC 8292, ES256 / P-256).
//
// Usage: node scripts/generate-vapid-keys.mjs
// Save the output keys somewhere durable; never put the private key in the repo.
// Deployment: PUSH_VAPID_* -> Cloudflare Pages secret (npm run cf:sync-secrets),
// VITE_WEB_PUSH_VAPID_PUBLIC_KEY -> build environment (.env).

const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

const publicKey = bytesToBase64Url(publicRaw)
const privateKey = privateJwk.d

console.log('VAPID key pair generated.\n')
console.log(`PUSH_VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`PUSH_VAPID_PRIVATE_KEY=${privateKey}`)
console.log('PUSH_VAPID_SUBJECT=mailto:contact@example.com  # replace with your own address')
console.log(`VITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`)
console.log('\nNote: generate a separate strong random value for PUSH_DISPATCH_SECRET:')
console.log(`PUSH_DISPATCH_SECRET=${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`)
