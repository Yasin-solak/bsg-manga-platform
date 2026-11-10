import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  ensureSecurityOpsMigrationError,
  mapSecurityEventRow,
  mapSecurityOverviewRow,
  mapSecurityRedeemAnomalyRow,
  sanitizeSearchTerm,
  toFiniteNumber,
  type DbSecurityEventRow,
  type DbSecurityOverviewRow,
  type DbSecurityRedeemAnomalyRow,
} from './shared'
import type {
  CreateSecurityEventInput,
  SecurityEventFilterParams,
  SecurityEventItem,
  SecurityOverview,
  SecurityRedeemAnomalyItem,
} from './types'

const securityEventsLogger = createScopedLogger('adminSecurityService.events')

async function runSecurityEventRpc<T>(
  event: string,
  label: string,
  rpcName: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const requestContext = createRequestContext('adminSecurityService.events', event, { rpcName })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(rpcName, payload), signal),
    { label },
  )

  if (error) {
    securityEventsLogger.error({
      event,
      message: toUserFacingErrorMessage(error, `${label} sirasinda bir hata olustu.`),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    ensureSecurityOpsMigrationError(error)
  }

  return data as T
}

export async function getAdminSecurityOverview(windowHours = 24): Promise<SecurityOverview> {
  const safeWindow = Math.min(Math.max(Math.floor(windowHours || 24), 1), 24 * 14)
  const data = await runSecurityEventRpc<DbSecurityOverviewRow[] | DbSecurityOverviewRow | null>(
    'get-admin-security-overview',
    'Guvenlik ozetini yukleme',
    'get_security_overview',
    { p_window_hours: safeWindow },
  )

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    return {
      windowHours: safeWindow,
      totalEvents: 0,
      highEvents: 0,
      criticalEvents: 0,
      pendingReports: 0,
      bannedUsers: 0,
      codeRedemptions: 0,
      suspiciousRedeemers: 0,
    }
  }

  return mapSecurityOverviewRow(row as DbSecurityOverviewRow)
}

export async function listAdminSecurityEvents(params: SecurityEventFilterParams = {}): Promise<SecurityEventItem[]> {
  const limit = Math.min(Math.max(Number(params.limit || 120), 1), 400)
  const severity = params.severity && params.severity !== 'all' ? params.severity : null
  const source = (params.source || '').trim() || null
  const search = sanitizeSearchTerm(params.search)

  const data = await runSecurityEventRpc<DbSecurityEventRow[]>(
    'list-admin-security-events',
    'Guvenlik olaylarini listeleme',
    'list_security_events',
    {
      p_limit: limit,
      p_severity: severity,
      p_source: source,
      p_search: search || null,
    },
  )

  return ((data || []) as DbSecurityEventRow[]).map(mapSecurityEventRow)
}

export async function listAdminRedeemAnomalyUsers(params: {
  windowHours?: number
  minCount?: number
  limit?: number
} = {}): Promise<SecurityRedeemAnomalyItem[]> {
  const windowHours = Math.min(Math.max(Math.floor(params.windowHours || 24), 1), 24 * 14)
  const minCount = Math.min(Math.max(Math.floor(params.minCount || 3), 2), 50)
  const limit = Math.min(Math.max(Math.floor(params.limit || 20), 1), 100)

  const data = await runSecurityEventRpc<DbSecurityRedeemAnomalyRow[]>(
    'list-admin-redeem-anomaly-users',
    'Kod kullanim anomali kullanicilarini listeleme',
    'list_redeem_anomaly_users',
    {
      p_window_hours: windowHours,
      p_min_count: minCount,
      p_limit: limit,
    },
  )

  return ((data || []) as DbSecurityRedeemAnomalyRow[]).map(mapSecurityRedeemAnomalyRow)
}

export async function createAdminSecurityEvent(input: CreateSecurityEventInput): Promise<string> {
  const source = (input.source || '').trim().toLowerCase()
  const eventType = (input.eventType || '').trim().toLowerCase()
  const message = (input.message || '').trim()
  const severity = input.severity

  if (!source) throw new Error('Kaynak zorunlu.')
  if (!eventType) throw new Error('Event tipi zorunlu.')
  if (!message) throw new Error('Mesaj zorunlu.')
  if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
    throw new Error('Gecersiz severity degeri.')
  }

  const data = await runSecurityEventRpc<string | null>(
    'create-admin-security-event',
    'Guvenlik olayi olusturma',
    'create_security_event',
    {
      p_source: source,
      p_event_type: eventType,
      p_severity: severity,
      p_message: message,
      p_target_user_id: input.targetUserId || null,
      p_metadata: input.metadata || {},
    },
  )

  return String(data || '')
}

export async function cleanupExpiredBans(limit = 500): Promise<number> {
  const safeLimit = Math.min(Math.max(Math.floor(limit || 500), 1), 5_000)
  const data = await runSecurityEventRpc<unknown>(
    'cleanup-expired-bans',
    'Suresi dolan banlari temizleme',
    'release_expired_bans',
    { p_limit: safeLimit },
  )

  return toFiniteNumber(data)
}
