import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { listAdminFansubsPage } from './fansubs.list'
import type {
  AdminFansubAuditEvent,
  AdminFansubListParams,
  AdminFansubManagementOverview,
  AdminFansubManagerMini,
  AdminFansubTrustBand,
  AdminFansubTrustConfidence,
  AdminFansubTrustSummary,
  AdminManagedFansub,
  AdminPagedResult,
} from './types'

type JsonRecord = Record<string, unknown>

const rpcFansubRowSchema = z.object({
  id: z.string().min(1),
}).catchall(z.unknown())

const managementPagePayloadSchema = z.object({
  data: z.array(rpcFansubRowSchema),
  count: z.coerce.number().int().nonnegative(),
  page: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(50),
}).strict()

const managementOverviewPayloadSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  active: z.coerce.number().int().nonnegative(),
  moderated: z.coerce.number().int().nonnegative(),
  verified: z.union([z.coerce.number().int().nonnegative(), z.null()]),
  pendingReview: z.coerce.number().int().nonnegative(),
  newFansubs: z.coerce.number().int().nonnegative(),
  verificationAvailable: z.boolean(),
  trustAvailable: z.boolean(),
}).strict()

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function safeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeOptionalString(value: unknown) {
  const text = safeString(value).trim()
  return text || undefined
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42883'
    || error?.code === 'PGRST202'
    || (message.includes('function') && (message.includes('does not exist') || message.includes('could not find')))
}

function mapManager(value: unknown): AdminFansubManagerMini | undefined {
  const row = asRecord(value)
  const id = safeString(row.id)
  const username = safeString(row.username)
  if (!id || !username) return undefined
  return {
    id,
    username,
    avatarUrl: safeOptionalString(row.avatarUrl ?? row.avatar_url),
  }
}

function mapTrust(value: unknown): AdminFansubTrustSummary | null {
  const row = asRecord(value)
  if (Object.keys(row).length === 0) return null
  const rawBand = safeString(row.band)
  const band: AdminFansubTrustBand = ['trusted', 'standard', 'review', 'high-risk'].includes(rawBand)
    ? rawBand as AdminFansubTrustBand
    : 'unknown'
  const rawConfidence = safeString(row.confidence)
  const confidence: AdminFansubTrustConfidence = ['high', 'medium', 'low'].includes(rawConfidence)
    ? rawConfidence as AdminFansubTrustConfidence
    : 'unknown'
  const components = Array.isArray(row.components)
    ? row.components.map((component) => {
      const item = asRecord(component)
      return {
        key: safeString(item.key),
        label: safeString(item.label),
        description: safeString(item.description),
        points: safeNumber(item.points),
      }
    }).filter((component) => component.key && component.label)
    : []

  return {
    score: safeNullableNumber(row.score),
    band,
    confidence,
    algorithmVersion: safeString(row.algorithmVersion ?? row.algorithm_version) || 'fansub-trust-v1',
    components,
  }
}

function mapManagedFansub(value: unknown): AdminManagedFansub | null {
  const row = asRecord(value)
  const id = safeString(row.id)
  if (!id) return null
  return {
    id,
    name: safeString(row.name) || 'İsimsiz fansub',
    slug: safeString(row.slug),
    avatarUrl: safeString(row.avatarUrl ?? row.avatar_url) || '/images/default-avatar.png',
    description: safeString(row.description),
    isActive: row.isActive === true || row.is_active === true,
    mangaCount: safeNumber(row.mangaCount ?? row.manga_count),
    followerCount: safeNumber(row.followerCount ?? row.follower_count),
    coinBalance: safeNumber(row.coinBalance ?? row.coin_balance),
    createdAt: safeString(row.createdAt ?? row.created_at),
    updatedAt: safeString(row.updatedAt ?? row.updated_at),
    memberCount: safeNumber(row.memberCount ?? row.member_count),
    moderatorCount: safeNumber(row.moderatorCount ?? row.moderator_count),
    manager: mapManager(row.manager),
    lastActivityAt: safeOptionalString(row.lastActivityAt ?? row.last_activity_at),
    pendingReviewCount: safeNumber(row.pendingReviewCount ?? row.pending_review_count),
    isVerified: typeof (row.isVerified ?? row.is_verified) === 'boolean'
      ? Boolean(row.isVerified ?? row.is_verified)
      : null,
    verifiedAt: safeOptionalString(row.verifiedAt ?? row.verified_at),
    trust: mapTrust(row.trust),
    boostLevel: safeNullableNumber(row.boostLevel ?? row.boost_level),
  }
}

