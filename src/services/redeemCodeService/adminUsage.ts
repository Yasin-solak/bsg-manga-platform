import { supabase } from '../supabase'
import { listAdminUserDirectoryByIds } from '../userService/adminDirectory'
import {
  FansubRedemptionRow,
  IdentityCodeRow,
  IdentityFansubRow,
  IdentityUserRow,
  mapById,
  UserRedemptionRow,
} from './shared'
import type { AdminRedeemUsageCounts, AdminRedeemUsageEvent } from './types'

export async function getAdminRedeemUsageCounts(): Promise<{ data: AdminRedeemUsageCounts; error: unknown }> {
  const [userResult, fansubResult] = await Promise.all([
    supabase
      .from('user_code_redemptions')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('fansub_code_redemptions')
      .select('id', { count: 'exact', head: true }),
  ])

  if (userResult.error) {
    console.error('[redeemCodeService] getAdminRedeemUsageCounts user_count error', userResult.error)
    return { data: { userActivations: 0, fansubActivations: 0 }, error: userResult.error }
  }

  if (fansubResult.error) {
    console.error('[redeemCodeService] getAdminRedeemUsageCounts fansub_count error', fansubResult.error)
    return { data: { userActivations: 0, fansubActivations: 0 }, error: fansubResult.error }
  }

  return {
    data: {
      userActivations: Number(userResult.count || 0),
      fansubActivations: Number(fansubResult.count || 0),
    },
    error: null,
  }
}

export async function listAdminRedeemUsageEvents(limit = 30): Promise<{ data: AdminRedeemUsageEvent[]; error: unknown }> {
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit || 0)), 1), 200)

  const [userResult, fansubResult] = await Promise.all([
    supabase
      .from('user_code_redemptions')
      .select('id, code_id, user_id, redeemed_at')
      .order('redeemed_at', { ascending: false })
      .limit(safeLimit),
    supabase
      .from('fansub_code_redemptions')
      .select('id, code_id, fansub_id, redeemed_by, redeemed_at')
      .order('redeemed_at', { ascending: false })
      .limit(safeLimit),
  ])

  if (userResult.error) {
    console.error('[redeemCodeService] listAdminRedeemUsageEvents user_rows error', userResult.error)
    return { data: [], error: userResult.error }
  }

  if (fansubResult.error) {
    console.error('[redeemCodeService] listAdminRedeemUsageEvents fansub_rows error', fansubResult.error)
    return { data: [], error: fansubResult.error }
  }

  const userRows = (userResult.data || []) as UserRedemptionRow[]
  const fansubRows = (fansubResult.data || []) as FansubRedemptionRow[]

  const codeIds = Array.from(new Set([
    ...userRows.map((row) => row.code_id).filter(Boolean),
    ...fansubRows.map((row) => row.code_id).filter(Boolean),
  ]))
  const userIds = Array.from(new Set([
    ...userRows.map((row) => row.user_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
    ...fansubRows.map((row) => row.redeemed_by).filter((id): id is string => typeof id === 'string' && id.length > 0),
  ]))
  const fansubIds = Array.from(new Set(
    fansubRows
      .map((row) => row.fansub_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ))

  const [codesResult, usersResult, fansubsResult] = await Promise.all([
    codeIds.length > 0
      ? supabase
        .from('redeem_codes')
        .select('id, code, value')
        .in('id', codeIds)
      : Promise.resolve({ data: [] as IdentityCodeRow[], error: null }),
    userIds.length > 0
      ? listAdminUserDirectoryByIds(userIds)
      : Promise.resolve([] as IdentityUserRow[]),
    fansubIds.length > 0
      ? supabase
        .from('fansubs')
        .select('id, name')
        .in('id', fansubIds)
      : Promise.resolve({ data: [] as IdentityFansubRow[], error: null }),
  ])

  if (codesResult.error) {
    console.error('[redeemCodeService] listAdminRedeemUsageEvents codes_lookup error', codesResult.error)
    return { data: [], error: codesResult.error }
  }
  if (fansubsResult.error) {
    console.error('[redeemCodeService] listAdminRedeemUsageEvents fansubs_lookup error', fansubsResult.error)
    return { data: [], error: fansubsResult.error }
  }

  const codeById = mapById((codesResult.data || []) as IdentityCodeRow[])
  const userById = mapById((usersResult || []) as IdentityUserRow[])
  const fansubById = mapById((fansubsResult.data || []) as IdentityFansubRow[])

  const userEvents = userRows.map((row) => {
    const actor = row.user_id ? userById.get(row.user_id) : undefined
    const code = codeById.get(row.code_id)
    const username = (actor?.username || '').trim() || 'Bilinmeyen Kullanici'

    return {
      id: `user-${row.id}`,
      codeId: row.code_id,
      code: String(code?.code || '').trim() || '-',
      targetType: 'user' as const,
      creditedValue: Number(code?.value || 0),
      redeemedAt: row.redeemed_at,
      userId: row.user_id || null,
      username,
      userAvatarUrl: actor?.avatar_url || null,
      fansubId: null,
      fansubName: null,
    }
  })

  const fansubEvents = fansubRows.map((row) => {
    const actor = row.redeemed_by ? userById.get(row.redeemed_by) : undefined
    const fansub = row.fansub_id ? fansubById.get(row.fansub_id) : undefined
    const code = codeById.get(row.code_id)
    const username = (actor?.username || '').trim() || 'Bilinmeyen Kullanici'

    return {
      id: `fansub-${row.id}`,
      codeId: row.code_id,
      code: String(code?.code || '').trim() || '-',
      targetType: 'fansub' as const,
      creditedValue: Number(code?.value || 0),
      redeemedAt: row.redeemed_at,
      userId: row.redeemed_by || null,
      username,
      userAvatarUrl: actor?.avatar_url || null,
      fansubId: row.fansub_id || null,
      fansubName: (fansub?.name || '').trim() || 'Bilinmeyen Fansub',
    }
  })

  const merged = [...userEvents, ...fansubEvents]
    .sort((a, b) => {
      const aMs = new Date(a.redeemedAt).getTime()
      const bMs = new Date(b.redeemedAt).getTime()
      return bMs - aMs
    })
    .slice(0, safeLimit)

  return { data: merged, error: null }
}
