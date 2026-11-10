export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityOverview {
  windowHours: number
  totalEvents: number
  highEvents: number
  criticalEvents: number
  pendingReports: number
  bannedUsers: number
  codeRedemptions: number
  suspiciousRedeemers: number
}

export interface SecurityEventItem {
  id: string
  eventType: string
  source: string
  severity: SecuritySeverity
  message: string
  metadata: Record<string, unknown>
  actorUserId?: string
  actorUsername?: string
  actorAvatarUrl?: string
  targetUserId?: string
  targetUsername?: string
  targetAvatarUrl?: string
  createdAt: string
}

export interface SecurityEventFilterParams {
  limit?: number
  severity?: SecuritySeverity | 'all'
  source?: string
  search?: string
}

export type SecurityAlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface SecurityAlertRuleItem {
  id: string
  eventType: string
  source?: string
  scopeType: 'global' | 'target_user' | 'actor_user'
  windowMinutes: number
  thresholdCount: number
  dedupeMinutes: number
  severity: SecuritySeverity
  isActive: boolean
  activeMuteUntil?: string
  updatedAt: string
}

export interface SecurityAlertItem {
  id: string
  ruleId: string
  eventType: string
  source?: string
  scopeType: 'global' | 'target_user' | 'actor_user'
  scopeKey: string
  scopeUserId?: string
  severity: SecuritySeverity
  status: SecurityAlertStatus
  title: string
  message: string
  metadata: Record<string, unknown>
  hitCount: number
  firstHitAt: string
  lastHitAt: string
  lastNotifiedAt?: string
  acknowledgedAt?: string
  acknowledgedBy?: string
  acknowledgedByUsername?: string
  resolvedAt?: string
  resolvedBy?: string
  resolvedByUsername?: string
  mutedUntil?: string
  createdAt: string
  updatedAt: string
}

export interface SecurityAlertMuteItem {
  id: string
  eventType: string
  source?: string
  mutedUntil: string
  reason?: string
  mutedBy?: string
  mutedByUsername?: string
  remainingSeconds: number
}

export interface SecurityAlertFilterParams {
  status?: SecurityAlertStatus | 'all'
  limit?: number
  search?: string
}

export interface UpdateSecurityAlertRuleInput {
  id: string
  windowMinutes?: number
  thresholdCount?: number
  dedupeMinutes?: number
  severity?: SecuritySeverity
  isActive?: boolean
}

export interface SecurityRedeemAnomalyItem {
  userId: string
  username: string
  avatarUrl?: string
  totalRedemptions: number
  userWalletRedemptions: number
  fansubWalletRedemptions: number
  lastRedeemedAt?: string
  isBanned: boolean
}

export interface CreateSecurityEventInput {
  source: string
  eventType: string
  severity: SecuritySeverity
  message: string
  targetUserId?: string
  metadata?: Record<string, unknown>
}
