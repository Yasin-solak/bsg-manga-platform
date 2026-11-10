import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const wranglerSource = read('wrangler.toml')
const rateLimitSource = read('functions/_shared/upload-rate-limit.js')
const uploadSource = read('functions/_shared/storage-upload-r2.js')

assert.match(wranglerSource, /\[\[kv_namespaces\]\][\s\S]*binding = "UPLOAD_GUARD_KV"/)
assert.match(wranglerSource, /\[\[env\.production\.kv_namespaces\]\][\s\S]*binding = "UPLOAD_GUARD_KV"/)

assert.match(rateLimitSource, /export const UPLOAD_RATE_LIMIT_POLICIES = \{/)
assert.match(rateLimitSource, /'chapter-page': \{/)
assert.match(rateLimitSource, /maxPerUser: 360/)
assert.match(rateLimitSource, /'user-avatar': \{/)
assert.match(rateLimitSource, /throw new UploadRateLimitError/)
assert.match(rateLimitSource, /'Retry-After': String\(retryAfterSeconds\)/)
assert.match(rateLimitSource, /export async function assertUploadReplayGuard\(/)
assert.match(rateLimitSource, /export async function markUploadReplayGuard\(/)
assert.match(rateLimitSource, /scope === 'user-ip'/)

assert.match(uploadSource, /import \{ assertUploadRateLimit, assertUploadReplayGuard, markUploadReplayGuard \} from '\.\/upload-rate-limit'/)
assert.match(uploadSource, /await assertUploadRateLimit\(\{ request, env, authContext, intent \}\)/)
assert.match(uploadSource, /await assertUploadReplayGuard\(\{ env, intent, target: replayFingerprint \}\)/)
assert.match(uploadSource, /await markUploadReplayGuard\(\{ env, intent, target: replayFingerprint \}\)/)
assert.match(uploadSource, /const replayFingerprint = buildUploadReplayFingerprint\(formData, intent, authContext, request\)/)
assert.match(uploadSource, /return fail\(error\.status, error\.message, error\.headers\)/)

console.log('PASS cloudflare upload rate-limit contract kept')

// KV daily write quota / outage: the limiter is skipped by failing open; not all uploads
// fall to 503. A real limit breach within quota still gives 429.
const { assertUploadRateLimit, UPLOAD_RATE_LIMIT_POLICIES } = await import('../../functions/_shared/upload-rate-limit.js')
const limitRequest = () => new Request('https://x/upload', { headers: { 'cf-connecting-ip': '203.0.113.9' } })
const brokenKv = {
  get: async () => { throw new Error('KV get() limit exceeded for the day.') },
  put: async () => { throw new Error('KV put() limit exceeded for the day.') },
}
const originalWarn = console.warn
console.warn = () => {}
await assertUploadRateLimit({ request: limitRequest(), env: { UPLOAD_GUARD_KV: brokenKv }, authContext: { authUser: { id: 'u1' } }, intent: 'chapter-page' })
console.warn = originalWarn
const store = new Map()
const memoryKv = { get: async (key) => store.get(key) ?? null, put: async (key, value) => { store.set(key, value) } }
let limited = null
for (let i = 0; i < 400 && !limited; i += 1) {
  try {
    await assertUploadRateLimit({ request: limitRequest(), env: { UPLOAD_GUARD_KV: memoryKv }, authContext: { authUser: { id: 'u2' } }, intent: 'translation-scan' })
  } catch (error) {
    limited = error
  }
}
assert.equal(limited?.status, 429, 'with working KV an over-limit is still 429')

// Read endpoints (preview, public reader image) do not write the KV counter; the quota is not used up per view.
assert.equal(UPLOAD_RATE_LIMIT_POLICIES['studio-reader-image'], undefined)
assert.equal(UPLOAD_RATE_LIMIT_POLICIES['translation-raw-read'], undefined)
assert.doesNotMatch(read('functions/api/ceviri/reader-page.js'), /assertUploadRateLimit/)
assert.doesNotMatch(read('functions/api/ceviri/raw.js'), /translation-raw-read/)
console.log('PASS upload limiter fails open on KV quota, read endpoints are uncounted')
