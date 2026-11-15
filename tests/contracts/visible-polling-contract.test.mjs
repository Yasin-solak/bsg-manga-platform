import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
const compile = (p) => ts.transpileModule(read(p), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// Fake timers and a fake document so the helper runs deterministically.
const timers = []
let nextId = 1
const listeners = new Set()
const fakeDocument = {
  visibilityState: 'visible',
  addEventListener: (_name, fn) => listeners.add(fn),
  removeEventListener: (_name, fn) => listeners.delete(fn),
}
const fakeSetTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms }); return id }
const fakeClearTimeout = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1) }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const setVisibility = (state) => { fakeDocument.visibilityState = state; for (const fn of [...listeners]) fn() }

const mod = { exports: {} }
new Function('module', 'exports', 'document', 'setTimeout', 'clearTimeout', compile('src/lib/polling.ts'))(
  mod, mod.exports, fakeDocument, fakeSetTimeout, fakeClearTimeout,
)
const { startVisiblePolling, jitterIntervalMs } = mod.exports

// Jitter stays inside +/-18% of the interval and actually varies.
assert.equal(jitterIntervalMs(60_000, 0.18, () => 0), 49_200)
assert.equal(jitterIntervalMs(60_000, 0.18, () => 1), 70_800)
assert.notEqual(jitterIntervalMs(60_000, 0.18, () => 0.2), jitterIntervalMs(60_000, 0.18, () => 0.8))

let calls = 0
const stop = startVisiblePolling(() => { calls++ }, 60_000, { random: () => 0.5 })
assert.equal(timers.length, 1, 'a visible tab schedules exactly one tick')
assert.equal(timers[0].ms, 60_000)

timers.shift().fn(); await flush()
assert.equal(calls, 1)
assert.equal(timers.length, 1, 'the next tick is scheduled after the task settles')

setVisibility('hidden')
assert.equal(timers.length, 0, 'a hidden tab must not keep a pending poll')
assert.equal(calls, 1)

setVisibility('visible'); await flush()
assert.equal(calls, 2, 'returning to the tab runs exactly one catch-up')
assert.equal(timers.length, 1, 'a fresh cycle starts after the catch-up')

stop()
assert.equal(timers.length, 0, 'stop clears the pending tick')
assert.equal(listeners.size, 0, 'stop removes the visibility listener')

// catchUp:false leaves the immediate refresh to the caller but keeps polling alive.
let quiet = 0
const stopQuiet = startVisiblePolling(() => { quiet++ }, 30_000, { catchUp: false })
setVisibility('hidden'); setVisibility('visible'); await flush()
assert.equal(quiet, 0)
assert.equal(timers.length, 1)
stopQuiet()

// Retry intent lives in apiResilience; behavior is exercised here without network.
const resilience = { exports: {} }
const resilienceSource = compile('src/services/apiResilience.ts')
const requireStub = (name) => {
  if (name === '@/i18n/activeLocale') return { txa: (text) => text }
  throw new Error('unexpected import ' + name)
}
new Function('module', 'exports', 'require', 'setTimeout', resilienceSource)(
  resilience, resilience.exports, requireStub, (fn) => { fn(); return 0 },
)
const { isRetryableApiError, computeBackoffDelayMs, readRetryAfterMs } = resilience.exports
assert.equal(isRetryableApiError({ status: 409 }), false, '409 is a conflict, not a transient failure')
assert.equal(isRetryableApiError({ status: 429 }), true)
assert.equal(isRetryableApiError({ status: 503 }), true)
for (let attempt = 1; attempt <= 6; attempt++) {
  const ceiling = Math.min(4_000, 300 * 2 ** (attempt - 1))
  assert.equal(computeBackoffDelayMs(attempt, () => 0), 0, 'full jitter can wait zero')
  assert.equal(computeBackoffDelayMs(attempt, () => 0.999999), ceiling, 'delay never exceeds min(cap, base * 2^n)')
}
assert.equal(readRetryAfterMs({ status: 429, retryAfter: 2 }), 2_000)
assert.equal(readRetryAfterMs({ status: 503, headers: { get: () => '120' } }), 10_000, 'Retry-After is capped at 10 s')
assert.equal(readRetryAfterMs({ status: 500, retryAfter: 2 }), null, 'Retry-After is only honored for 429/503')

// Short-lived read cache: in-flight sharing, TTL reuse, no cached failures, full clear on sign-out.
const cacheMod = { exports: {} }
new Function('module', 'exports', compile('src/lib/shortLivedCache.ts'))(cacheMod, cacheMod.exports)
const { createShortLivedCache, clearAllShortLivedCaches } = cacheMod.exports
let clock = 0
const cache = createShortLivedCache(5_000, () => clock)
let loads = 0
const loader = async () => { loads++; return loads }
const [first, second] = await Promise.all([cache.get('u1:a', loader), cache.get('u1:a', loader)])
assert.equal(loads, 1, 'concurrent reads share one request')
assert.equal(first, second)
clock = 4_000
await cache.get('u1:a', loader)
assert.equal(loads, 1, 'a settled result is reused inside the TTL')
clock = 5_001
await cache.get('u1:a', loader)
assert.equal(loads, 2, 'an expired result is reloaded')
await cache.get('u2:a', loader)
assert.equal(loads, 3, 'another user key never reads a neighbouring entry')
cache.invalidate('u1:')
await cache.get('u1:a', loader)
assert.equal(loads, 4, 'invalidate drops matching entries')
await assert.rejects(cache.get('bad', async () => { throw new Error('boom') }))
await cache.get('bad', async () => 'ok')
clearAllShortLivedCaches()
await cache.get('u1:a', loader)
assert.equal(loads, 5, 'sign-out clears every registered cache')
const inflightOnly = createShortLivedCache(0, () => clock)
let inflightLoads = 0
await inflightOnly.get('k', async () => ++inflightLoads)
await inflightOnly.get('k', async () => ++inflightLoads)
assert.equal(inflightLoads, 2, 'ttl 0 keeps nothing after settling')

console.log('PASS visible polling helper, retry backoff and short-lived cache behavior')
