import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235904_storage_policy_inline_jwt_subject.sql',
  'utf8',
)

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const avatarUploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.jwt\(\)->>'sub'\)/)
assert.match(avatarUploadPolicy, /select u\.id::text[\s\S]*where u\.auth_user_id = nullif\(auth\.jwt\(\)->>'sub', ''\)::uuid/i)
assert.doesNotMatch(avatarUploadPolicy, /current_auth_user_id_from_jwt|current_public_user_id_from_jwt/)

for (const policyName of ['Scoped update avatars', 'Scoped delete avatars']) {
  const policy = blockAfter(migration, `create policy "${policyName}"`)
  assert.match(policy, /coalesce\(owner_id, owner::text\) = \(select auth\.jwt\(\)->>'sub'\)/)
  assert.match(policy, /select u\.id::text[\s\S]*where u\.auth_user_id = nullif\(auth\.jwt\(\)->>'sub', ''\)::uuid/i)
}

const communityUploadPolicy = blockAfter(migration, 'create policy "Community post image upload own pending posts"')
assert.match(communityUploadPolicy, /join public\.users u on u\.id = cp\.author_id/i)
assert.match(communityUploadPolicy, /u\.auth_user_id = nullif\(auth\.jwt\(\)->>'sub', ''\)::uuid/i)
assert.doesNotMatch(communityUploadPolicy, /can_write_pending_community_post_child/i)

console.log('PASS Supabase storage policy inline JWT subject contract kept')
