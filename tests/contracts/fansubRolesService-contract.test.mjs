import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// fansubRolesService: RPC responses are parsed, unknown permissions dropped, errors propagated.
let rpcCalls = []
let nextResponse = { data: null, error: null }
const supabase = {
  rpc(name, args) {
    rpcCalls.push({ name, args })
    return { abortSignal: () => Promise.resolve(nextResponse), then: (resolve) => resolve(nextResponse) }
  },
}
const apiResilience = {
  withAbortSignal: (query) => query,
  withServiceTimeout: async (operation, options) => {
    assert.ok(options.label, 'each RPC with a labeled timeout')
    return operation(new AbortController().signal)
  },
}

const exports = {}
const code = ts.transpileModule(read('src/services/fansubRolesService.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', code)((name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
  if (name === 'zod') return require('zod')
  if (name === '@/services/supabase') return { supabase }
  if (name === '@/services/apiResilience') return apiResilience
  throw new Error(`beklenmeyen import: ${name}`)
}, exports)

const fansubId = '11111111-1111-4111-8111-111111111111'

// Permissions: an unknown key (old or handwritten) does not leak to the UI.
nextResponse = { data: ['panel.erisim', 'ceviri.temizlik', 'eski.izin'], error: null }
const mine = await exports.getMyFansubPermissions(fansubId)
assert.deepEqual([...mine].sort(), ['ceviri.temizlik', 'panel.erisim'])
assert.deepEqual(rpcCalls.at(-1), { name: 'get_my_fansub_permissions', args: { p_fansub_id: fansubId } })

// Roles and assignments.
nextResponse = {
  data: {
    roles: [
      { id: 'r1', name: 'Moderatör', color: '#5b8def', position: 10, is_default: false, system_key: 'moderator', permissions: ['panel.erisim', 'x.y'], member_count: 2 },
      { id: 'r0', name: 'Üye', color: null, position: 1000, is_default: true, system_key: 'member', permissions: [], member_count: 0 },
    ],
    assignments: [{ user_id: 'u1', role_ids: ['r1'] }],
    catalog: [],
    can_manage: true,
  },
  error: null,
}
const snapshot = await exports.listFansubRoles(fansubId)
assert.equal(snapshot.roles.length, 2)
assert.deepEqual(snapshot.roles[0].permissions, ['panel.erisim'], 'bilinmeyen izin atilir')
assert.equal(snapshot.roles[1].isDefault, true)
assert.deepEqual(snapshot.assignments.get('u1'), ['r1'])
assert.equal(snapshot.canManage, true)

// Management calls go with the right action and body; an empty string if no color (the DB makes it null).
nextResponse = { data: {}, error: null }
await exports.saveFansubRole(fansubId, { name: 'Temizlikçi', color: null, permissions: ['ceviri.gor', 'ceviri.temizlik'] })
assert.deepEqual(rpcCalls.at(-1), { name: 'manage_fansub_roles', args: { p_fansub_id: fansubId, p_action: 'save_role', p: { name: 'Temizlikçi', color: '', permissions: ['ceviri.gor', 'ceviri.temizlik'] } } })
await exports.setFansubMemberRoles(fansubId, 'u1', ['r1'])
assert.deepEqual(rpcCalls.at(-1).args, { p_fansub_id: fansubId, p_action: 'set_member_roles', p: { user_id: 'u1', role_ids: ['r1'] } })
await exports.deleteFansubRole(fansubId, 'r1')
assert.deepEqual(rpcCalls.at(-1).args.p, { id: 'r1' })

// Errors are not swallowed (the UI shows the user).
nextResponse = { data: null, error: { message: 'Rolleri yalnız fansub admini yönetebilir.', code: '42501' } }
await assert.rejects(() => exports.deleteFansubRole(fansubId, 'r1'), (error) => error.code === '42501')

console.log('PASS fansubRolesService (permission parsing, role snapshot, management bodies, error propagation)')
