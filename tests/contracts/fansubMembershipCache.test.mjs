import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8')

// Membership read caches: per-user keys, balance never kept, invalidated by every membership mutation.
const membershipCache = read('src/services/fansubMembershipCache.ts')
assert.match(membershipCache, /myAdminFansubsCache = createShortLivedCache<unknown\[\]>\(0\)/, 'the wallet (coin balance) must only be de-duplicated in flight')
for (const [file, key] of [
  ['src/services/fansubMembershipService/memberships.ts', 'myFansubRoleCache.get(`${userId}:'],
  ['src/services/fansubMembershipService/memberships.ts', 'myFansubMembershipsCache.get(`${userId}`'],
  ['src/services/fansubService/management.ts', 'fansubAdminCheckCache.get(`${userId}:'],
  ['src/services/fansubService/management.ts', 'myAdminFansubsCache.get(userId'],
]) {
  assert.ok(read(file).includes(key), `${file} must key cached membership reads by user id (${key})`)
}
for (const file of [
  'src/services/fansubMembershipService/invites.ts',
  'src/services/fansubMembershipService/joinRequests.ts',
  'src/services/fansubMembershipService/management.ts',
  'src/services/fansubMembershipService/memberships.ts',
  'src/services/fansubService/management.ts',
]) {
  assert.ok(read(file).includes('invalidateFansubMembershipCaches()'), `${file} must invalidate membership caches after membership mutations`)
}
assert.match(read('src/contexts/AuthContext.tsx'), /clearAllShortLivedCaches\(\)/, 'auth changes must drop every short-lived read cache')

console.log('PASS fansub membership read caches are per-user, balance-free and invalidated on mutations')
