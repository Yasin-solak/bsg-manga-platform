import { tryWriteAdminAuditLog } from './shared'

export async function auditMangaMutation(input: {
  action: string
  resourceType: string
  resourceId: string
  summary: string
  metadata?: Record<string, unknown>
}) {
  await tryWriteAdminAuditLog(input)
}
