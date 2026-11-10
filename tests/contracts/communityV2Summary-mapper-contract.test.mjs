import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Studio "Server" tab summary mapping: even if the RPC body is broken / incomplete the UI draws with
// safe defaults; server is null if there is no server id.
const source = readFileSync(new URL('../../src/services/fansubManageService/communityV2Summary.ts', import.meta.url), 'utf8')
const exports = {}
const noop = () => {}
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'exports', code)((name) => ({
  '../apiResilience': { withAbortSignal: noop, withServiceTimeout: noop },
  '../logger': { createScopedLogger: () => ({ error: noop }) },
  '../supabase': { supabase: {} },
  '../userFacingError': { toUserFacingErrorMessage: noop },
})[name] ?? (() => { throw new Error(`beklenmeyen import: ${name}`) })(), exports)

const { mapFansubCommunityV2Summary, EMPTY_FANSUB_COMMUNITY_V2_STATS } = exports

const empty = mapFansubCommunityV2Summary(null)
assert.equal(empty.server, null)
assert.equal(empty.enabled, false)
assert.deepEqual(empty.stats, EMPTY_FANSUB_COMMUNITY_V2_STATS)
assert.deepEqual(empty.channels, [])

const full = mapFansubCommunityV2Summary([{
  enabled: true,
  canCreate: false,
  adminCount: '1',
  server: { id: 's1', name: '', joinMode: 'garip', isMember: true, isOwner: 'evet' },
  stats: { members: '12', messages7d: 40, openReports: null },
  channels: [{ id: 'c1', name: 'genel', isPrivate: true, messages7d: '3' }, { name: 'kimliksiz' }],
  daily: [{ day: '2026-10-30', messages: '5' }],
}])
assert.equal(full.enabled, true)
assert.equal(full.adminCount, 1)
assert.equal(full.server.name, 'Sunucu', 'a default instead of an empty name')
assert.equal(full.server.joinMode, 'open', 'an unknown join mode counts as open')
assert.equal(full.server.isOwner, false, 'only true gives ownership')
assert.equal(full.stats.members, 12)
assert.equal(full.stats.openReports, 0)
assert.equal(full.channels.length, 1, 'kimliksiz kanal atlanir')
assert.equal(full.channels[0].messages7d, 3)
assert.deepEqual(full.daily, [{ day: '2026-10-30', messages: 5 }])

const noServer = mapFansubCommunityV2Summary({ enabled: true, server: { name: 'x' }, canCreate: true })
assert.equal(noServer.server, null, 'a server with no id is ignored')
assert.equal(noServer.canCreate, true)

console.log('PASS community v2 server summary mapping (safe defaults)')
