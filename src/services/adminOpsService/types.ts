export interface AdminAuditActor {
  id: string
  username: string
  avatarUrl?: string
}

export interface AdminAuditLogItem {
  id: string
  actorUserId?: string
  actorRole: string
  action: string
  resourceType: string
  resourceId?: string
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
  actor?: AdminAuditActor
}

export interface AdminAuditLogParams {
  limit?: number
  search?: string
  action?: string
  resourceType?: string
}

export interface AdminFeatureFlagItem {
  id: string
  key: string
  label: string
  description: string
  isEnabled: boolean
  rolloutPercent: number
  isPublic: boolean
  metadata: Record<string, unknown>
  updatedByUserId?: string
  createdAt: string
  updatedAt: string
  updatedByUser?: AdminAuditActor
}

export interface SetAdminFeatureFlagInput {
  key: string
  label: string
  description?: string
  isEnabled?: boolean
  rolloutPercent?: number
  isPublic?: boolean
  metadata?: Record<string, unknown>
}

export type DbUserMini = {
  id: string
  username: string
  avatar_url: string | null
}

export type DbAuditLogRow = {
  id: string
  actor_user_id: string | null
  actor_role: string | null
  action: string
  resource_type: string
  resource_id: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor?: DbUserMini | DbUserMini[] | null
}

export type DbFeatureFlagRow = {
  id: string
  key: string
  label: string
  description: string | null
  is_enabled: boolean | null
  rollout_percent: number | null
  is_public: boolean | null
  metadata: Record<string, unknown> | null
  updated_by: string | null
  created_at: string
  updated_at: string
  updated_by_user?: DbUserMini | DbUserMini[] | null
}

export type DbSetFeatureFlagRow = {
  id: string
  key: string
  label: string
  description: string | null
  is_enabled: boolean | null
  rollout_percent: number | null
  is_public: boolean | null
  metadata: Record<string, unknown> | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
