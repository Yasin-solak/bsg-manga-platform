import type { AdminUserDetail } from '../adminUserTypes'
import { ADMIN_USER_DETAIL_CACHE_TTL_MS } from './shared.db'

type AdminUserDetailCacheEntry = {
  value: AdminUserDetail
  expiresAt: number
}

const adminUserDetailCache = new Map<string, AdminUserDetailCacheEntry>()

export function readCachedAdminUserDetail(userId: string) {
  const cached = adminUserDetailCache.get(userId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    adminUserDetailCache.delete(userId)
    return null
  }
  return cached.value
}

export function writeCachedAdminUserDetail(userId: string, detail: AdminUserDetail) {
  adminUserDetailCache.set(userId, {
    value: detail,
    expiresAt: Date.now() + ADMIN_USER_DETAIL_CACHE_TTL_MS,
  })
}

export function invalidateCachedAdminUserDetail(userId?: string) {
  if (!userId) {
    adminUserDetailCache.clear()
    return
  }
  adminUserDetailCache.delete(userId)
}
