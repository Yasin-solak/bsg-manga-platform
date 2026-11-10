import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
async function load(file) {
  const source = readFileSync(new URL(`../../src/lib/${file}.ts`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
const { createCommunityRefreshQueue } = await load('communityRefreshQueue')
const { mergeCommunityServerActivity: merge } = await load('communityServerActivity')
const calls = [], gates = [], applied = []
const queue = createCommunityRefreshQueue(async (kind, current) => {
  calls.push(kind)
  await new Promise(resolve => gates.push(resolve))
  if (current()) applied.push(kind)
})
const first = queue.request('activity')
const pending = Array.from({ length: 200 }, () => queue.request('activity'))
assert.deepEqual(calls, ['activity'], 'no parallel HTTP on a slow request')
gates.shift()(); await first
assert.deepEqual(applied, ['activity'], 'continuous activity cannot delay the earlier response forever')
assert.deepEqual(calls, ['activity', 'activity'])
const full = queue.request('full')
gates.shift()(); await Promise.all(pending)
assert.deepEqual(applied, ['activity'], 'a structural signal invalidates an old activity response')
assert.deepEqual(calls, ['activity', 'activity', 'full'])
gates.shift()(); await full
assert.deepEqual(applied, ['activity', 'full'])
const inFlight = queue.request('full'), trailing = queue.request('activity')
queue.dispose(); gates.shift()(); await Promise.all([inFlight, trailing, queue.request('full')])
assert.deepEqual(applied, ['activity', 'full'], 'a closed server response cannot be applied')
let failed = true
const errors = createCommunityRefreshQueue(async () => { if (failed) throw Error('Bağlantı kesildi') })
await assert.rejects(errors.request('full'), /Bağlantı/)
failed = false; await errors.request('full'); errors.dispose()
const server = { profile: { id: 's' }, is_owner: false, permissions: ['messages.read','messages.send'], timeout_until: null, server_now: 'old', roles: ['unchanged'],
  channels: [{ id: 'a', name: 'Genel', unread: 4, can_read: true }, { id: 'b', name: 'Özel', unread: 1, can_read: true }] }
const activity = { server_id: 's', server_now: 'now', is_owner: false, permissions: ['messages.send','messages.read'], timeout_until: null,
  channels: [{ id: 'a', unread: 0, can_read: true }, { id: 'b', unread: 2, can_read: true }] }
let value = merge(server, activity)
assert.equal(value.reload, false); assert.equal(value.server.channels[0].name, 'Genel'); assert.equal(value.server.channels[0].unread, 0)
assert.equal(value.server.roles, server.roles, 'a counter refresh does not change roles')
value = merge(server, { ...activity, permissions: [], channels: [{ id: 'a', can_read: false, unread: 0 }] })
assert.equal(value.reload, true); assert.deepEqual(value.server.permissions, []); assert.equal(value.server.channels.length, 1); assert.equal(value.server.channels[0].can_read, false)
value = merge(server, { ...activity, channels: [...activity.channels, { id: 'new' }] })
assert.equal(value.reload, true); assert.equal(value.server.channels.length, 2, 'no new channel opens before metadata is read')
assert.equal(merge(server, { ...activity, server_id: 'other' }).server, server, 'another server response cannot mix in')
console.log('PASS community: single flight, signal merging, full check priority, cancel, recovery after error and authorized counter merging')
