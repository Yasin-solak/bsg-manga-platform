import { z } from 'zod'
import { supabase } from './supabase'

/*
 * Admin > Community (new system: server / channel / message). Only a site admin can
 * call this (public.community_v2_admin -> community_v2.admin_api). Interventions
 * produce the same result as the server's own rules and are written to the action history
 * with a site admin marker.
 */

const uuid = z.string().uuid()
const count = z.number().int().nonnegative()
const person = z.object({ id: uuid, username: z.string().nullable(), avatar_url: z.string().nullable() })

const overviewSchema = z.object({
  enabled: z.boolean(),
  servers: count,
  fansub_servers: count,
  rooms: count,
  archived: count,
  members_active: count,
  messages_7d: count,
  reports_open: count,
  queued: count,
})
export type CommunityAdminOverview = z.infer<typeof overviewSchema>

const serverRowSchema = z.object({
  id: uuid,
  name: z.string(),
  avatar_url: z.string().nullable(),
  join_mode: z.enum(['open', 'invite', 'request']),
  kind: z.enum(['fansub', 'room']),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  fansub: z.object({ id: uuid, name: z.string(), slug: z.string().nullable() }).nullable(),
  owner: person,
  members_active: count,
  members_banned: count,
  channels: count,
  messages_7d: count,
  last_message_at: z.string().nullable(),
  reports_open: count,
})
export type CommunityAdminServerRow = z.infer<typeof serverRowSchema>

const serverDetailSchema = z.object({
  id: uuid,
  name: z.string(),
  description: z.string().nullable(),
  rules: z.string().nullable(),
  avatar_url: z.string().nullable(),
  banner_url: z.string().nullable(),
  join_mode: z.enum(['open', 'invite', 'request']),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  version: z.number().int(),
  kind: z.enum(['fansub', 'room']),
  fansub: z.object({ id: uuid, name: z.string(), slug: z.string().nullable(), is_active: z.boolean().nullable() }).nullable(),
  owner: person.nullable(),
  members: z.object({ active: count, timeout: count, banned: count, left: count }),
  messages_total: count,
  messages_7d: count,
  storage_bytes: z.number().nonnegative(),
  invites_active: count,
  join_requests: count,
  reports_open: count,
  channels: z.array(z.object({
    id: uuid,
    name: z.string(),
    category: z.string().nullable(),
    topic: z.string().nullable(),
    is_private: z.boolean(),
    archived_at: z.string().nullable(),
    slowmode_seconds: z.number().int().nonnegative(),
    series: z.object({ id: uuid, title: z.string(), slug: z.string().nullable() }).nullable(),
    messages: count,
    last_message_at: z.string().nullable(),
  })),
  roles: z.array(z.object({
    id: uuid,
    name: z.string(),
    color: z.string(),
    position: z.number(),
    is_default: z.boolean(),
    permissions: count,
    members: count,
  })),
  audit: z.array(z.object({
    id: z.number(),
    action: z.string(),
    created_at: z.string(),
    details: z.record(z.unknown()).nullable(),
    actor_username: z.string().nullable(),
    site_admin: z.boolean().nullable(),
  })),
})
export type CommunityAdminServer = z.infer<typeof serverDetailSchema>

const memberSchema = z.object({
  user_id: uuid,
  username: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  nickname: z.string().nullable(),
  state: z.string(),
  joined_at: z.string().nullable(),
  timeout_until: z.string().nullable(),
  last_message_at: z.string().nullable(),
  is_owner: z.boolean(),
  roles: z.array(z.object({ name: z.string(), color: z.string() })),
})
export type CommunityAdminMember = z.infer<typeof memberSchema>

export const COMMUNITY_REPORT_REASONS = {
  spam: 'Spam / reklam',
  harassment: 'Taciz / hakaret',
  unsafe: 'Zararlı veya uygunsuz içerik',
  spoiler: 'İşaretlenmemiş spoiler',
  other: 'Diğer',
} as const

const reportSchema = z.object({
  id: uuid,
  reason: z.enum(['spam', 'harassment', 'unsafe', 'spoiler', 'other']),
  note: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'dismissed']),
  version: z.number().int(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  resolution_note: z.string().nullable(),
  reviewer_username: z.string().nullable(),
  server: z.object({ id: uuid, name: z.string(), avatar_url: z.string().nullable() }),
  channel: z.object({ id: uuid, name: z.string() }),
  reporter: person,
  message: z.object({
    id: uuid,
    body: z.string(),
    created_at: z.string(),
    edited_at: z.string().nullable(),
    deleted_at: z.string().nullable(),
    attachments: count,
    author: person.extend({ display_name: z.string().nullable() }),
    author_state: z.object({ state: z.string(), timeout_until: z.string().nullable(), is_owner: z.boolean() }).nullable(),
    reports_on_message: count,
  }),
})
export type CommunityAdminReport = z.infer<typeof reportSchema>

