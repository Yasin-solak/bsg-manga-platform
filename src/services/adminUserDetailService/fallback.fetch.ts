import { fetchAdminUserDetailFallbackActivity } from './fallback.fetch.activity'
import { fetchAdminUserDetailFallbackFansubs } from './fallback.fetch.fansubs'
import { fetchAdminUserDetailFallbackProfile } from './fallback.fetch.profile'
import type { AdminUserDetailFallbackPayload } from './fallback.types'

export async function fetchAdminUserDetailFallbackPayload(userId: string): Promise<AdminUserDetailFallbackPayload> {
    const [profileRow, activityPayload, fansubPayload] = await Promise.all([
        fetchAdminUserDetailFallbackProfile(userId),
        fetchAdminUserDetailFallbackActivity(userId),
        fetchAdminUserDetailFallbackFansubs(userId),
    ])

    return {
        profileRow,
        ...activityPayload,
        ...fansubPayload,
    }
}
