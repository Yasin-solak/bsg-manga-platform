import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const source = readFileSync(new URL('../../src/services/communityProfileSchema.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports = {}
new Function('require', 'exports', compiled)(createRequire(import.meta.url), exports)
const { communityProfileSchema } = exports
const profile = {
  id: '70000000-0000-4000-8000-000000000001', owner_id: '70000000-0000-4000-8000-000000000002',
  name: 'Okuma Kulübü', description: '', rules: '', avatar_url: null, banner_url: null,
  slug: 'okuma-kulubu', kind: 'room', join_mode: 'open', archived_at: null, version: 1,
}
assert.deepEqual(communityProfileSchema.parse(profile), profile)
for (const kind of ['fansub', 'room']) {
  for (const join_mode of ['open', 'invite', 'request']) {
    assert.equal(communityProfileSchema.safeParse({ ...profile, kind, join_mode }).success, true)
  }
}
for (const invalid of [null, [], { ...profile, id: 'bad-id' }, { ...profile, owner_id: null },
  { ...profile, kind: 'admin' }, { ...profile, join_mode: 'public' }, { ...profile, version: '1' },
  { ...profile, transfer_to: 'bad-id' }, { ...profile, name: null }, { ...profile, avatar_url: 123 }]) {
  assert.equal(communityProfileSchema.safeParse(invalid).success, false)
}
assert.equal(communityProfileSchema.parse({ ...profile, transfer_to: null, transfer_until: null }).transfer_to, null)
assert.equal(communityProfileSchema.parse({ ...profile, transfer_to: profile.owner_id, transfer_until: '2026-09-25T12:00:00Z' }).transfer_to, profile.owner_id)
assert.equal('is_owner' in communityProfileSchema.parse({ ...profile, is_owner: true }), false)
console.log('PASS community profile schema: room/fansub, join options, transfer, broken API response and unexpected fields')
