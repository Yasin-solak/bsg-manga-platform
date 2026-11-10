import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235906_storage_policy_definer_jwt_repair.sql',
  'utf8',
)

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const uploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(uploadPolicy, /app_private\.current_auth_user_id_from_jwt\(\)::text/)
assert.match(uploadPolicy, /app_private\.current_public_user_id_from_jwt\(\)::text/)
assert.doesNotMatch(uploadPolicy, /select u\.id::text/i)
assert.doesNotMatch(uploadPolicy, /auth\.jwt\(\)->>'sub'/i)

for (const policyName of ['Scoped update avatars', 'Scoped delete avatars']) {
  const policy = blockAfter(migration, `create policy "${policyName}"`)
  assert.match(policy, /app_private\.current_auth_user_id_from_jwt\(\)::text/)
  assert.match(policy, /app_private\.current_public_user_id_from_jwt\(\)::text/)
  assert.doesNotMatch(policy, /select u\.id::text/i)
}

const communityPolicy = blockAfter(migration, 'create policy "Community post image upload own pending posts"')
assert.match(communityPolicy, /app_private\.can_write_pending_community_post_child_from_jwt/)
assert.doesNotMatch(communityPolicy, /join public\.users/i)

console.log('PASS Supabase storage policy definer JWT repair contract kept')
