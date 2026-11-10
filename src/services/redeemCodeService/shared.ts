import type {
  AdminRedeemCodeItem,
  RedeemCodeTargetType,
  RedeemCoinCodeInput,
  RedeemCoinCodeResult,
} from './types'

export type RedeemCodeRow = {
  id: string
  code: string
  value: number | null
  max_uses: number | null
  used_count: number | null
  target_type: RedeemCodeTargetType | null
  expires_at: string
  is_active: boolean | null
  created_at: string
}

export type RpcRedeemResponse = {
  /** v3 (20261103161000): user errors return success=false + error rather than an exception. */
  success?: boolean
  error?: string
  error_code?: string
  target_type?: string
  code_id?: string
  code?: string
  credited_value?: number
  new_balance?: number
  redeemed_at?: string
  fansub_id?: string
}

export type UserRedemptionRow = {
  id: string
  code_id: string
  user_id: string | null
  redeemed_at: string
}

export type FansubRedemptionRow = {
  id: string
  code_id: string
  fansub_id: string | null
  redeemed_by: string | null
  redeemed_at: string
}

export type IdentityUserRow = {
  id: string
  username: string | null
  avatar_url: string | null
}

export type IdentityFansubRow = {
  id: string
  name: string | null
}

export type IdentityCodeRow = {
  id: string
  code: string | null
  value: number | null
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ADMIN_REDEEM_CODE_LIST_CACHE_TTL_MS = 20_000

const adminRedeemCodeListCache = new Map<string, { value: AdminRedeemCodeItem[]; expiresAt: number }>()
const adminRedeemCodeListInFlight = new Map<string, Promise<{ data: AdminRedeemCodeItem[]; error: unknown }>>()

export function normalizeRedeemCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

export function normalizePrefix(input?: string) {
  const normalized = (input || 'BSG')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  return normalized || 'BSG'
}

export function randomToken(length: number) {
  if (length <= 0) return ''

  const values = new Uint32Array(length)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values)
  } else {
    for (let i = 0; i < length; i += 1) {
      values[i] = Math.floor(Math.random() * 1_000_000)
    }
  }

  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += CODE_CHARS[values[i] % CODE_CHARS.length]
  }
  return output
}

export function friendlyRedeemError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((item) => [item.id, item]))
}

export function isMissingRedeemRpc(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: unknown; message?: unknown; details?: unknown }
  if (typeof err.code === 'string' && err.code === '42883') return true

  const message = typeof err.message === 'string' ? err.message.toLowerCase() : ''
  const details = typeof err.details === 'string' ? err.details.toLowerCase() : ''
  return (
    (message.includes('redeem_coin_code') && message.includes('does not exist'))
    || (details.includes('redeem_coin_code') && details.includes('does not exist'))
  )
}

export function mapRedeemCodeRow(row: RedeemCodeRow): AdminRedeemCodeItem {
  const usedCount = Math.max(0, Number(row.used_count || 0))
  const maxUses = Math.max(1, Number(row.max_uses || 1))
  const expiresAt = row.expires_at
  const nowMs = Date.now()
  const expiresMs = new Date(expiresAt).getTime()
  const isExpired = Number.isFinite(expiresMs) ? expiresMs <= nowMs : false

  return {
    id: row.id,
    code: row.code,
    value: Number(row.value || 0),
    maxUses,
    usedCount,
    targetType: (row.target_type || 'both') as RedeemCodeTargetType,
    expiresAt,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    remainingUses: Math.max(0, maxUses - usedCount),
    isExpired,
  }
}

export function cloneAdminRedeemCodeItems(items: AdminRedeemCodeItem[]): AdminRedeemCodeItem[] {
  return items.map((item) => ({ ...item }))
}

export function serializeAdminRedeemCodeListParams(params?: {
  limit?: number
  search?: string
  isActive?: boolean
  targetType?: RedeemCodeTargetType | 'all'
}) {
  return JSON.stringify({
    limit: Math.min(Math.max(Number(params?.limit || 300), 1), 1000),
    search: (params?.search || '').trim().toUpperCase(),
    isActive: typeof params?.isActive === 'boolean' ? params.isActive : null,
    targetType: params?.targetType || 'all',
  })
}

export function readAdminRedeemCodeListCache(key: string): AdminRedeemCodeItem[] | null {
  const cached = adminRedeemCodeListCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    adminRedeemCodeListCache.delete(key)
    return null
  }
  return cloneAdminRedeemCodeItems(cached.value)
}

export function writeAdminRedeemCodeListCache(key: string, value: AdminRedeemCodeItem[]) {
  adminRedeemCodeListCache.set(key, {
    value: cloneAdminRedeemCodeItems(value),
    expiresAt: Date.now() + ADMIN_REDEEM_CODE_LIST_CACHE_TTL_MS,
  })
}

export function readAdminRedeemCodeListInFlight(key: string) {
  return adminRedeemCodeListInFlight.get(key)
}

export function setAdminRedeemCodeListInFlight(
  key: string,
  value: Promise<{ data: AdminRedeemCodeItem[]; error: unknown }>,
) {
  adminRedeemCodeListInFlight.set(key, value)
}

export function deleteAdminRedeemCodeListInFlight(key: string) {
  adminRedeemCodeListInFlight.delete(key)
}

export function invalidateAdminRedeemCodeListCache() {
  adminRedeemCodeListCache.clear()
  adminRedeemCodeListInFlight.clear()
}

export async function redeemCoinCodeLegacy(input: RedeemCoinCodeInput, normalizedCode: string): Promise<RedeemCoinCodeResult> {
  void input
  void normalizedCode
  throw new Error('Kod aktiflestirme RPC fonksiyonu bulunamadi. Lutfen guncel SQL migrationlarini calistirin.')
}
