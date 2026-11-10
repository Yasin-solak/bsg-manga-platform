import { z } from 'zod'
import { supabase } from './supabase'
import { apiError } from './communityV2Service'

const uuid = z.string().uuid(), token = z.string().regex(/^[a-f0-9]{64}$/, 'Davet bağlantısı geçersiz.')
const entrySchema = z.object({ status: z.enum(['ready', 'already_member', 'joined', 'unavailable', 'revoked', 'expired', 'exhausted', 'banned']), server_id: uuid.optional(), name: z.string().optional(), avatar_url: z.string().nullable().optional(), expires_at: z.string().nullable().optional() })
const inviteSchema = z.object({ id: uuid, cursor: z.string().regex(/^\d+$/), label: z.string(), uses: z.number().int(), max_uses: z.number().int().nullable(), created_at: z.string(), expires_at: z.string().nullable(), creator_username: z.string().nullable(), status: z.enum(['active', 'suspended', 'revoked', 'expired', 'exhausted']) })
const createSchema = z.object({ server_id: uuid, token, label: z.string().trim().min(1).max(80), ttl_seconds: z.number().refine(v => [0, 3600, 86400, 604800, 2592000].includes(v)), max_uses: z.number().int().min(1).max(10000).nullable() })
export type InviteDraft = z.infer<typeof createSchema>
export type CommunityInvite = z.infer<typeof inviteSchema>
export type CommunityInviteEntry = z.infer<typeof entrySchema>
const schemas = { create: createSchema, list: z.object({ server_id: uuid, before: z.string().regex(/^\d+$/).optional() }), revoke: z.object({ server_id: uuid, invite_id: uuid }), preview: z.object({ token }), redeem: z.object({ token }) }
async function call(action: keyof typeof schemas, payload: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await supabase.rpc('community_v2_invites', { p_action: action, p_payload: schemas[action].parse(payload) }).abortSignal(signal || AbortSignal.timeout(15000))
  if (error) throw apiError(error)
  return data
}
export const communityInvites = {
  create: async (draft: InviteDraft) => z.object({ id: uuid, expires_at: z.string().nullable(), revoked: z.boolean() }).parse(await call('create', draft)),
  list: async (serverId: string, before?: string, signal?: AbortSignal) => z.array(inviteSchema).parse(await call('list', { server_id: serverId, before }, signal)),
  revoke: async (serverId: string, inviteId: string) => { await call('revoke', { server_id: serverId, invite_id: inviteId }) },
  preview: async (value: string, signal?: AbortSignal) => entrySchema.parse(await call('preview', { token: value }, signal)),
  redeem: async (value: string) => entrySchema.parse(await call('redeem', { token: value })),
}
