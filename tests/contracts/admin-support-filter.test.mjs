import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'
const require = createRequire(import.meta.url)
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const calls = []
let rows = [{ user_id: 'owner', support_attachments: [{ request_id: 'one' }] }, { user_id: 'owner', support_attachments: [] }], failure = null
const query = { then: resolve => resolve({ data: rows, count: 42, error: failure }) }
for (const method of ['select', 'eq', 'ilike', 'order', 'range']) query[method] = (...args) => { calls.push([method, ...args]); return query }
const mocks = {
  './supabase': { supabase: { from: table => { calls.push(['from', table]); return query }, rpc: async (name, args) => { calls.push([name, args]); return { data: [{ user_id: 'owner', username: 'reader' }], error: null } } } },
  './apiResilience': { withServiceTimeout: fn => fn() }, './requestContext': { createRequestContext: () => ({}) },
  './logger': { createScopedLogger: () => ({}) }, './userFacingError': { reportUserFacingError: () => {} },
}
function load(path) { const out = {}; new Function('require', 'exports', ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)((name) => name === '@/i18n/activeLocale' ? activeLocaleShim : mocks[name] || require(name), out); return out }
mocks['./diagnosticsTypes'] = load('src/services/diagnosticsTypes.ts')
const { listAdminSupportPage } = load('src/services/supportRequestService.ts')
const result = await listAdminSupportPage({ page: 2, status: 'open', category: 'technical', search: '  %_\\  ' })
assert.equal(result.total, 42)
assert.deepEqual(result.rows.map(row => [row.username, row.hasScreenshot]), [['reader', true], ['reader', false]])
assert.ok(calls.some(call => call[0] === 'select' && call[2].count === 'exact'))
assert.deepEqual(calls.find(call => call[0] === 'range'), ['range', 40, 59])
assert.deepEqual(calls.find(call => call[0] === 'ilike'), ['ilike', 'subject', '%\\%\\_\\\\%'])
assert.deepEqual(calls.find(call => call[0] === 'admin_support_identities')[1], { owner_ids: ['owner'] })
assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'status' && call[2] === 'open'))
assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'category' && call[2] === 'technical'))
calls.length = 0; rows = []
await listAdminSupportPage({ page: 0, status: 'all', category: 'all', search: '' })
assert.ok(!calls.some(call => ['eq', 'ilike', 'admin_support_identities'].includes(call[0])))
calls.length = 0
await assert.rejects(() => listAdminSupportPage({ page: -1, status: 'all', category: 'all', search: '' }))
await assert.rejects(() => listAdminSupportPage({ page: 0, status: 'unknown', category: 'all', search: '' }))
assert.equal(calls.length, 0)
failure = new Error('RLS denial')
await assert.rejects(() => listAdminSupportPage({ page: 0, status: 'all', category: 'all', search: '' }), /RLS denial/)
console.log('PASS admin support server filters, pagination, identity mapping and rejection behavior')
