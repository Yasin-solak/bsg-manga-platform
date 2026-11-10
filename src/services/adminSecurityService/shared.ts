import type {
  SecurityAlertItem,
  SecurityAlertMuteItem,
  SecurityAlertRuleItem,
  SecurityAlertStatus,
  SecurityEventItem,
  SecurityOverview,
  SecurityRedeemAnomalyItem,
  SecuritySeverity,
} from './types'

export type DbSecurityOverviewRow = {
  window_hours: number | null
  total_events: number | null
  high_events: number | null
  critical_events: number | null
  pending_reports: number | null
  banned_users: number | null
  code_redemptions: number | null
  suspicious_redeemers: number | null
}

export type DbSecurityEventRow = {
  id: string
  event_type: string
  source: string
  severity: SecuritySeverity
  message: string | null
  metadata: Record<string, unknown> | null
  actor_user_id: string | null
  actor_username: string | null
  actor_avatar_url: string | null
  target_user_id: string | null
  target_username: string | null
  target_avatar_url: string | null
  created_at: string
}

export type DbSecurityRedeemAnomalyRow = {
  user_id: string
  username: string | null
  avatar_url: string | null
  total_redemptions: number | null
  user_wallet_redemptions: number | null
  fansub_wallet_redemptions: number | null
  last_redeemed_at: string | null
  is_banned: boolean | null
}

export type DbSecurityAlertRuleRow = {
  id: string
  event_type: string
  source: string | null
  scope_type: 'global' | 'target_user' | 'actor_user'
  window_minutes: number | null
  threshold_count: number | null
  dedupe_minutes: number | null
  severity: SecuritySeverity
  is_active: boolean | null
  active_mute_until: string | null
  updated_at: string
}

export type DbSecurityAlertRow = {
  id: string
  rule_id: string
  event_type: string
  source: string | null
  scope_type: 'global' | 'target_user' | 'actor_user'
  scope_key: string
  scope_user_id: string | null
  severity: SecuritySeverity
  status: SecurityAlertStatus
  title: string | null
  message: string | null
  metadata: Record<string, unknown> | null
  hit_count: number | null
  first_hit_at: string
  last_hit_at: string
  last_notified_at: string | null
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledged_by_username: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_username: string | null
  muted_until: string | null
  created_at: string
  updated_at: string
}

export type DbSecurityAlertMuteRow = {
  id: string
  event_type: string
  source: string | null
  muted_until: string
  reason: string | null
  muted_by: string | null
  muted_by_username: string | null
  remaining_seconds: number | null
}

export function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

export function sanitizeSearchTerm(input: string | undefined) {
  return (input || '')
    .trim()
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
}

