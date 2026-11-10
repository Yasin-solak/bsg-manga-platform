import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'
const require = createRequire(import.meta.url)
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
let user = { id: owner, identities: [{ provider: 'email' }] }, authError = null, linkError = null, redirects = [], calls = [], changeAccount = false
const storage = new Map()
globalThis.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, location: { origin: 'https://bsgmanga.pages.dev', assign: url => redirects.push(url) } }
const mocks = { './supabase': { supabase: { auth: {
  getUser: async () => ({ data: { user }, error: authError }),
  linkIdentity: async input => { calls.push(input); if (changeAccount) user = { id: other, identities: [] }; return { data: { url: 'https://discord.com/oauth2/authorize' }, error: linkError } },
} } }, './apiResilience': { withServiceTimeout: fn => fn() } }
const exports = {}
new Function('require', 'exports', ts.transpileModule(readFileSync(new URL('../../src/services/linkedAccountService.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((name) => name === '@/i18n/activeLocale' ? activeLocaleShim : name === '@/i18n/localizedRoutes' ? { localizeHref: (target) => target } : mocks[name] || require(name), exports)
assert.deepEqual(await exports.readLinkedAccountState(), { userId: owner, discord: null })
await assert.rejects(() => exports.beginDiscordLink(other), /Aktif hesap/)
assert.equal(calls.length, 0)
await exports.beginDiscordLink(owner)
assert.equal(calls[0].provider, 'discord')
assert.equal(calls[0].options.skipBrowserRedirect, true)
assert.equal(calls[0].options.redirectTo, 'https://bsgmanga.pages.dev/')
assert.equal(exports.readPendingDiscordLink().userId, owner)
assert.equal(redirects.length, 1)
exports.clearPendingDiscordLink(); assert.equal(exports.readPendingDiscordLink(), null)
redirects = []; linkError = { code: 'manual_linking_disabled' }
await assert.rejects(() => exports.beginDiscordLink(owner), /sunucuda etkin değil/)
assert.equal(redirects.length, 0); assert.equal(exports.readPendingDiscordLink(), null)
linkError = { code: 'identity_already_exists' }
await assert.rejects(() => exports.beginDiscordLink(owner), /başka bir BSG hesabına/)
linkError = null; changeAccount = true
await assert.rejects(() => exports.beginDiscordLink(owner), /Aktif hesap/)
assert.equal(redirects.length, 0)
changeAccount = false; user = { id: owner, identities: [{ provider: 'discord', identity_data: { full_name: '<b>Discord adı</b>' } }] }
assert.equal((await exports.readLinkedAccountState()).discord.name, '<b>Discord adı</b>')
const before = calls.length
await assert.rejects(() => exports.beginDiscordLink(owner), /zaten/)
assert.equal(calls.length, before)
authError = new Error('unauthorized')
await assert.rejects(() => exports.readLinkedAccountState(), /tekrar giriş/)
storage.set('bsg-discord-link-pending', JSON.stringify({ userId: owner, startedAt: Date.now() - 16 * 60_000 }))
assert.equal(exports.readPendingDiscordLink(), null)
storage.set('bsg-discord-link-pending', '{bad json')
assert.equal(exports.readPendingDiscordLink(), null)
console.log('PASS Discord link: existing account, conflict, session change, server rejection and return record')
