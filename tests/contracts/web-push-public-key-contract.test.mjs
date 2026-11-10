import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { onRequest } from '../../functions/api/push/public-key.js'
import { activeLocaleShim } from './i18n-source.mjs'

// RFC 8291 public test vectors; no environment key is read or changed.
const PUBLIC_KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const OTHER_PUBLIC_KEY = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const INVALID_POINT = Buffer.from([4, ...Array(64).fill(0)]).toString('base64url')
const request = (method = 'GET') => new Request('https://push-config.invalid/api/push/public-key', { method })

{
  const accesses = []
  const env = new Proxy({ PUSH_VAPID_PUBLIC_KEY: ` ${PUBLIC_KEY}= ` }, {
    get(target, name) {
      accesses.push(name)
      assert.equal(name, 'PUSH_VAPID_PUBLIC_KEY', 'the endpoint may read only the public key variable')
      return target[name]
    },
  })
  const response = await onRequest({ request: request(), env })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { publicKey: PUBLIC_KEY })
  assert.deepEqual(accesses, ['PUSH_VAPID_PUBLIC_KEY'])
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300, s-maxage=300')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
}
for (const value of [undefined, '', 'PRIVATE-KEY-PLACEHOLDER', 'a'.repeat(43), INVALID_POINT, PUBLIC_KEY + '!', {}]) {
  const response = await onRequest({ request: request(), env: { PUSH_VAPID_PUBLIC_KEY: value, PUSH_VAPID_PRIVATE_KEY: 'GİZLİ', PUSH_DISPATCH_SECRET: 'GİZLİ' } })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: 'Push bildirimleri şu anda kullanılamıyor.' })
}
for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
  const response = await onRequest({ request: request(method), env: {} })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET')
}

function compile(relative, replacements = {}) {
  let source = readFileSync(new URL('../../' + relative, import.meta.url), 'utf8')
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to)
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function fixture({ configuredKey = '', supported = true, enabled = true, fetchResponse, fastTimeout = false } = {}) {
  let now = Date.now(), registered = false
  const stats = { fetches: 0, flagReads: 0, permissions: 0, registrations: 0, subscribes: 0, databaseWrites: 0, warnings: 0 }
  let applicationKey, lastSignal
  const permission = { permission: 'default', requestPermission: async () => { stats.permissions++; return 'granted' } }
  const subscription = {
    endpoint: 'https://push.invalid/subscription',
    toJSON: () => ({ endpoint: 'https://push.invalid/subscription', keys: { p256dh: 'test-public-key', auth: 'test-auth' } }),
  }
  const registration = { pushManager: {
    getSubscription: async () => null,
    subscribe: async options => {
      assert.equal(options.userVisibleOnly, true)
      stats.subscribes++; applicationKey = options.applicationServerKey
      return subscription
    },
  } }
  const navigator = { userAgent: 'Bildirim kontrat testi', serviceWorker: {
    getRegistration: async () => registered ? registration : undefined,
    register: async path => { assert.equal(path, '/push-sw.js'); stats.registrations++; registered = true; return registration },
  } }
  const globals = {
    window: { atob, Notification: permission, ...(supported ? { PushManager: class {} } : {}) },
    navigator, Notification: permission, crypto, Uint8Array, ArrayBuffer, AbortController, DOMException,
    Date: class extends Date { static now() { return now } },
    setTimeout: (callback, ms) => setTimeout(callback, fastTimeout && ms === 4000 ? 5 : ms), clearTimeout,
    fetch: async (url, options) => {
      stats.fetches++; lastSignal = options.signal
      assert.equal(url, '/api/push/public-key')
      assert.equal(options.credentials, 'omit')
      assert.equal(options.mode, 'same-origin')
      assert.equal(options.redirect, 'error')
      assert.ok(options.signal instanceof AbortSignal)
      return fetchResponse ? fetchResponse(options, stats.fetches)
        : onRequest({ request: request(), env: { PUSH_VAPID_PUBLIC_KEY: PUBLIC_KEY } })
    },
  }
  function load(code, imports) {
    const module = { exports: {} }
    vm.runInNewContext(code, { ...globals, module, exports: module.exports, require: name => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
      assert.ok(name in imports, `Unexpected dependency: ${name}`)
      return imports[name]
    } })
    return module.exports
  }
  const resilience = load(compile('src/services/apiResilience.ts'), {})
  const service = load(compile('src/services/pushNotificationService.ts', {
    'import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY': JSON.stringify(configuredKey),
  }), {
    './apiResilience': resilience,
    './featureFlagService': { isFeatureEnabled: async (key, fallback) => {
      stats.flagReads++; assert.equal(key, 'notifications.web_push'); assert.equal(fallback, false); return enabled
    } },
    './logger': { createScopedLogger: () => ({ warn: () => stats.warnings++, info: () => {}, error: () => {} }) },
    './userFacingError': { toUserFacingErrorMessage: (_, fallback) => fallback },
    './supabase': { supabase: { from: table => {
      assert.equal(table, 'push_subscriptions')
      return { upsert: (row, options) => {
        assert.equal(row.endpoint, subscription.endpoint)
        assert.equal(options.onConflict, 'endpoint')
        stats.databaseWrites++
        return { abortSignal: signal => { assert.ok(signal instanceof AbortSignal); return Promise.resolve({ error: null }) } }
      } }
    } } },
  })
  return { service, stats, advance: ms => { now += ms }, get applicationKey() { return applicationKey }, get lastSignal() { return lastSignal } }
}

