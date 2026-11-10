import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { featureFlagUsageSource } from '../../scripts/repo-health-feature-flags.mjs'

const sql = source => ({ relativePath: 'supabase/migrations/20260921000000_policy.sql', source, isAppCode: false })
const key = 'community.servers_auto_create'
assert.equal(featureFlagUsageSource({ isAppCode: true, source: key }), key)
assert.equal(featureFlagUsageSource({ relativePath: 'docs/policy.md', source: key }), '')
assert.equal(featureFlagUsageSource({ relativePath: 'tests/policy.sql', source: key }), '')
assert.equal(featureFlagUsageSource(sql(`insert into feature_flags(key) values ('${key}');`)), '')
for (const delimiter of ['$$', '$body$']) {
  const source = `create or replace function f() returns boolean language sql as ${delimiter} select is_feature_enabled('${key}', false); ${delimiter};`
  assert.equal(featureFlagUsageSource(sql(source)).includes(key), true)
  assert.equal(featureFlagUsageSource(sql(`-- ${source}`)), '')
  assert.equal(featureFlagUsageSource(sql(`/* ${source} */`)), '')
}
const migration = readFileSync(new URL('../../supabase/migrations/20260919155631_community_v2_membership_policy.sql', import.meta.url), 'utf8')
assert.equal(featureFlagUsageSource(sql(migration)).includes(key), true)
console.log('PASS flag audit: client and SQL function use, seed/comment/test split')
