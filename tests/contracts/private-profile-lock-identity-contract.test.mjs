import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Private account lock screen: a non-follower opening a private profile should see the lock screen, not 404.
// A narrow RPC gives the identity without loosening users RLS.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const migration = read('supabase/migrations/20261004170000_private_profile_lock_identity.sql')
assert.match(migration, /create or replace function app_private\.get_locked_profile_identity\(p_identifier text\)[\s\S]*?security definer/)
assert.match(migration, /u\.profile_visibility = 'private'/, 'the RPC must return only private accounts (open accounts are read via the view)')
assert.match(migration, /not app_private\.is_blocked_with_viewer\(u\.id\)/, 'Engelli ziyaretci gizli hesabi bulamamali')
assert.match(migration, /coalesce\(u\.is_banned, false\) = false/)
assert.match(migration, /coalesce\(u\.is_active, true\) = true/)
assert.match(migration, /revoke all on function app_private\.get_locked_profile_identity\(text\) from public;/)
assert.match(migration, /create or replace function public\.get_locked_profile_identity\(p_identifier text\)[\s\S]*?security invoker/)
assert.match(migration, /grant execute on function public\.get_locked_profile_identity\(text\) to anon, authenticated;/)
// The lock screen wants only identity: bio, social links, email etc. must not leak.
const projection = migration.match(/jsonb_build_object\(([\s\S]*?)\)\s*from public\.users/)
assert.ok(projection, 'RPC projeksiyonu bulunamadi')
for (const forbidden of ['bio', 'email', 'social_links', 'birth_date']) {
  assert.ok(!projection[1].includes(`'${forbidden}'`), `Kilit kimligi ${forbidden} sizdirmamali`)
}

const service = read('src/services/userService/profiles.ts')
const fnStart = service.indexOf('export async function getProfileIdentityByIdentifier')
assert.ok(fnStart >= 0)
const fnBody = service.slice(fnStart, service.indexOf('\nexport async function', fnStart + 10))
assert.match(service, /supabase\.rpc\('get_locked_profile_identity', \{ p_identifier: identifier \}\)/)
assert.match(fnBody, /lockedOrNotFound/, 'on an empty view the lock identity must be tried (lock screen instead of 404)')
assert.match(fnBody, /if \(!isUuid\) \{\s*return lockedOrNotFound\(\)/)
assert.match(fnBody, /blockedUserIds\.has\(lockedRow\.id\)/, 'the client-side block list must apply to the lock identity too')

const loader = read('src/pages/profile/profilePageLoader.ts')
assert.match(loader, /canViewProfile/, 'the loader must return a lock snapshot on an invisible profile')

console.log('private-profile-lock-identity contract OK')
