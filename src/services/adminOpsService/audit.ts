import { supabase } from '../supabase'
import { ensureOpsMigrationError, mapDbAuditLogRow, sanitizeSearchTerm } from './shared'
import type { AdminAuditLogItem, AdminAuditLogParams, DbAuditLogRow } from './types'

export async function listAdminAuditLogs(params: AdminAuditLogParams = {}): Promise<AdminAuditLogItem[]> {
  const limit = Math.min(Math.max(Number(params.limit || 120), 1), 400)
  const search = sanitizeSearchTerm(params.search)
  const action = (params.action || '').trim()
  const resourceType = (params.resourceType || '').trim()

  let query = supabase
    .from('audit_logs')
    .select(`
      id,
      actor_user_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      summary,
      metadata,
      created_at,
      actor:actor_user_id (
        id,
        username,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) {
    query = query.eq('action', action)
  }

  if (resourceType) {
    query = query.eq('resource_type', resourceType)
  }

  if (search) {
    query = query.or(`action.ilike.%${search}%,resource_type.ilike.%${search}%,summary.ilike.%${search}%,resource_id.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[adminOpsService] listAdminAuditLogs error', error)
    ensureOpsMigrationError(error)
  }

  return ((data || []) as DbAuditLogRow[]).map(mapDbAuditLogRow)
}

export async function createAdminAuditLog(input: {
  action: string
  resourceType: string
  resourceId?: string
  summary?: string
  metadata?: Record<string, unknown>
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_admin_audit_log', {
    p_action: input.action.trim(),
    p_resource_type: input.resourceType.trim(),
    p_resource_id: input.resourceId?.trim() || null,
    p_summary: input.summary?.trim() || '',
    p_metadata: input.metadata || {},
  })

  if (error) {
    console.error('[adminOpsService] createAdminAuditLog error', error)
    ensureOpsMigrationError(error)
  }

  return String(data || '')
}
