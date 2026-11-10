import { z } from 'zod'
import { supabase } from '../supabase'
import {
  getE2ECoinActivationPage,
  getE2ECoinCodePage,
  getE2ECoinOverview,
} from '@/testing/adminCoinCodesE2e'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import type {
  AdminCoinActivationCursor,
  AdminCoinActivationPage,
  AdminCoinCodeCursor,
  AdminCoinCodeOverview,
  AdminCoinCodePage,
  AdminRedeemCodeItem,
  CreateRedeemCodesInput,
} from './types'

const uuid = z.string().uuid()
const iso = z.string().datetime({ offset: true })
const nullableText = z.string().nullable()
const codeSchema = z.object({
  id: uuid,
  code: z.string().min(1),
  value: z.number().int().positive(),
  maxUses: z.number().int().positive(),
  usedCount: z.number().int().nonnegative(),
  targetType: z.enum(['user', 'fansub', 'both']),
  expiresAt: iso,
  isActive: z.boolean(),
  createdAt: iso,
  seriesLabel: nullableText.optional(),
  distributionChannel: nullableText.optional(),
  notes: nullableText.optional(),
  createdBy: uuid.nullable().optional(),
}).strict()
const codeCursorSchema = z.object({ createdAt: iso, id: uuid }).strict()
const activationCursorSchema = z.object({ redeemedAt: iso, key: z.string().min(1) }).strict()
const activationSchema = z.object({
  id: z.string().min(1),
  codeId: uuid,
  code: z.string().min(1),
  targetType: z.enum(['user', 'fansub']),
  creditedValue: z.number().int().nonnegative(),
  redeemedAt: iso,
  userId: uuid.nullable(),
  username: z.string().min(1),
  userAvatarUrl: nullableText,
  fansubId: uuid.nullable(),
  fansubName: nullableText,
}).strict()
const overviewSchema = z.object({
  generatedAt: iso,
  periodDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  totalCodes: z.number().int().nonnegative(),
  activeCodes: z.number().int().nonnegative(),
  passiveCodes: z.number().int().nonnegative(),
  expiredCodes: z.number().int().nonnegative(),
  usedCodes: z.number().int().nonnegative(),
  totalActivations: z.number().int().nonnegative(),
  distributedCoin: z.number().nonnegative(),
  activeExposureCoin: z.number().nonnegative(),
  potentialDistributionCoin: z.number().nonnegative(),
  highRiskCodes: z.number().int().nonnegative(),
  expiringSevenDays: z.number().int().nonnegative(),
  userActivations: z.number().int().nonnegative(),
  fansubActivations: z.number().int().nonnegative(),
  daily: z.array(z.object({
    day: z.string(),
    activations: z.number().int().nonnegative(),
    targetSignals: z.number().int().nonnegative(),
  }).strict()),
}).strict()
const codePageSchema = z.object({
  generatedAt: iso,
  items: z.array(codeSchema),
  total: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  nextCursor: codeCursorSchema.nullable(),
}).strict()
const activationPageSchema = z.object({
  generatedAt: iso,
  items: z.array(activationSchema),
  total: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  nextCursor: activationCursorSchema.nullable(),
}).strict()

function unwrap(data: unknown) {
  return Array.isArray(data) && data.length === 1 ? data[0] : data
}

function withDerivedCodeFields(item: z.infer<typeof codeSchema>): AdminRedeemCodeItem {
  return {
    ...item,
    remainingUses: Math.max(item.maxUses - item.usedCount, 0),
    isExpired: new Date(item.expiresAt).getTime() <= Date.now(),
  }
}

export async function getAdminCoinCodeOverview(periodDays: 7 | 30 | 90): Promise<AdminCoinCodeOverview> {
  const fixture = getE2ECoinOverview(periodDays)
  if (fixture) return fixture
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_coin_code_overview', { p_period_days: periodDays }),
      signal,
    ),
    { label: 'redeemCodeService.getAdminCoinCodeOverview' },
  )
  if (error) throw error
  return overviewSchema.parse(unwrap(data))
}

export async function listAdminCoinCodesPage(params: {
  limit?: number
  search?: string
  targetType?: 'all' | 'user' | 'fansub' | 'both'
  status?: 'all' | 'active' | 'passive' | 'expired' | 'used'
  seriesLabel?: string
  cursor?: AdminCoinCodeCursor
}): Promise<AdminCoinCodePage> {
  const fixture = getE2ECoinCodePage(params)
  if (fixture) return fixture
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_admin_coin_codes_page', {
        p_limit: Math.min(Math.max(params.limit || 25, 1), 100),
        p_search: params.search?.trim() || null,
        p_target_type: params.targetType || 'all',
        p_status: params.status || 'all',
        p_series_label: params.seriesLabel?.trim() || null,
        p_cursor_created_at: params.cursor?.createdAt || null,
        p_cursor_id: params.cursor?.id || null,
      }),
      signal,
    ),
    { label: 'redeemCodeService.listAdminCoinCodesPage' },
  )
  if (error) throw error
  const parsed = codePageSchema.parse(unwrap(data))
  return { ...parsed, items: parsed.items.map(withDerivedCodeFields) }
}

export async function listAdminCoinActivationsPage(params: {
  limit?: number
  search?: string
  targetType?: 'all' | 'user' | 'fansub'
  cursor?: AdminCoinActivationCursor
}): Promise<AdminCoinActivationPage> {
  const fixture = getE2ECoinActivationPage(params)
  if (fixture) return fixture
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_admin_coin_code_activations_page', {
        p_limit: Math.min(Math.max(params.limit || 25, 1), 100),
        p_search: params.search?.trim() || null,
        p_target_type: params.targetType || 'all',
        p_cursor_redeemed_at: params.cursor?.redeemedAt || null,
        p_cursor_key: params.cursor?.key || null,
      }),
      signal,
    ),
    { label: 'redeemCodeService.listAdminCoinActivationsPage' },
  )
  if (error) throw error
  return activationPageSchema.parse(unwrap(data))
}

export async function createAdminCoinCodeBatch(input: CreateRedeemCodesInput): Promise<AdminRedeemCodeItem[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('create_admin_coin_code_batch', {
        p_value: input.value,
        p_count: input.count,
        p_max_uses: input.maxUses,
        p_target_type: input.targetType,
        p_expires_at: new Date(input.expiresAt).toISOString(),
        p_prefix: input.prefix || 'BSG',
        p_series_label: input.seriesLabel?.trim() || null,
        p_distribution_channel: input.distributionChannel?.trim() || null,
        p_notes: input.notes?.trim() || null,
      }),
      signal,
    ),
    { label: 'redeemCodeService.createAdminCoinCodeBatch' },
  )
  if (error) throw error
  return z.array(codeSchema).parse(unwrap(data)).map(withDerivedCodeFields)
}

export async function bulkSetAdminCoinCodesActive(input: {
  codeIds: string[]
  isActive: boolean
  reason: string
}): Promise<{ updatedCount: number; isActive: boolean }> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('bulk_set_admin_coin_codes_active', {
        p_code_ids: z.array(uuid).min(1).max(200).parse(input.codeIds),
        p_is_active: input.isActive,
        p_reason: z.string().trim().min(5).max(300).parse(input.reason),
      }),
      signal,
    ),
    { label: 'redeemCodeService.bulkSetAdminCoinCodesActive' },
  )
  if (error) throw error
  return z.object({
    updatedCount: z.number().int().nonnegative(),
    isActive: z.boolean(),
  }).strict().parse(unwrap(data))
}
