import { z } from 'zod'
import { supabase } from './supabase'
import { apiError, messageSchema } from './communityV2Service'

const uuid = z.string().uuid()
import { communityProfileSchema } from './communityProfileSchema'
export type { CommunityProfile } from './communityProfileSchema'
const preferences = z.object({ auto_join: z.boolean(), notifications: z.enum(['all', 'mentions', 'off']), push_enabled: z.boolean(), show_presence: z.boolean(), show_typing: z.boolean() })
export type CommunityPreferences = z.infer<typeof preferences>
const scopeSchema = z.object({ mode: z.enum(['inherit', 'all', 'mentions', 'off']), muted_until: z.string().nullable() })
export type CommunityScope = z.infer<typeof scopeSchema>
const presenceSchema = z.object({ user_id: uuid, username: z.string(), name: z.string(), typing: z.boolean(), typing_seconds: z.number().nonnegative(), presence_seconds: z.number().nonnegative() })
export type CommunityPresence = z.infer<typeof presenceSchema>
export const rolePreviewSchema = z.object({ permissions: z.array(z.string()), channels: z.array(z.object({ id: uuid, name: z.string(), can_read: z.boolean(), can_send: z.boolean() })) })
export type CommunityRolePreview = z.infer<typeof rolePreviewSchema>
const requestSchema = z.object({ user_id: uuid, username: z.string(), display_name: z.string().nullable(), avatar_url: z.string().nullable(), created_at: z.string() })
export type CommunityJoinRequest = z.infer<typeof requestSchema>
const resultSchema = z.object({ ok: z.boolean().optional(), id: uuid.optional(), pending: z.boolean().optional() })

async function rpc<S extends z.ZodTypeAny>(endpoint: string, action: string, payload: object, schema: S, signal?: AbortSignal): Promise<z.output<S>> {
  const { data, error } = await supabase.rpc(endpoint, { p_action: action, p_payload: payload }).abortSignal(signal || AbortSignal.timeout(15000))
  if (error) throw apiError(error)
  return schema.parse(data)
}
export const communityPersonal = {
  preferences: () => rpc('community_v2_personal', 'preferences', {}, preferences),
  savePreferences: (value: CommunityPreferences) => rpc('community_v2_personal', 'save_preferences', preferences.parse(value), preferences),
  scope: (serverId: string, channelId?: string) => rpc('community_v2_personal', 'scope', { server_id: uuid.parse(serverId), channel_id: channelId && uuid.parse(channelId) }, scopeSchema),
  saveScope: (serverId: string, channelId: string | undefined, value: CommunityScope) => rpc('community_v2_personal', 'save_scope', { server_id: uuid.parse(serverId), channel_id: channelId && uuid.parse(channelId), ...scopeSchema.parse(value) }, scopeSchema),
  presence: (channelId: string, action: 'presence' | 'heartbeat' | 'offline', typing = false) => rpc('community_v2_personal', action, { channel_id: uuid.parse(channelId), typing }, z.array(presenceSchema)),
  search: (channelId: string, filters: { search: string; author_id?: string; from?: string; to?: string; has_files: boolean; before?: string }, signal?: AbortSignal) => rpc('community_v2_personal', 'search', { channel_id: uuid.parse(channelId), ...z.object({ search: z.string().max(100), author_id: uuid.optional(), from: z.string().optional(), to: z.string().optional(), has_files: z.boolean(), before: z.string().regex(/^\d+$/).optional() }).parse(filters) }, z.array(messageSchema), signal),
  rolePreview: (serverId: string, roleIds: string[]) => rpc('community_v2_personal', 'role_preview', { server_id: uuid.parse(serverId), role_ids: z.array(uuid).max(50).parse(roleIds) }, rolePreviewSchema),
}
const roomActions = {
  save_join_mode: z.object({ server_id: uuid, version: z.number().int().positive(), join_mode: z.enum(['open', 'invite', 'request']) }),
  create: z.object({ client_id: uuid, name: z.string().trim().min(1).max(80), join_mode: z.enum(['open', 'invite', 'request']) }),
  save_profile: z.object({ server_id: uuid, version: z.number().int().positive(), name: z.string().trim().min(1).max(80), description: z.string().max(500), rules: z.string().max(5000), avatar_url: z.union([z.literal(''), z.string().url().max(2048)]), banner_url: z.union([z.literal(''), z.string().url().max(2048)]), join_mode: z.enum(['open', 'invite', 'request']) }),
  nickname: z.object({ server_id: uuid, user_id: uuid.optional(), nickname: z.string().trim().max(32) }),
  decide_request: z.object({ server_id: uuid, user_id: uuid, approve: z.boolean() }),
  offer_transfer: z.object({ server_id: uuid, version: z.number().int().positive(), user_id: uuid }),
  cancel_transfer: z.object({ server_id: uuid, version: z.number().int().positive() }),
  accept_transfer: z.object({ server_id: uuid }),
  archive: z.object({ server_id: uuid, version: z.number().int().positive(), archived: z.boolean() }),
}
export const communityRooms = {
  info: (serverId: string) => rpc('community_v2_rooms', 'info', { server_id: uuid.parse(serverId) }, communityProfileSchema),
  transfers: () => rpc('community_v2_rooms', 'transfers', {}, z.array(communityProfileSchema)),
  requests: (serverId: string, offset = 0) => rpc('community_v2_rooms', 'requests', { server_id: uuid.parse(serverId), offset }, z.array(requestSchema)),
  write: (action: keyof typeof roomActions, value: object) => rpc('community_v2_rooms', action, roomActions[action].parse(value), resultSchema),
}
