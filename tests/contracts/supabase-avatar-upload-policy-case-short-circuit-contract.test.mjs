import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260527235910_avatar_upload_policy_case_short_circuit.sql',
  'utf8',
)

assert.match(migration, /create policy "Scoped upload avatars"/)
assert.match(migration, /and case/i)
assert.match(migration, /when \(storage\.foldername\(name\)\)\[1\] = 'user-avatars'/i)
assert.match(migration, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.jwt\(\) ->> 'sub'\)/i)
assert.doesNotMatch(migration, /current_public_user_id_from_jwt/i)
assert.doesNotMatch(migration, /select u\.id::text/i)

console.log('PASS Avatar upload policy case short-circuit contract kept')
