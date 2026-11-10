import type { DashboardStats, AdminUser } from '@/data/admin'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { getAdminUserOverviewSnapshot } from '../adminUserService/overviewSnapshot'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getE2EMockAuthUser, getE2EMockStoreData } from '@/testing/e2eMocks'

const adminDashboardLogger = createScopedLogger('adminService/shared.dashboard')

export async function getDashboardStatsCore(): Promise<DashboardStats> {
  const e2eUser = getE2EMockAuthUser()
  if (e2eUser?.role === 'admin') {
    const e2eStore = getE2EMockStoreData()
    return {
      users: 1,
      fansubs: e2eStore?.adminFansubs.length ?? 0,
      mangas: 0,
    }
  }

  const requestContext = createRequestContext('adminService/shared.dashboard', 'getDashboardStatsCore')
  const [
    userStats,
    { count: fansubsCount },
    { count: mangasCount },
  ] = await withServiceTimeout(
    (signal) => Promise.all([
      // Note: the dashboard user overview stays centered on `supabase.rpc('get_admin_user_overview_counts')`;
      // the snapshot helper moves this raw RPC to the shared in-flight/TTL layer.
      getAdminUserOverviewSnapshot(),
      withAbortSignal(supabase.from('fansubs').select('id', { count: 'exact', head: true }), signal),
      withAbortSignal(supabase.from('mangas').select('id', { count: 'exact', head: true }), signal),
    ]),
    { label: 'adminService.getDashboardStatsCore' },
  ).catch((error) => {
    adminDashboardLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Dashboard ozet istatistikleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  })

  return {
    users: userStats.total,
    fansubs: fansubsCount || 0,
    mangas: mangasCount || 0,
  }
}

export async function getAdminUsersCore(): Promise<AdminUser[]> {
  const e2eUser = getE2EMockAuthUser()
  if (e2eUser?.role === 'admin') {
    return [{
      id: e2eUser.id,
      username: e2eUser.username,
      avatar: e2eUser.avatar,
      role: e2eUser.role,
      joinDate: e2eUser.onboardingCompletedAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
    }]
  }

  const requestContext = createRequestContext('adminService/shared.dashboard', 'getAdminUsersCore')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_recent_users', {
        p_limit: 50,
      }),
      signal,
    ),
    { label: 'adminService.getAdminUsersCore' },
  )

  if (error) {
    adminDashboardLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Dashboard kullanici listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as any[]).map((user: any) => ({
    id: user.id,
    username: user.username || 'Unknown',
    avatar: user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username || 'user'}`,
    email: undefined,
    role: user.role || 'user',
    joinDate: user.created_at,
    lastActive: user.updated_at,
  }))
}
