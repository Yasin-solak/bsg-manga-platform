import { supabase } from '../supabase'
import {
  cloneAdminRedeemCodeItems,
  deleteAdminRedeemCodeListInFlight,
  invalidateAdminRedeemCodeListCache,
  mapRedeemCodeRow,
  normalizePrefix,
  randomToken,
  readAdminRedeemCodeListCache,
  readAdminRedeemCodeListInFlight,
  RedeemCodeRow,
  serializeAdminRedeemCodeListParams,
  setAdminRedeemCodeListInFlight,
  writeAdminRedeemCodeListCache,
} from './shared'
import type {
  AdminRedeemCodeItem,
  CreateRedeemCodesInput,
  RedeemCodeTargetType,
} from './types'

export { invalidateAdminRedeemCodeListCache } from './shared'

export async function listAdminRedeemCodes(params?: {
  limit?: number
  search?: string
  isActive?: boolean
  targetType?: RedeemCodeTargetType | 'all'
}): Promise<{ data: AdminRedeemCodeItem[]; error: unknown }> {
  const cacheKey = serializeAdminRedeemCodeListParams(params)
  const cached = readAdminRedeemCodeListCache(cacheKey)
  if (cached) return { data: cached, error: null }

  const inFlight = readAdminRedeemCodeListInFlight(cacheKey)
  if (inFlight) {
    const result = await inFlight
    if (result.error) return { data: [], error: result.error }
    return { data: cloneAdminRedeemCodeItems(result.data), error: null }
  }

  const request = (async () => {
    const limit = Math.min(Math.max(Number(params?.limit || 300), 1), 1000)
    const search = (params?.search || '').trim().toUpperCase()
    const targetType = params?.targetType || 'all'

    let query = supabase
      .from('redeem_codes')
      .select('id, code, value, max_uses, used_count, target_type, expires_at, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (search) {
      query = query.ilike('code', `%${search}%`)
    }

    if (typeof params?.isActive === 'boolean') {
      query = query.eq('is_active', params.isActive)
    }

    if (targetType !== 'all') {
      query = query.eq('target_type', targetType)
    }

    const { data, error } = await query

    if (error) {
      console.error('[redeemCodeService] listAdminRedeemCodes error', error)
      return { data: [], error }
    }

    const mapped = ((data || []) as RedeemCodeRow[]).map(mapRedeemCodeRow)
    writeAdminRedeemCodeListCache(cacheKey, mapped)
    return {
      data: cloneAdminRedeemCodeItems(mapped),
      error: null,
    }
  })()

  setAdminRedeemCodeListInFlight(cacheKey, request)
  try {
    return await request
  } finally {
    deleteAdminRedeemCodeListInFlight(cacheKey)
  }
}

export async function setAdminRedeemCodeActive(codeId: string, isActive: boolean): Promise<{ success: boolean; error: unknown }> {
  const { error } = await supabase
    .from('redeem_codes')
    .update({ is_active: isActive })
    .eq('id', codeId)

  if (error) {
    console.error('[redeemCodeService] setAdminRedeemCodeActive error', error)
    return { success: false, error }
  }

  invalidateAdminRedeemCodeListCache()
  return { success: true, error: null }
}

export async function createAdminRedeemCodes(input: CreateRedeemCodesInput): Promise<{ data: AdminRedeemCodeItem[]; error: unknown }> {
  const count = Math.min(Math.max(Math.floor(Number(input.count || 0)), 1), 500)
  const value = Math.max(Math.floor(Number(input.value || 0)), 1)
  const maxUses = Math.max(Math.floor(Number(input.maxUses || 0)), 1)
  const targetType = input.targetType || 'user'
  const prefix = normalizePrefix(input.prefix)
  const expiresDate = new Date(input.expiresAt)

  if (Number.isNaN(expiresDate.getTime())) {
    return { data: [], error: new Error('Gecersiz son kullanim tarihi.') }
  }

  if (expiresDate.getTime() <= Date.now()) {
    return { data: [], error: new Error('Son kullanim tarihi gelecekte olmalidir.') }
  }

  const batchStamp = Date.now().toString(36).toUpperCase()
  const codes = new Set<string>()
  while (codes.size < count) {
    const indexPart = codes.size.toString(36).toUpperCase().padStart(2, '0')
    const randomPart = randomToken(8)
    codes.add(`${prefix}-${batchStamp}${indexPart}-${randomPart}`)
  }

  const rows = Array.from(codes).map((code) => ({
    code,
    value,
    max_uses: maxUses,
    used_count: 0,
    expires_at: expiresDate.toISOString(),
    target_type: targetType,
    is_active: true,
  }))

  const { data, error } = await supabase
    .from('redeem_codes')
    .insert(rows)
    .select('id, code, value, max_uses, used_count, target_type, expires_at, is_active, created_at')

  if (error) {
    console.error('[redeemCodeService] createAdminRedeemCodes error', error)
    return { data: [], error }
  }

  invalidateAdminRedeemCodeListCache()
  return {
    data: ((data || []) as RedeemCodeRow[]).map(mapRedeemCodeRow),
    error: null,
  }
}
