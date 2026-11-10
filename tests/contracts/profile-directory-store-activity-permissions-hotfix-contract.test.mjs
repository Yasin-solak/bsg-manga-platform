import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260609120432_profile_directory_and_store_activity_permissions_hotfix.sql',
  'utf8',
)
const profilesSource = readFileSync('src/services/userService/profiles.ts', 'utf8')

assert.match(
  migration,
  /create or replace function app_private\.visible_profile_background_for_user\(/i,
  'the public profile background must resolve the sensitive premium expiry inside a private helper.',
)
assert.match(
  migration,
  /create or replace view public\.public_user_directory\s+with \(security_invoker = true\)/i,
  'the public user projection must keep RLS rules with security_invoker.',
)
assert.match(
  migration,
  /app_private\.visible_profile_background_for_user\(u\.id, u\.background_type\)/i,
  'Public projection premium_expires_at kolonunu dogrudan okumamalidir.',
)
assert.doesNotMatch(
  migration.match(/create or replace view public\.public_user_directory[\s\S]*?grant select on public\.public_user_directory/i)?.[0] ?? '',
  /u\.premium_expires_at/i,
  'the public projection must not require column permission on the sensitive premium expiry date.',
)
assert.doesNotMatch(
  migration,
  /grant select\s*\([^)]*premium_expires_at[^)]*\)\s*on public\.users/i,
  'the premium expiry must not open to anon or authenticated roles.',
)

for (const tableName of [
  'store_wishlist_items',
  'store_purchase_requests',
  'store_item_gifts',
  'store_package_events',
]) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'),
    `${tableName} must keep RLS protection on.`,
  )
}

assert.match(
  migration,
  /grant select, insert, delete on table public\.store_wishlist_items to authenticated/i,
  'an authenticated user must be able to manage the wishlist.',
)
assert.match(
  migration,
  /store_item_gifts_select_participant[\s\S]*app_private\.current_public_user_id\(\)/i,
  'the product gift participant RLS policy must use a private helper.',
)
assert.match(
  migration,
  /store_package_events_select_participant[\s\S]*app_private\.current_public_user_id\(\)/i,
  'Paket hareketleri katilimci RLS politikasi private helper kullanmalidir.',
)

assert.match(
  profilesSource,
  /function isPermissionDeniedError\(/,
  'the profile identity loader must recognize a permission error narrowly.',
)
assert.match(
  profilesSource,
  /if \(isPermissionDeniedError\(usernameResult\.error\)\)[\s\S]*loadProfileIdentityByRpcFallback/,
  'on a public projection permission error the safe profile RPC fallback must be used.',
)

console.log('PASS profile directory and shop activity permission hotfix contract kept')
