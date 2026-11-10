import { z } from 'zod'
import { supabase } from './supabase'
import { apiError } from './communityV2Service'

const config = z.object({ rooms_per_owner: z.number().int().min(1).max(100), members_per_server: z.number().int().min(10).max(100000), storage_bytes_per_server: z.number().int().min(10485760).max(1099511627776), joins_per_minute: z.number().int().min(1).max(1000), audit_days: z.number(), report_days: z.number(), expired_invite_days: z.number(), version: z.number().int().positive() })
const status = z.object({ enabled: z.boolean().default(false), config, jobs: z.array(z.object({ job: z.string(), last_success_at: z.string().nullable(), last_failure_at: z.string().nullable(), error_code: z.string().nullable(), processed: z.number(), duration_ms: z.number().nullable() })), queued: z.number(), oldest_queued_at: z.string().nullable(), pending_reports: z.number(), servers: z.number() })
export type CommunityOperations = z.infer<typeof status>
export async function communityOperations(value?: CommunityOperations['config']) {
  const { data, error } = await supabase.rpc('community_v2_operations', { p_action: value ? 'save' : 'status', p_payload: value ? config.parse(value) : {} }).abortSignal(AbortSignal.timeout(15000))
  if (error) throw apiError(error)
  return status.parse(data)
}
