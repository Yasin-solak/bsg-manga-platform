import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  ensureSecurityOpsMigrationError,
  mapSecurityAlertMuteRow,
  mapSecurityAlertRow,
  mapSecurityAlertRuleRow,
  sanitizeSearchTerm,
  type DbSecurityAlertMuteRow,
  type DbSecurityAlertRow,
  type DbSecurityAlertRuleRow,
} from './shared'
import type {
  SecurityAlertFilterParams,
  SecurityAlertItem,
  SecurityAlertMuteItem,
  SecurityAlertRuleItem,
  SecurityAlertStatus,
  UpdateSecurityAlertRuleInput,
} from './types'

const securityAlertsLogger = createScopedLogger('adminSecurityService.alerts')

async function runSecurityAlertRpc<T>(
  event: string,
  label: string,
  rpcName: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const requestContext = createRequestContext('adminSecurityService.alerts', event, {
    rpcName,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(rpcName, payload), signal),
    { label },
  )

  if (error) {
    securityAlertsLogger.error({
      event,
      message: toUserFacingErrorMessage(error, `${label} sirasinda bir hata olustu.`),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    ensureSecurityOpsMigrationError(error)
  }

  return data as T
}

export async function listAdminSecurityAlertRules(): Promise<SecurityAlertRuleItem[]> {
  const data = await runSecurityAlertRpc<DbSecurityAlertRuleRow[]>(
    'list-security-alert-rules',
    'Guvenlik alarm kurallarini listeleme',
    'list_security_alert_rules',
  )
  return ((data || []) as DbSecurityAlertRuleRow[]).map(mapSecurityAlertRuleRow)
}

export async function updateAdminSecurityAlertRule(input: UpdateSecurityAlertRuleInput): Promise<SecurityAlertRuleItem> {
  if (!input.id) throw new Error('Rule id zorunludur.')
  const payloadSeverity = input.severity || null
  if (payloadSeverity && !['low', 'medium', 'high', 'critical'].includes(payloadSeverity)) {
    throw new Error('Gecersiz severity degeri.')
  }

  const data = await runSecurityAlertRpc<DbSecurityAlertRuleRow[] | DbSecurityAlertRuleRow | null>(
    'update-security-alert-rule',
    'Guvenlik alarm kurali guncelleme',
    'update_security_alert_rule',
    {
    p_rule_id: input.id,
    p_window_minutes: typeof input.windowMinutes === 'number' ? Math.min(24 * 60, Math.max(1, Math.floor(input.windowMinutes))) : null,
    p_threshold_count: typeof input.thresholdCount === 'number' ? Math.min(1000, Math.max(1, Math.floor(input.thresholdCount))) : null,
    p_dedupe_minutes: typeof input.dedupeMinutes === 'number' ? Math.min(24 * 60, Math.max(1, Math.floor(input.dedupeMinutes))) : null,
    p_severity: payloadSeverity,
    p_is_active: typeof input.isActive === 'boolean' ? input.isActive : null,
    },
  )

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Rule guncelleme sonucu bulunamadi.')
  return mapSecurityAlertRuleRow(row as DbSecurityAlertRuleRow)
}

export async function listAdminSecurityAlerts(params: SecurityAlertFilterParams = {}): Promise<SecurityAlertItem[]> {
  const limit = Math.min(Math.max(Math.floor(params.limit || 120), 1), 500)
  const status = params.status || 'all'
  const search = sanitizeSearchTerm(params.search)

  const data = await runSecurityAlertRpc<DbSecurityAlertRow[]>(
    'list-security-alerts',
    'Guvenlik alarmlarini listeleme',
    'list_security_alerts',
    {
    p_status: status,
    p_limit: limit,
    p_search: search || null,
    },
  )

  return ((data || []) as DbSecurityAlertRow[]).map(mapSecurityAlertRow)
}

export async function setAdminSecurityAlertStatus(params: {
  alertId: string
  status: SecurityAlertStatus
  note?: string
}): Promise<SecurityAlertStatus> {
  if (!params.alertId) throw new Error('Alert id zorunludur.')
  if (!['open', 'acknowledged', 'resolved'].includes(params.status)) {
    throw new Error('Gecersiz alert status degeri.')
  }

  const data = await runSecurityAlertRpc<Array<{ status?: string }> | { status?: string } | null>(
    'set-security-alert-status',
    'Guvenlik alarm durumunu guncelleme',
    'set_security_alert_status',
    {
    p_alert_id: params.alertId,
    p_status: params.status,
    p_note: (params.note || '').trim() || null,
    },
  )

  const row = Array.isArray(data) ? data[0] : data
  const status = String((row as { status?: string } | null)?.status || '').toLowerCase()
  if (status === 'open' || status === 'acknowledged' || status === 'resolved') return status
  return params.status
}

export async function listAdminSecurityAlertMutes(): Promise<SecurityAlertMuteItem[]> {
  const data = await runSecurityAlertRpc<DbSecurityAlertMuteRow[]>(
    'list-security-alert-mutes',
    'Guvenlik alarm susturmalari listeleme',
    'list_security_alert_mutes',
  )
  return ((data || []) as DbSecurityAlertMuteRow[]).map(mapSecurityAlertMuteRow)
}

export async function setAdminSecurityAlertMute(params: {
  eventType: string
  source?: string
  durationMinutes: 15 | 60 | 1440
  reason?: string
}): Promise<SecurityAlertMuteItem> {
  const eventType = (params.eventType || '').trim().toLowerCase()
  if (!eventType) throw new Error('Event tipi zorunludur.')
  if (![15, 60, 1440].includes(params.durationMinutes)) {
    throw new Error('Sadece 15, 60 veya 1440 dakika secilebilir.')
  }

  const data = await runSecurityAlertRpc<DbSecurityAlertMuteRow[] | DbSecurityAlertMuteRow | null>(
    'set-security-alert-mute',
    'Guvenlik alarm susturma ayari kaydetme',
    'set_security_alert_mute',
    {
    p_event_type: eventType,
    p_source: (params.source || '').trim().toLowerCase() || null,
    p_duration_minutes: params.durationMinutes,
    p_reason: (params.reason || '').trim() || null,
    },
  )

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Mute sonucu bulunamadi.')
  return mapSecurityAlertMuteRow(row as DbSecurityAlertMuteRow)
}

export async function clearAdminSecurityAlertMute(params: {
  eventType: string
  source?: string
}): Promise<boolean> {
  const eventType = (params.eventType || '').trim().toLowerCase()
  if (!eventType) throw new Error('Event tipi zorunludur.')

  const data = await runSecurityAlertRpc<boolean>(
    'clear-security-alert-mute',
    'Guvenlik alarm susturmasini temizleme',
    'clear_security_alert_mute',
    {
    p_event_type: eventType,
    p_source: (params.source || '').trim().toLowerCase() || null,
    },
  )

  return data === true
}
