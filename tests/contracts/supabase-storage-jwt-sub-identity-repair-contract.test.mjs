import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235903_storage_jwt_sub_identity_repair.sql',
  'utf8',
)

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

assert.match(migration, /auth\.jwt\(\)->>'sub'/, 'storage odakli helper JWT sub uzerinden kimlik okumali')
assert.match(migration, /create or replace function app_private\.current_auth_user_id_from_jwt\(\)/i)
assert.match(migration, /create or replace function app_private\.current_public_user_id_from_jwt\(\)/i)
assert.match(migration, /create or replace function app_private\.is_admin_from_jwt\(\)/i)
assert.match(migration, /create or replace function app_private\.is_fansub_staff_from_jwt\(p_fansub_id uuid\)/i)
assert.match(migration, /create or replace function app_private\.can_write_pending_community_post_child_from_jwt\(p_post_id uuid\)/i)

const adminUploadPolicy = blockAfter(migration, 'create policy "Admin upload store assets"')
assert.match(adminUploadPolicy, /app_private\.is_admin_from_jwt\(\)/)
assert.doesNotMatch(adminUploadPolicy, /public\.current_app_role\(\)/)

const avatarUploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_auth_user_id_from_jwt\(\)::text/)
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id_from_jwt\(\)::text/)
assert.doesNotMatch(avatarUploadPolicy, /auth\.uid\(\)/, 'storage upload policy auth.uid yerine JWT sub helper kullanmali')

for (const policyName of ['Scoped update avatars', 'Scoped delete avatars']) {
  const policy = blockAfter(migration, `create policy "${policyName}"`)
  assert.match(policy, /coalesce\(owner_id, owner::text\) = app_private\.current_auth_user_id_from_jwt\(\)::text/)
  assert.match(policy, /app_private\.current_public_user_id_from_jwt\(\)::text/)
}

const communityUploadPolicy = blockAfter(migration, 'create policy "Community post image upload own pending posts"')
assert.match(
  communityUploadPolicy,
  /app_private\.can_write_pending_community_post_child_from_jwt\(\(\(storage\.foldername\(name\)\)\[3\]\)::uuid\)/,
)
assert.doesNotMatch(communityUploadPolicy, /app_private\.can_write_pending_community_post_child\(/)

console.log('PASS Supabase storage JWT sub identity repair contract kept')
