import { supabase } from '../supabase'

export async function tryWriteAdminAuditLog(input: {
  action: string
  resourceType: string
  resourceId?: string
  summary?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const { error } = await supabase.rpc('create_admin_audit_log', {
      p_action: input.action,
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId || null,
      p_summary: input.summary || '',
      p_metadata: input.metadata || {},
    })

    if (error) {
      console.warn('[adminService] tryWriteAdminAuditLog warning', error)
    }
  } catch (error) {
    console.warn('[adminService] tryWriteAdminAuditLog unexpected warning', error)
  }
}