export function toAvatarUrl(seed: string, avatarUrl?: string | null) {
  if (avatarUrl && avatarUrl.trim()) return avatarUrl
  const normalizedSeed = seed.trim() || 'user'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normalizedSeed)}`
}

export function ensureSecurityOpsMigrationError(error: any) {
  const message = String(error?.message || '').toLowerCase()
  if ((error?.code === '42P01' && message.includes('security_alert')) || message.includes('security_alert_')) {
    throw new Error('Bu ozellik icin 20260215235906_security_ops_phase4_alerts_and_mute.sql migration dosyasini calistirin.')
  }
  if (error?.code === '42P01' || message.includes('security_events')) {
    throw new Error('Bu ozellik icin 20260215235902_security_operations_foundation.sql migration dosyasini calistirin.')
  }
  if (error?.code === '42883' && message.includes('get_security_overview')) {
    throw new Error('Guvenlik operasyon RPC fonksiyonlari eksik. 20260215235902_security_operations_foundation.sql migration dosyasini calistirin.')
  }
  if (error?.code === '42883' && message.includes('security_alert')) {
    throw new Error('Alarm ve mute RPC fonksiyonlari eksik. 20260215235906_security_ops_phase4_alerts_and_mute.sql migration dosyasini calistirin.')
  }
  throw error
}

export function mapSecurityOverviewRow(row: DbSecurityOverviewRow): SecurityOverview {
  return {
    windowHours: toFiniteNumber(row.window_hours, 24),
    totalEvents: toFiniteNumber(row.total_events),
    highEvents: toFiniteNumber(row.high_events),
    criticalEvents: toFiniteNumber(row.critical_events),
    pendingReports: toFiniteNumber(row.pending_reports),
    bannedUsers: toFiniteNumber(row.banned_users),
    codeRedemptions: toFiniteNumber(row.code_redemptions),
    suspiciousRedeemers: toFiniteNumber(row.suspicious_redeemers),
  }
}

export function mapSecurityEventRow(row: DbSecurityEventRow): SecurityEventItem {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source,
    severity: row.severity,
    message: row.message || '',
    metadata: row.metadata || {},
    actorUserId: row.actor_user_id || undefined,
    actorUsername: row.actor_username || undefined,
    actorAvatarUrl: row.actor_username ? toAvatarUrl(row.actor_username, row.actor_avatar_url) : undefined,
    targetUserId: row.target_user_id || undefined,
    targetUsername: row.target_username || undefined,
    targetAvatarUrl: row.target_username ? toAvatarUrl(row.target_username, row.target_avatar_url) : undefined,
    createdAt: row.created_at,
  }
}

export function mapSecurityRedeemAnomalyRow(row: DbSecurityRedeemAnomalyRow): SecurityRedeemAnomalyItem {
  const username = (row.username || '').trim() || 'kullanici'
  return {
    userId: row.user_id,
    username,
    avatarUrl: toAvatarUrl(username, row.avatar_url),
    totalRedemptions: toFiniteNumber(row.total_redemptions),
    userWalletRedemptions: toFiniteNumber(row.user_wallet_redemptions),
    fansubWalletRedemptions: toFiniteNumber(row.fansub_wallet_redemptions),
    lastRedeemedAt: row.last_redeemed_at || undefined,
    isBanned: row.is_banned === true,
  }
}

export function mapSecurityAlertRuleRow(row: DbSecurityAlertRuleRow): SecurityAlertRuleItem {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source || undefined,
    scopeType: row.scope_type,
    windowMinutes: toFiniteNumber(row.window_minutes, 10),
    thresholdCount: toFiniteNumber(row.threshold_count, 1),
    dedupeMinutes: toFiniteNumber(row.dedupe_minutes, 30),
    severity: row.severity,
    isActive: row.is_active !== false,
    activeMuteUntil: row.active_mute_until || undefined,
    updatedAt: row.updated_at,
  }
}

export function mapSecurityAlertRow(row: DbSecurityAlertRow): SecurityAlertItem {
  return {
    id: row.id,
    ruleId: row.rule_id,
    eventType: row.event_type,
    source: row.source || undefined,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    scopeUserId: row.scope_user_id || undefined,
    severity: row.severity,
    status: row.status,
    title: row.title || '',
    message: row.message || '',
    metadata: row.metadata || {},
    hitCount: toFiniteNumber(row.hit_count, 1),
    firstHitAt: row.first_hit_at,
    lastHitAt: row.last_hit_at,
    lastNotifiedAt: row.last_notified_at || undefined,
    acknowledgedAt: row.acknowledged_at || undefined,
    acknowledgedBy: row.acknowledged_by || undefined,
    acknowledgedByUsername: row.acknowledged_by_username || undefined,
    resolvedAt: row.resolved_at || undefined,
    resolvedBy: row.resolved_by || undefined,
    resolvedByUsername: row.resolved_by_username || undefined,
    mutedUntil: row.muted_until || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSecurityAlertMuteRow(row: DbSecurityAlertMuteRow): SecurityAlertMuteItem {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source || undefined,
    mutedUntil: row.muted_until,
    reason: row.reason || undefined,
    mutedBy: row.muted_by || undefined,
    mutedByUsername: row.muted_by_username || undefined,
    remainingSeconds: toFiniteNumber(row.remaining_seconds),
  }
}
