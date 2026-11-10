import type { AdminUserDetail } from './adminUserTypes'
import { getE2EAdminUserDetail } from '@/testing/adminUsersE2e'
import { getAdminUserDetailFallback } from './adminUserDetailService/fallback'
import { getAdminUserDetailByRpc } from './adminUserDetailService/rpc'
import {
    invalidateCachedAdminUserDetail,
    isRpcMissingFunctionError,
    readCachedAdminUserDetail,
    writeCachedAdminUserDetail,
} from './adminUserDetailService/shared'

export function invalidateAdminUserDetailCache(userId?: string) {
    invalidateCachedAdminUserDetail(userId)
}

export async function getAdminUserDetail(
    userId: string,
    options: { forceRefresh?: boolean } = {},
): Promise<AdminUserDetail> {
    const normalizedUserId = userId.trim()
    if (!normalizedUserId) {
        throw new Error('Kullanici id zorunludur.')
    }

    const e2eDetail = getE2EAdminUserDetail(normalizedUserId)
    if (e2eDetail) return e2eDetail

    if (!options.forceRefresh) {
        const cached = readCachedAdminUserDetail(normalizedUserId)
        if (cached) return cached
    }

    try {
        const rpcDetail = await getAdminUserDetailByRpc(normalizedUserId)
        writeCachedAdminUserDetail(normalizedUserId, rpcDetail)
        return rpcDetail
    } catch (error) {
        if (!isRpcMissingFunctionError(error)) {
            throw error
        }

        const fallbackDetail = await getAdminUserDetailFallback(normalizedUserId)
        writeCachedAdminUserDetail(normalizedUserId, fallbackDetail)
        return fallbackDetail
    }
}
