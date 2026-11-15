import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const source = readFileSync(path.join(rootDir, 'functions/api/public-image.js'), 'utf8')

assert.match(source, /const TRANSFORM_RATE_LIMIT_WINDOW_SECONDS = 60/)
assert.match(source, /const TRANSFORM_RATE_LIMIT_LONG_WINDOW_SECONDS = 10 \* 60/)
assert.match(source, /function buildCanonicalRequestUrl\(/)
assert.match(source, /if \(!isCanonicalRequestUrl\(requestUrl, canonicalUrl\)\) \{/)
assert.match(source, /status: 301/)
assert.match(source, /await assertTransformRateLimit\(context\)/)
assert.match(source, /return new Response\('Too Many Requests', \{/)
assert.match(source, /location: canonicalUrl\.toString\(\)/)

// Fail-open: a KV error (daily write quota on the Free plan) must skip the limiter, never 500.
assert.match(source, /async function assertTransformRateLimit\(context\) \{\s*try \{\s*return await runTransformRateLimit\(context\)\s*\} catch \(error\) \{[\s\S]*?return null/, 'rate limiter must fail open on KV errors')
assert.match(source, /namespace\.put\(/, 'the two-window KV counter must be kept')

// Cache-first: the Cache API is consulted before the limiter, so cache hits spend no KV operations.
const cacheLookupIndex = source.indexOf('cache.match(cacheKey)')
const limiterCallIndex = source.indexOf('await assertTransformRateLimit(context)')
assert.ok(cacheLookupIndex > 0, 'public-image must look up caches.default')
assert.ok(cacheLookupIndex < limiterCallIndex, 'cache lookup must run before the rate limiter')
assert.match(source, /context\.waitUntil\(store\)/, 'cache store must not block the response')

// Outbound timeouts: the upstream fetch must be abortable and a failure must become a 502.
assert.match(source, /signal: AbortSignal\.timeout\(UPSTREAM_FETCH_TIMEOUT_MS\)/)

const push = readFileSync(path.join(rootDir, 'functions/_shared/web-push-crypto.js'), 'utf8')
assert.match(push, /signal: AbortSignal\.timeout\(PUSH_FETCH_TIMEOUT_MS\)/)
assert.match(push, /catch \(error\) \{[\s\S]*?return \{ ok: false, status: 0, gone: false/, 'push timeout must be a failed send, not an exception')

console.log('PASS public-image security contract kept')