/** Admin > Fansubs: summary of the fansub's community server (null if none). */
const fansubServerSchema = z.object({
  id: uuid,
  name: z.string(),
  join_mode: z.enum(['open', 'invite', 'request']),
  archived_at: z.string().nullable(),
  created_at: z.string(),
  members_active: count,
  members_timeout: count,
  members_banned: count,
  channels: count,
  messages_7d: count,
  last_message_at: z.string().nullable(),
  reports_open: count,
  join_requests: count,
}).nullable()
export type CommunityAdminFansubServer = NonNullable<z.infer<typeof fansubServerSchema>>

export type CommunityServerKindFilter = 'all' | 'fansub' | 'room' | 'archived'
export type CommunityServerSort = 'activity' | 'members' | 'newest' | 'reports'
export type CommunityMemberStateFilter = 'active' | 'timeout' | 'banned' | 'left' | 'all'
export type CommunityReportStatus = 'open' | 'resolved' | 'dismissed'
export type CommunityMemberOperation = 'timeout' | 'kick' | 'ban' | 'unban'

async function call(action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
  const { data, error } = await supabase.rpc('community_v2_admin', { p_action: action, p_payload: payload })
    .abortSignal(signal || AbortSignal.timeout(15_000))
  if (error) {
    // Server messages are Turkish and user-appropriate (P0001 / 42501 / 22023); the rest are generic.
    throw new Error(['P0001', '42501', '22023'].includes(error.code || '') ? error.message : 'Topluluk verisi alınamadı. Bağlantını kontrol edip tekrar dene.')
  }
  return data
}

export const communityAdmin = {
  overview: async (signal?: AbortSignal) => overviewSchema.parse(await call('overview', {}, signal)),
  servers: async (filter: { search: string, kind: CommunityServerKindFilter, sort: CommunityServerSort, offset: number }, signal?: AbortSignal) =>
    z.object({ total: count, rows: z.array(serverRowSchema) }).parse(await call('servers', { search: filter.search.trim().slice(0, 80), kind: filter.kind, sort: filter.sort, offset: filter.offset }, signal)),
  fansubServer: async (fansubId: string, signal?: AbortSignal) => fansubServerSchema.parse(await call('fansub_server', { fansub_id: uuid.parse(fansubId) }, signal)),
  server: async (serverId: string, signal?: AbortSignal) => serverDetailSchema.parse(await call('server', { server_id: uuid.parse(serverId) }, signal)),
  members: async (filter: { serverId: string, search: string, state: CommunityMemberStateFilter, offset: number }, signal?: AbortSignal) =>
    z.object({ total: count, rows: z.array(memberSchema) }).parse(await call('members', { server_id: uuid.parse(filter.serverId), search: filter.search.trim().slice(0, 80), state: filter.state, offset: filter.offset }, signal)),
  reports: async (filter: { status: CommunityReportStatus, serverId?: string | null, offset: number }, signal?: AbortSignal) =>
    z.object({ total: count, counts: z.object({ open: count, resolved: count, dismissed: count }), rows: z.array(reportSchema) })
      .parse(await call('reports', { status: filter.status, server_id: filter.serverId || null, offset: filter.offset }, signal)),
  decideReport: async (report: Pick<CommunityAdminReport, 'id' | 'version'>, status: 'resolved' | 'dismissed', note: string) => {
    await call('decide_report', { report_id: report.id, version: report.version, status, note: note.trim().slice(0, 1000) })
  },
  deleteMessage: async (messageId: string) => { await call('delete_message', { message_id: uuid.parse(messageId) }) },
  moderate: async (serverId: string, userId: string, operation: CommunityMemberOperation, minutes?: number) => {
    await call('moderate', { server_id: uuid.parse(serverId), user_id: uuid.parse(userId), operation, minutes: operation === 'timeout' ? minutes ?? 0 : null })
  },
  archive: async (server: Pick<CommunityAdminServer, 'id' | 'version'>, archived: boolean) => {
    await call('archive', { server_id: server.id, version: server.version, archived })
  },
}
