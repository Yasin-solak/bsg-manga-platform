import { z } from 'zod'
import { supabase } from './supabase'
import { apiError, messageSchema } from './communityV2Service'
import { txa } from '@/i18n/activeLocale'

export const REPORT_REASONS = { get spam() { return txa('Spam / reklam') }, get harassment() { return txa('Taciz / hakaret') }, get unsafe() { return txa('Zararlı veya uygunsuz içerik') }, get spoiler() { return txa('İşaretlenmemiş spoiler') }, get other() { return txa('Diğer') } } as const
export const REPORT_STATES = { get open() { return txa('Bekleyen') }, get resolved() { return txa('Sonuçlandırılan') }, get dismissed() { return txa('Gerekçesiz bulunan') } } as const
export type ReportState = keyof typeof REPORT_STATES
const uuid = z.string().uuid()
const reportSchema = z.object({ id: uuid, cursor: z.string().regex(/^\d+$/), channel_id: uuid, channel_name: z.string(),
  reason: z.enum(['spam','harassment','unsafe','spoiler','other']), note: z.string(), status: z.enum(['open','resolved','dismissed']),
  version: z.number().int(), created_at: z.string(), reviewed_at: z.string().nullable(), resolution_note: z.string(), reviewer_username: z.string().nullable(),
  reporter: z.object({ user_id: uuid, username: z.string(), display_name: z.string().nullable(), avatar_url: z.string().nullable() }), message: messageSchema,
})
export type CommunityReport = z.infer<typeof reportSchema>
const schemas = {
  report: z.object({ channel_id: uuid, message_id: uuid, reason: z.enum(['spam','harassment','unsafe','spoiler','other']), note: z.string().trim().max(1000) }).refine(v => v.reason !== 'other' || v.note.length >= 10, 'Diğer için en az 10 karakter açıklama yaz.'),
  list: z.object({ server_id: uuid, status: z.enum(['open','resolved','dismissed']), before: z.string().regex(/^\d+$/).optional() }),
  decide: z.object({ server_id: uuid, report_id: uuid, version: z.number().int().positive(), status: z.enum(['resolved','dismissed']), note: z.string().trim().max(1000) }),
}
async function call(action: keyof typeof schemas, payload: Record<string, unknown>, signal?: AbortSignal) {
  const {data,error} = await supabase.rpc('community_v2_moderation', { p_action: action, p_payload: schemas[action].parse(payload) }).abortSignal(signal || AbortSignal.timeout(15000))
  if(error) throw apiError(error)
  return data
}
export const communityModeration = {
  report: async (channelId: string, messageId: string, reason: keyof typeof REPORT_REASONS, note: string) => z.object({ok:z.boolean(),duplicate:z.boolean()}).parse(await call('report',{channel_id:channelId,message_id:messageId,reason,note})),
  list: async (serverId: string, status: ReportState, before?: string, signal?: AbortSignal) => z.array(reportSchema).parse(await call('list',{server_id:serverId,status,before},signal)),
  decide: async (serverId: string, report: CommunityReport, status: 'resolved'|'dismissed', note: string) => { await call('decide',{server_id:serverId,report_id:report.id,version:report.version,status,note}) },
}
