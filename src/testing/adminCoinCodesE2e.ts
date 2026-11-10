import type {
  AdminCoinActivationPage,
  AdminCoinCodeOverview,
  AdminCoinCodePage,
  AdminRedeemCodeItem,
  AdminRedeemUsageEvent,
} from '@/services/redeemCodeService/types'
import { isE2EModeEnabled } from './e2eMocks'

const DAY = 86_400_000
const now = Date.now()
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString()

const codes: AdminRedeemCodeItem[] = Array.from({ length: 32 }, (_, index) => {
  const usedCount = index % 4 === 0 ? 1 : 0
  const maxUses = index % 7 === 0 ? 5 : 1
  const expiresAt = iso(index % 9 === 0 ? -2 : 8 + index)
  const isActive = index % 11 !== 0
  return {
    id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    code: `MZ-${String(index + 1).padStart(4, '0')}-VITRIN${String(index % 10)}`,
    value: [250, 500, 1000, 25000][index % 4],
    maxUses,
    usedCount,
    targetType: (['user', 'fansub', 'both'] as const)[index % 3],
    expiresAt,
    isActive,
    createdAt: iso(-index),
    remainingUses: Math.max(maxUses - usedCount, 0),
    isExpired: new Date(expiresAt).getTime() <= now,
    seriesLabel: index < 16 ? 'Yaz Kampanyasi 08/2026' : 'Topluluk Etkinligi',
    distributionChannel: index % 2 === 0 ? 'Discord' : 'E-posta',
    notes: 'E2E vitrin kalitesinde operasyon kaydi.',
    createdBy: '71000000-0000-4000-8000-000000000001',
  }
})

const events: AdminRedeemUsageEvent[] = codes.slice(0, 18).map((code, index) => ({
  id: `user:73000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  codeId: code.id,
  code: code.code,
  targetType: index % 3 === 0 ? 'fansub' : 'user',
  creditedValue: code.value,
  redeemedAt: iso(-(index / 5)),
  userId: `74000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  username: ['ayisigi_okuru', 'panel_sever', 'gece_cevirmeni'][index % 3],
  userAvatarUrl: null,
  fansubId: index % 3 === 0 ? '75000000-0000-4000-8000-000000000001' : null,
  fansubName: index % 3 === 0 ? 'Lumiere Scan' : null,
}))

export function getE2ECoinOverview(periodDays: 7 | 30 | 90): AdminCoinCodeOverview | null {
  if (!isE2EModeEnabled()) return null
  return {
    generatedAt: new Date(now).toISOString(),
    periodDays,
    totalCodes: codes.length,
    activeCodes: codes.filter((item) => item.isActive && !item.isExpired).length,
    passiveCodes: codes.filter((item) => !item.isActive).length,
    expiredCodes: codes.filter((item) => item.isExpired).length,
    usedCodes: codes.filter((item) => item.usedCount > 0).length,
    totalActivations: events.length,
    distributedCoin: events.reduce((sum, item) => sum + item.creditedValue, 0),
    activeExposureCoin: 16_001_999_800,
    potentialDistributionCoin: 20_003_224_778,
    highRiskCodes: 6,
    expiringSevenDays: 4,
    userActivations: events.filter((item) => item.targetType === 'user').length,
    fansubActivations: events.filter((item) => item.targetType === 'fansub').length,
    daily: Array.from({ length: periodDays }, (_, index) => ({
      day: new Date(now - (periodDays - index - 1) * DAY).toISOString().slice(0, 10),
      activations: [4, 7, 5, 12, 8, 10, 6][index % 7],
      targetSignals: [1, 2, 1, 2, 2, 2, 1][index % 7],
    })),
  }
}

export function getE2ECoinCodePage(params: {
  limit?: number
  search?: string
  targetType?: string
  status?: string
  cursor?: { id: string }
}): AdminCoinCodePage | null {
  if (!isE2EModeEnabled()) return null
  const search = params.search?.toLocaleUpperCase('tr-TR') || ''
  const filtered = codes.filter((item) => {
    if (search && !item.code.includes(search)) return false
    if (params.targetType && params.targetType !== 'all' && item.targetType !== params.targetType) return false
    if (params.status === 'active' && (!item.isActive || item.isExpired)) return false
    if (params.status === 'passive' && item.isActive) return false
    if (params.status === 'expired' && !item.isExpired) return false
    if (params.status === 'used' && item.usedCount === 0) return false
    return true
  })
  // Cursor pagination: continues right after the record at the cursor.
  const start = params.cursor ? filtered.findIndex((item) => item.id === params.cursor?.id) + 1 : 0
  const limit = params.limit || 10
  const items = filtered.slice(start, start + limit)
  const last = items[items.length - 1]
  const hasNext = start + limit < filtered.length
  return { generatedAt: new Date(now).toISOString(), items, total: filtered.length, hasNext, nextCursor: hasNext && last ? { createdAt: last.createdAt, id: last.id } : null }
}

export function getE2ECoinActivationPage(params: {
  limit?: number
  search?: string
  targetType?: string
  cursor?: { key: string }
}): AdminCoinActivationPage | null {
  if (!isE2EModeEnabled()) return null
  const search = params.search?.toLocaleUpperCase('tr-TR') || ''
  const filtered = events.filter((item) => {
    if (params.targetType && params.targetType !== 'all' && item.targetType !== params.targetType) return false
    return !search || `${item.code} ${item.username} ${item.fansubName || ''}`.toLocaleUpperCase('tr-TR').includes(search)
  })
  const start = params.cursor ? filtered.findIndex((item) => item.id === params.cursor?.key) + 1 : 0
  const limit = params.limit || 10
  const items = filtered.slice(start, start + limit)
  const last = items[items.length - 1]
  const hasNext = start + limit < filtered.length
  return { generatedAt: new Date(now).toISOString(), items, total: filtered.length, hasNext, nextCursor: hasNext && last ? { redeemedAt: last.redeemedAt, key: last.id } : null }
}
