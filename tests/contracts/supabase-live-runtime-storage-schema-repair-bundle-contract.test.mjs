import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235902_live_runtime_storage_schema_repair_bundle.sql',
  'utf8',
)

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

assert.match(migration, /create schema if not exists app_private;/i)
assert.match(migration, /create or replace function app_private\.current_public_user_id\(\)/i)
assert.match(migration, /create or replace function app_private\.can_write_pending_community_post_child\(p_post_id uuid\)/i)
assert.match(migration, /create or replace function app_private\.is_feature_enabled\(/i)

assert.match(migration, /add column if not exists modal_backdrop_asset_url text/i)
assert.match(migration, /add column if not exists effect_manifest jsonb not null default '\{\}'::jsonb/i)
assert.match(migration, /create policy "Admin upload store assets"/i)

assert.match(
  migration,
  /v_request_path text := lower\(coalesce\(current_setting\('request\.path', true\), ''\)\);/i,
  'repair bundle users guard request.path allowlistini icermeli',
)
assert.match(
  migration,
  /perform set_config\('app\.store_purchase_user_update', 'true', true\);/i,
  'repair bundle store purchase transaction flagini kurmali',
)

const avatarUploadPolicy = blockAfter(migration, 'create policy "Scoped upload avatars"')
assert.match(avatarUploadPolicy, /bucket_id = 'avatars'/)
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[1\] = 'user-avatars'/)
assert.match(
  avatarUploadPolicy,
  /coalesce\(owner_id, owner::text\) = auth\.uid\(\)::text/,
  'avatar insert policy owner_id tabanli sahiplik fallbackini kullanmali',
)
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/)
assert.match(avatarUploadPolicy, /\(storage\.foldername\(name\)\)\[2\] = app_private\.current_public_user_id\(\)::text/)
assert.doesNotMatch(avatarUploadPolicy, /from public\.users/i)

const communityUploadPolicy = blockAfter(migration, 'create policy "Community post image upload own pending posts"')
assert.match(communityUploadPolicy, /bucket_id = 'store-assets'/)
assert.match(
  communityUploadPolicy,
  /app_private\.can_write_pending_community_post_child\(\(\(storage\.foldername\(name\)\)\[3\]\)::uuid\)/,
)

assert.match(migration, /notify pgrst, 'reload schema';/i)

console.log('PASS Supabase live runtime storage schema repair bundle contract kept')
