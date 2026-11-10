import type {
  AdminAuditActor,
  AdminAuditLogItem,
  AdminFeatureFlagItem,
  DbAuditLogRow,
  DbFeatureFlagRow,
  DbSetFeatureFlagRow,
  DbUserMini,
} from './types'

function getSingleRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function sanitizeSearchTerm(input: string | undefined) {
  return (input || '')
    .trim()
    .replace(/[\\%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

export function ensureOpsMigrationError(error: any): never {
  if (error?.code === '42883' || String(error?.message || '').includes('does not exist')) {
    throw new Error('Bu ozellik icin 20260214235913_audit_logs_and_feature_flags.sql migration dosyasini calistirin.')
  }
  if (error?.code === '42702' && String(error?.message || '').toLowerCase().includes('key')) {
    throw new Error('Feature flag RPC surumu eski. 20260214235915_set_feature_flag_key_ambiguity_fix.sql migration dosyasini calistirin.')
  }
  throw error
}

function mapDbUserMini(value: DbUserMini | DbUserMini[] | null | undefined): AdminAuditActor | undefined {
  const row = getSingleRelation(value)
  if (!row) return undefined

  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url || undefined,
  }
}

export function mapDbAuditLogRow(row: DbAuditLogRow): AdminAuditLogItem {
  return {
    id: row.id,
    actorUserId: row.actor_user_id || undefined,
    actorRole: row.actor_role || 'system',
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    summary: row.summary || '',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    actor: mapDbUserMini(row.actor),
  }
}

export function mapDbFeatureFlagRow(row: DbFeatureFlagRow | DbSetFeatureFlagRow): AdminFeatureFlagItem {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description || '',
    isEnabled: row.is_enabled === true,
    rolloutPercent: Number.isFinite(row.rollout_percent) ? Number(row.rollout_percent) : 0,
    isPublic: row.is_public === true,
    metadata: row.metadata || {},
    updatedByUserId: row.updated_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedByUser: 'updated_by_user' in row
      ? mapDbUserMini(row.updated_by_user as DbUserMini | DbUserMini[] | null | undefined)
      : undefined,
  }
}

export function normalizeFeatureFlagKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._:-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