// If the build key is valid no HTTP key request is made.
{
  const f = fixture({ configuredKey: PUBLIC_KEY })
  assert.equal(await f.service.isWebPushAvailable(), true)
  assert.equal(f.stats.fetches, 0)
  assert.equal(f.stats.permissions, 0)
}
// With support/flag off key loading, permission asking and SW registration are off too.
for (const options of [{ supported: false }, { enabled: false }]) {
  const f = fixture(options)
  assert.equal(await f.service.isWebPushAvailable(), false)
  assert.equal(await f.service.enableWebPush(), options.supported === false ? 'unsupported' : 'unavailable')
  assert.equal(f.stats.fetches + f.stats.permissions + f.stats.registrations + f.stats.databaseWrites, 0)
}
// Three surfaces opening at once share one endpoint request; only a user action starts a subscription.
{
  const f = fixture()
  assert.deepEqual(await Promise.all(Array.from({ length: 5 }, () => f.service.isWebPushAvailable())), Array(5).fill(true))
  assert.equal(f.stats.fetches, 1)
  assert.equal(await f.service.getWebPushState(), 'unsubscribed')
  assert.equal(f.stats.permissions + f.stats.registrations + f.stats.databaseWrites, 0)
  assert.equal(await f.service.enableWebPush(), 'subscribed')
  assert.equal(f.stats.fetches, 1)
  assert.equal(f.stats.permissions, 1)
  assert.equal(f.stats.registrations, 1)
  assert.equal(f.stats.subscribes, 1)
  assert.equal(f.stats.databaseWrites, 1)
  assert.equal(Buffer.from(f.applicationKey).toString('base64url'), PUBLIC_KEY)
}
// An invalid build key must not shadow a valid runtime source.
for (const configuredKey of ['invalid', INVALID_POINT]) {
  const f = fixture({ configuredKey })
  assert.equal(await f.service.isWebPushAvailable(), true)
  assert.equal(f.stats.fetches, 1)
}
// An HTML fallback, bad JSON, wrong field and off-curve key must not start a subscription.
for (const fetchResponse of [
  () => new Response('<html>Vite fallback</html>', { headers: { 'content-type': 'text/html' } }),
  () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  () => Response.json({ privateKey: PUBLIC_KEY }),
  () => Response.json({ publicKey: INVALID_POINT }),
  () => Response.json({ publicKey: PUBLIC_KEY }, { status: 503 }),
]) {
  const f = fixture({ fetchResponse })
  assert.equal(await f.service.isWebPushAvailable(), false)
  assert.equal(await f.service.enableWebPush(), 'unavailable')
  assert.equal(f.stats.fetches, 1)
  assert.equal(f.stats.permissions + f.stats.registrations + f.stats.databaseWrites, 0)
}
// A temporary failure is kept only 30 seconds; the UI is usable again when the connection recovers.
{
  const f = fixture({ fetchResponse: (_, attempt) => {
    if (attempt === 1) throw new Error('Temporary network error')
    return Response.json({ publicKey: PUBLIC_KEY })
  } })
  assert.equal(await f.service.isWebPushAvailable(), false)
  assert.equal(await f.service.isWebPushAvailable(), false)
  assert.equal(f.stats.fetches, 1)
  f.advance(30_001)
  assert.equal(await f.service.isWebPushAvailable(), true)
  assert.equal(f.stats.fetches, 2)
}
// A successful cache is timed too; the next key is used in a new subscription.
{
  const f = fixture({ fetchResponse: (_, attempt) => Response.json({ publicKey: attempt === 1 ? PUBLIC_KEY : OTHER_PUBLIC_KEY }) })
  assert.equal(await f.service.isWebPushAvailable(), true)
  f.advance(300_001)
  assert.equal(await f.service.enableWebPush(), 'subscribed')
  assert.equal(f.stats.fetches, 2)
  assert.equal(Buffer.from(f.applicationKey).toString('base64url'), OTHER_PUBLIC_KEY)
}
// Timeout cancels the fetch; no automatic subscription without permission or endless wait.
{
  const f = fixture({ fastTimeout: true, fetchResponse: options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }) })
  assert.equal(await f.service.isWebPushAvailable(), false)
  assert.equal(f.lastSignal.aborted, true)
  assert.equal(f.stats.permissions + f.stats.registrations + f.stats.databaseWrites, 0)
}

console.log('PASS push public key: public key only, P-256 validation, source priority, cache, permission and timeout gates')
