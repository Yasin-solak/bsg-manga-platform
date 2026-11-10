import type { AdminUserDetail } from '../adminUserTypes'
import { fetchAdminUserDetailFallbackPayload } from './fallback.fetch'
import { mapAdminUserDetailFallback } from './fallback.map'

export async function getAdminUserDetailFallback(userId: string): Promise<AdminUserDetail> {
    const payload = await fetchAdminUserDetailFallbackPayload(userId)
    return mapAdminUserDetailFallback(payload)
}
