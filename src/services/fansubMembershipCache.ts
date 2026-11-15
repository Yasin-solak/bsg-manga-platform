import { createShortLivedCache } from '@/lib/shortLivedCache'

/**
 * Route guards, the sidebar and detail pages ask the same fansub_members questions within the same
 * second. Keys always start with the user id so one account can never read another's entry, and
 * every cache is also dropped on sign-out / user switch (see clearAllShortLivedCaches).
 */
const MEMBERSHIP_TTL_MS = 5_000

export const myFansubRoleCache = createShortLivedCache<string | null>(MEMBERSHIP_TTL_MS)
export const myFansubMembershipsCache = createShortLivedCache<unknown[]>(MEMBERSHIP_TTL_MS)
export const fansubAdminCheckCache = createShortLivedCache<boolean>(MEMBERSHIP_TTL_MS)
// The wallet carries the coin balance, so it is only de-duplicated while in flight.
export const myAdminFansubsCache = createShortLivedCache<unknown[]>(0)

/** Call after any mutation that can change who belongs to a fansub or with which role. */
export function invalidateFansubMembershipCaches() {
  myFansubRoleCache.invalidate()
  myFansubMembershipsCache.invalidate()
  fansubAdminCheckCache.invalidate()
  myAdminFansubsCache.invalidate()
}
