import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260601235912_avatar_public_user_path_case_fallback.sql',
  'utf8',
)

assert.match(migration, /drop policy if exists "Scoped upload avatars" on storage\.objects/)
assert.match(migration, /create policy "Scoped upload avatars"/)
assert.match(migration, /when \(storage\.foldername\(name\)\)\[1\] = 'user-avatars'/i)
assert.match(
  migration,
  /when \(storage\.foldername\(name\)\)\[2\] = \(select auth\.jwt\(\) ->> 'sub'\) then true/i,
)
assert.match(
  migration,
  /else \(storage\.foldername\(name\)\)\[2\] = \(\s*select app_private\.current_public_user_id_from_jwt\(\)::text\s*\)/i,
)
assert.doesNotMatch(migration, /from public\.users/i)
assert.doesNotMatch(migration, /current_auth_user_id_from_jwt/i)

console.log('PASS Avatar public user path CASE fallback contract kept')