function mapOverview(value: unknown): AdminFansubManagementOverview {
  const row = asRecord(value)
  return {
    total: safeNumber(row.total),
    active: safeNumber(row.active),
    moderated: safeNumber(row.moderated),
    verified: safeNullableNumber(row.verified),
    pendingReview: safeNumber(row.pendingReview ?? row.pending_review),
    newFansubs: safeNumber(row.newFansubs ?? row.new_fansubs),
    verificationAvailable: row.verificationAvailable === true || row.verification_available === true,
    trustAvailable: row.trustAvailable === true || row.trust_available === true,
  }
}

function normalizeRpcPayload(data: unknown) {
  if (Array.isArray(data)) return asRecord(data[0])
  return asRecord(data)
}

export async function getAdminFansubManagementOverview(): Promise<AdminFansubManagementOverview> {
  const result = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_fansub_management_overview'),
      signal,
    ),
    { label: 'adminService.getAdminFansubManagementOverview' },
  )
  if (!result.error) {
    const parsed = managementOverviewPayloadSchema.safeParse(normalizeRpcPayload(result.data))
    if (!parsed.success) throw new Error('Fansub yönetimi özet yanıtı doğrulanamadı.')
    return mapOverview(parsed.data)
  }
  if (!isMissingRpcError(result.error)) throw result.error

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [total, active, recent, members, reviews] = await withServiceTimeout(
    (signal) => Promise.all([
      withAbortSignal(supabase.from('fansubs').select('id', { count: 'exact', head: true }), signal),
      withAbortSignal(supabase.from('fansubs').select('id', { count: 'exact', head: true }).eq('is_active', true), signal),
      withAbortSignal(supabase.from('fansubs').select('id', { count: 'exact', head: true }).gte('created_at', since), signal),
      withAbortSignal(supabase.from('fansub_members').select('fansub_id').in('role', ['admin', 'moderator']).limit(5000), signal),
      withAbortSignal(supabase.from('fansub_reported_content').select('fansub_id').in('status', ['awaiting_fix', 'fix_submitted']).limit(5000), signal),
    ]),
    { label: 'adminService.getAdminFansubManagementOverview.fallback' },
  )

  if (total.error) throw total.error

  return {
    total: total.count || 0,
    active: active.error ? 0 : active.count || 0,
    moderated: members.error ? 0 : new Set((members.data || []).map((row) => row.fansub_id)).size,
    verified: null,
    pendingReview: reviews.error ? 0 : new Set((reviews.data || []).map((row) => row.fansub_id)).size,
    newFansubs: recent.error ? 0 : recent.count || 0,
    verificationAvailable: false,
    trustAvailable: false,
  }
}

export async function listAdminFansubManagementPage(
  params: AdminFansubListParams = {},
): Promise<AdminPagedResult<AdminManagedFansub>> {
  const page = Math.max(1, Math.floor(params.page || 1))
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit || 10)))
  const result = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_admin_fansub_management_page', {
        p_page: page,
        p_limit: limit,
        p_search: params.search?.trim() || null,
        p_view: params.view || 'all',
        p_trust: params.trust || 'all',
      }),
      signal,
    ),
    { label: 'adminService.listAdminFansubManagementPage' },
  )

  if (!result.error) {
    const parsed = managementPagePayloadSchema.safeParse(normalizeRpcPayload(result.data))
    if (!parsed.success) throw new Error('Fansub yönetimi liste yanıtı doğrulanamadı.')
    const payload = parsed.data
    const rows = payload.data
      .map(mapManagedFansub)
      .filter((row): row is AdminManagedFansub => row !== null)
    return {
      data: rows,
      count: safeNumber(payload.count),
      page: safeNumber(payload.page) || page,
      limit: safeNumber(payload.limit) || limit,
    }
  }
  if (!isMissingRpcError(result.error)) throw result.error

  const status = params.view === 'active'
    ? 'active'
    : params.view === 'inactive' ? 'inactive' : params.status || 'all'
  const fallback = await listAdminFansubsPage({ ...params, page, limit, status })
  if (params.view === 'verified') {
    return { ...fallback, data: fallback.data.filter((fansub) => fansub.isVerified === true) }
  }
  return fallback
}

export async function listAdminFansubAuditEvents(
  fansubId: string,
  limit = 20,
): Promise<AdminFansubAuditEvent[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_audit_logs')
        .select(`
          id,
          action,
          resource_type,
          summary,
          created_at,
          actor:actor_user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('fansub_id', fansubId)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(100, limit))),
      signal,
    ),
    { label: 'adminService.listAdminFansubAuditEvents' },
  )

  if (error) throw error
  return (data || []).map((entry) => {
    const row = asRecord(entry)
    const actorValue = Array.isArray(row.actor) ? row.actor[0] : row.actor
    return {
      id: safeString(row.id),
      action: safeString(row.action),
      resourceType: safeString(row.resource_type),
      summary: safeString(row.summary) || safeString(row.action),
      createdAt: safeString(row.created_at),
      actor: mapManager(actorValue),
    }
  })
}
