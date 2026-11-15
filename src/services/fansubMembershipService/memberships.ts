import { invalidateFansubMembershipCaches } from '@/services/fansubMembershipCache'
import { supabase } from '../supabase'
import { myFansubMembershipsCache, myFansubRoleCache } from '../fansubMembershipCache'
import { getE2EMockAuthUser, getE2EMockStoreData } from '@/testing/e2eMocks'
import { FANSUB_MEMBERSHIP_SELECT, mapDbFansubMembership } from './shared'
import type { FansubMemberRole } from './types'

export async function listMyFansubMemberships(userId: string) {
  const e2eUser = getE2EMockAuthUser()
  if (e2eUser?.id === userId) {
    const storeData = getE2EMockStoreData()
    return (storeData?.adminFansubs ?? []).map((fansub) => ({
      fansubId: fansub.id,
      userId,
      role: 'admin' as const,
      createdAt: new Date(0).toISOString(),
      fansub: {
        id: fansub.id,
        name: fansub.name,
        slug: fansub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fansub.id,
        avatarUrl: undefined,
      },
    }))
  }

  const rows = await myFansubMembershipsCache.get(`${userId}`, async () => {
    const { data, error } = await supabase
      .from('fansub_members')
      .select(FANSUB_MEMBERSHIP_SELECT)
      .eq('user_id', userId)
      .eq('fansub.is_active', true)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[fansubMembershipService] listMyFansubMemberships error', error)
      throw error
    }

    return (data ?? []).map(mapDbFansubMembership)
  }) as ReturnType<typeof mapDbFansubMembership>[]
  // Callers get their own array; the cached one stays untouched.
  return [...rows]
}

export async function hasAnyFansubMembership(userId: string) {
  const rows = await listMyFansubMemberships(userId)
  return rows.length > 0
}

export async function getMyFansubRole(fansubId: string, userId: string): Promise<FansubMemberRole | null> {
  return await myFansubRoleCache.get(`${userId}:${fansubId}`, async () => {
    const { data, error } = await supabase
      .from('fansub_members')
      .select('role')
      .eq('fansub_id', fansubId)
      .eq('user_id', userId)
      .maybeSingle<{ role: FansubMemberRole }>()

    if (error) {
      console.error('[fansubMembershipService] getMyFansubRole error', error)
      throw error
    }

    return data?.role ?? null
  }) as FansubMemberRole | null
}

export async function leaveFansub(fansubId: string) {
  const { data, error } = await supabase.rpc('leave_fansub', {
    p_fansub_id: fansubId,
  })

  // The membership may have changed; drop short-lived membership reads.
  invalidateFansubMembershipCaches()

  if (error) {
    console.error('[fansubMembershipService] leaveFansub error', error)
    throw error
  }

  return data as {
    success: boolean
    fansub_id: string
    user_id: string
    action: 'leave'
  }
}
