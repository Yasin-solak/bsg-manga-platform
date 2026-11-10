import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { inlineActiveLocale } from './i18n-source.mjs'

const source = readFileSync(new URL('../../src/lib/communityManagementPolicy.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { allowedManagementTabs, roleControls, channelGroups } = await import(`data:text/javascript;base64,${Buffer.from(inlineActiveLocale(js)).toString('base64')}`)
const server = (permissions, more = {}) => ({ permissions, is_owner: false, my_rank: 100, timeout_until: null, ...more })
const lower = { manageable: true, is_default: false }, protectedRole = { manageable: false, is_default: false }

assert.deepEqual(allowedManagementTabs(server(['messages.send'])), [])
assert.deepEqual(allowedManagementTabs(server(['roles.assign'])).map(([id]) => id), ['preview', 'members'])
assert.deepEqual(allowedManagementTabs(server(['channels.archive'])).map(([id]) => id), ['channels'])
assert.deepEqual(allowedManagementTabs(server(['roles.create'], { timeout_until: '2999-01-01T00:00:00Z' })), [])
assert.deepEqual(allowedManagementTabs(server([], { is_owner: true })).map(([id]) => id), ['profile', 'requests', 'preview', 'roles', 'channels', 'members', 'reports', 'invites', 'audit'])
assert.deepEqual(allowedManagementTabs(server(['server.join.manage'])).map(([id]) => id), ['profile'])
assert.deepEqual(allowedManagementTabs(server(['members.nicknames.manage'])).map(([id]) => id), ['members'])
assert.deepEqual(allowedManagementTabs(server(['members.approve'])).map(([id]) => id), ['requests'])

assert.deepEqual(allowedManagementTabs(server(['reports.review'])).map(([id]) => id), ['reports'])
assert.deepEqual(allowedManagementTabs(server(['invites.create'])).map(([id]) => id), ['invites'])
assert.deepEqual(allowedManagementTabs(server(['invites.manage'])).map(([id]) => id), ['invites'])
const appearance = roleControls(server(['roles.appearance.manage']), lower)
assert.equal(appearance.appearance, true)
assert.equal(appearance.order, false)
assert.equal(appearance.permissions, false)
assert.equal(appearance.remove, false)
const permissionEditor = roleControls(server(['roles.permissions.manage', 'messages.read']), lower)
assert.equal(permissionEditor.grant('messages.read'), true)
assert.equal(permissionEditor.grant('members.ban'), false)
for (const key of ['appearance', 'permissions', 'order', 'remove']) {
  assert.equal(roleControls(server(['roles.appearance.manage', 'roles.permissions.manage', 'roles.order.manage', 'roles.delete']), protectedRole)[key], false)
}
assert.equal(roleControls(server(['roles.delete']), { ...lower, is_default: true }).remove, false)
assert.equal(roleControls(server(['roles.create'], { my_rank: 1000 })).appearance, false)
assert.equal(roleControls(server(['roles.create'], { my_rank: 999 })).appearance, true)
assert.equal(roleControls(server(['roles.create', 'messages.send'])).grant('messages.send'), true)

const channels = [{ id: 'a', category: '' }, { id: 'b', category: 'Çeviri' }, { id: 'c', category: '', archived_at: '2026-09-19' }, { id: 'd', category: 'Çeviri' }]
assert.deepEqual(channelGroups(channels).map(([name, list]) => [name, list.map(c => c.id)]), [['Sohbet kanalları', ['a']], ['Çeviri', ['b', 'd']]])
assert.deepEqual(channelGroups([{ id: 'old', archived_at: '2026-09-19' }]), [])
console.log('PASS community management: section access, delegable permissions, protected roles, last rank, timed restriction and archive grouping')
