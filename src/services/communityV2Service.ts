import { z } from 'zod'
import { createCommunityRefreshScheduler } from '@/lib/communityRefreshScheduler'
import { supabase } from './supabase'
import { COMMUNITY_REACTIONS } from '@/lib/communityMentions'
import { communityProfileSchema } from './communityProfileSchema'
import { communityAttachmentSchema } from './communityFilesService'
import { txa } from '@/i18n/activeLocale'

export const COMMUNITY_PERMISSIONS = [
  ['server.profile.manage', 'Sunucu profilini düzenle', 'Sunucu adı, açıklaması, kuralları ve görsellerini düzenler.'],
  ['server.join.manage', 'Katılım politikasını yönet', 'Açık, davetli veya başvurulu katılım seçer. Profil düzenleme izninden bağımsızdır.'],
  ['members.approve', 'Başvuruları yönet', 'Sunucuya katılım başvurularını onaylar veya reddeder.'],
  ['members.nicknames.manage', 'Takma adları yönet', 'Kendisinden alt seviyedeki üyelerin sunucu takma adlarını düzenler.'],
  ['invites.create', 'Davet oluştur', 'Sunucuya katılım bağlantısı oluşturur; kendi davetlerini görür ve iptal eder.'],
  ['invites.manage', 'Davetleri yönet', 'Sunucudaki tüm davetleri görür ve iptal eder. Oluşturma izni ayrıdır.'],
  ['channel.view', 'Kanalları görüntüle', 'Genel kanalları görür. Özel odalar ayrıca rol seçimi gerektirir.'],
  ['messages.read', 'Mesajları oku', 'Erişebildiği kanallarda canlı mesajları ve geçmişi okur.'],
  ['messages.send', 'Mesaj gönder', 'Erişebildiği kanallara yazabilir.'],
  ['slowmode.bypass', 'Yavaş modu atla', 'Kanalın mesajlar arası bekleme süresinden etkilenmez. Temel spam sınırı korunur.'],
  ['reports.review', 'Mesaj şikâyetlerini incele', 'Yalnız okuyabildiği kanalların şikâyetlerini inceler. Silme ve üye yaptırımı ayrı izin ister.'],
  ['attachments.send', 'Dosya paylaş', 'Mesaj gönderme izniyle birlikte görsel, PDF ve metin dosyaları paylaşır.'],
  ['messages.reply', 'Mesaja yanıt ver', 'Okuyabildiği kanalda mesaj gönderme izniyle birlikte yanıt verir.'],
  ['reactions.add', 'Tepki ekle', 'Mesajlara emoji tepkisi ekler. Kendi tepkisini kaldırabilir.'],
  ['mentions.users', 'Kullanıcı etiketle', 'Aynı kanalı okuyabilen üyeleri etiketler.'],
  ['mentions.roles', 'Rol etiketle', 'Etiketlenebilir olarak açılmış özel rolleri etiketler.'],
  ['messages.pin', 'Mesajları sabitle', 'Erişebildiği kanalda mesaj sabitler veya sabitlemeyi kaldırır.'],
  ['messages.self.edit', 'Kendi mesajını düzenle', 'Erişebildiği kanallardaki kendi metnini değiştirebilir.'],
  ['messages.self.delete', 'Kendi mesajını sil', 'Kendi mesajının içeriğini kaldırabilir.'],
  ['messages.others.delete', 'Mesajları yönet', 'Diğer üyelerin mesajlarını kaldırabilir.'],
  ['members.list', 'Üyeleri görüntüle', 'Kanalın erişilebilir üye listesini görür.'],
  ['server.audit.read', 'İşlem geçmişini görüntüle', 'Rol, kanal ve moderasyon işlemlerini inceler.'],
  ['members.timeout', 'Yazmayı süreli kısıtla', 'Üyelere süreli yazma kısıtlaması uygulayabilir.'],
  ['members.kick', 'Üyeyi çıkar', 'Üyeyi sunucudan çıkarır; üye yeniden katılabilir.'],
  ['members.ban', 'Üyeyi yasakla', 'Üyenin yeniden katılmasını engeller.'],
  ['roles.create', 'Rol oluştur', 'Kendi sırasının altında, sahip olduğu izinlerle yeni rol oluşturur.'],
  ['roles.appearance.manage', 'Rol görünümünü düzenle', 'Yönetebildiği rollerin adını ve rengini değiştirir.'],
  ['roles.permissions.manage', 'Rol izinlerini düzenle', 'Alt rollere yalnız kendisinin sahip olduğu izinleri verir.'],
  ['roles.order.manage', 'Rol sırasını düzenle', 'Alt rolleri kendi rolünün altında kalacak şekilde sıralar.'],
  ['roles.assign', 'Üyelere rol ver', 'Alt seviyedeki üyelerin, yönetebildiği rollerini değiştirir.'],
  ['roles.delete', 'Rol sil', 'Yönetebildiği özel rolleri ve bu rollerin atamalarını kaldırır.'],
  ['channels.create', 'Kanal oluştur', 'Yeni sohbet kanalı oluşturur. Özel oda için erişim yönetimi de gerekir.'],
  ['channels.manage', 'Kanal bilgilerini düzenle', 'Erişebildiği kanalların adını, konusunu, kategorisini ve sırasını değiştirir.'],
  ['channels.permissions.manage', 'Kanal erişimini yönet', 'Erişebildiği kanalları özel yapar ve erişebilecek rolleri seçer.'],
  ['channels.archive', 'Kanalları arşivle', 'Kanalı salt okunur arşive taşır veya yeniden açar. Mesajlar korunur.'],
] as const
const uuid = z.string().uuid()
const roleSchema = z.object({ id: uuid, name: z.string(), color: z.string(), position: z.number(), is_default: z.boolean(), permissions: z.array(z.string()), version: z.number(), manageable: z.boolean(), mentionable: z.boolean(), icon: z.string().default(''), hoist: z.boolean().default(false) })
const seriesSchema = z.object({ id: uuid, title: z.string(), slug: z.string() })
const channelSchema = z.object({ slowmode_seconds: z.number().int().min(0).max(21600), next_send_at: z.string().nullable(), id: uuid, name: z.string(), topic: z.string(), is_private: z.boolean(), position: z.number(), can_read: z.boolean(), unread: z.number(), mention_count: z.number(), role_ids: z.array(uuid), category: z.string(), archived_at: z.string().nullable(), version: z.number(), manga_id: uuid.nullable(), series: seriesSchema.nullable(), can_link_series: z.boolean(), read_only_reason: z.enum(['archived', 'series_unavailable', 'fansub_unlinked']).nullable() })
const seriesCandidateSchema = seriesSchema.extend({ already_linked: z.boolean() })
const channelEntrySchema = z.object({ join_mode: z.enum(['open','invite','request']).default('open'), server_id: uuid, channel_id: uuid, channel_name: z.string(), fansub_name: z.string(), avatar_url: z.string().nullable(), is_member: z.boolean(), is_private: z.boolean() })
const identity = { username: z.string(), display_name: z.string().nullable(), avatar_url: z.string().nullable() }
const memberSchema = z.object({ nickname: z.string().nullable().optional(), user_id: uuid, ...identity, is_owner: z.boolean(), role_ids: z.array(uuid), state: z.string(), timeout_until: z.string().nullable(), rank: z.number(), manageable: z.boolean() })
const mentionSchema = z.object({ kind: z.enum(['user', 'role']), id: uuid, label: z.string(), username: z.string().nullable(), color: z.string().nullable() })
export const messageSchema = z.object({ client_id: uuid.nullable().default(null), blocked: z.boolean().default(false), id: uuid, seq: z.string(), author_id: uuid, body: z.string(), created_at: z.string(), edited_at: z.string().nullable(), deleted_at: z.string().nullable(), ...identity,
  attachments: z.array(communityAttachmentSchema).max(4),
  version: z.number(), pinned_at: z.string().nullable(), mentioned_me: z.boolean(), mentions: z.array(mentionSchema),
  reactions: z.array(z.object({ emoji: z.enum(COMMUNITY_REACTIONS), count: z.number().int().positive(), mine: z.boolean() })),
  reply: z.object({ id: uuid, seq: z.string(), author_id: uuid, username: z.string(), display_name: z.string().nullable(), body: z.string(), deleted: z.boolean(), blocked: z.boolean().default(false) }).nullable(),
})
const homeSchema = z.object({ auto_join: z.boolean(), servers: z.array(z.object({ id: uuid, name: z.string(), avatar_url: z.string().nullable(), slug: z.string(), owner_id: uuid, kind: z.enum(['fansub','room']).default('fansub'), archived_at: z.string().nullable().optional() })), owned_fansubs: z.array(z.object({ id: uuid, name: z.string() })) })
const serverSchema = z.object({ my_nickname: z.string().nullable(), profile: communityProfileSchema, server_now: z.string(), is_owner: z.boolean(), my_rank: z.number(), permissions: z.array(z.string()), timeout_until: z.string().nullable(), channels: z.array(channelSchema), roles: z.array(roleSchema) })
const activitySchema = serverSchema.pick({ server_now: true, is_owner: true, permissions: true, timeout_until: true }).extend({
  server_id: uuid, channels: z.array(channelSchema.pick({ id: true, can_read: true, unread: true, mention_count: true, next_send_at: true, can_link_series: true, read_only_reason: true })),
})
const auditSchema = z.object({ id: z.number(), action: z.string(), target_id: uuid.nullable(), created_at: z.string(), username: z.string().nullable(), details: z.object({ label: z.string().nullable().optional(), before: z.unknown(), after: z.unknown(), minutes: z.number().nullable().optional(), archived: z.boolean().optional() }) })
const discoverySchema = z.object({ join_mode: z.enum(['open','invite','request']).default('open'), pending: z.boolean().default(false), id: uuid, name: z.string(), description: z.string().nullable(), avatar_url: z.string().nullable(), state: z.string().nullable() })
export type CommunityRole = z.infer<typeof roleSchema>
export type CommunityChannel = z.infer<typeof channelSchema>
export type CommunityMember = z.infer<typeof memberSchema>
export type CommunityMessage = z.infer<typeof messageSchema>
export type CommunityHome = z.infer<typeof homeSchema>
export type CommunityServer = z.infer<typeof serverSchema>
export type CommunityServerActivity = z.infer<typeof activitySchema>
export type CommunityAudit = z.infer<typeof auditSchema>
export type CommunityDiscovery = z.infer<typeof discoverySchema>
export type CommunitySeriesCandidate = z.infer<typeof seriesCandidateSchema>
export type CommunityChannelEntry = z.infer<typeof channelEntrySchema>

const base = { server_id: uuid }
const mutationSchemas = {
  preference: z.object({ auto_join: z.boolean() }),
  create_server: z.object({ fansub_id: uuid }),
  join: z.object(base), leave: z.object(base),
  read: z.object({ channel_id: uuid, seq: z.string().regex(/^\d+$/) }),
  send: z.object({ channel_id: uuid, client_id: uuid, body: z.string().trim().max(4000), reply_to: uuid.nullable().optional(), attachment_ids:z.array(uuid).max(4).optional() }).refine(v=>v.body.length>0||!!v.attachment_ids?.length,'Mesaj metni veya dosya gerekli.'),
  edit_message: z.object({ channel_id: uuid, message_id: uuid, body: z.string().trim().max(4000), version: z.number().int().positive() }),
  delete_message: z.object({ channel_id: uuid, message_id: uuid }),
  set_reaction: z.object({ channel_id: uuid, message_id: uuid, emoji: z.enum(COMMUNITY_REACTIONS), active: z.boolean() }),
  set_pin: z.object({ channel_id: uuid, message_id: uuid, active: z.boolean() }),
  save_role: z.object({ ...base, role_id: uuid.optional(), version: z.number().int().positive().optional(), mentionable: z.boolean().optional(), icon: z.string().max(8).optional(), hoist: z.boolean().optional(), name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), position: z.number().int().min(0).max(1000), permissions: z.array(z.string().refine(value => COMMUNITY_PERMISSIONS.some(([key]) => key === value))).max(COMMUNITY_PERMISSIONS.length) }),
  delete_role: z.object({ ...base, role_id: uuid, version: z.number().int().positive() }),
  assign_roles: z.object({ ...base, user_id: uuid, role_ids: z.array(uuid).max(50), expected_role_ids: z.array(uuid).max(50).optional() }),
  save_channel: z.object({ slowmode_seconds: z.number().int().min(0).max(21600).optional(), ...base, channel_id: uuid.optional(), version: z.number().int().positive().optional(), name: z.string().trim().min(1).max(60), topic: z.string().max(300), category: z.string().trim().max(60), is_private: z.boolean(), position: z.number().int().min(0).max(1000), role_ids: z.array(uuid).max(50), manga_id: uuid.nullable().optional() }),
  archive_channel: z.object({ ...base, channel_id: uuid, version: z.number().int().positive(), archived: z.boolean() }),
  moderate: z.object({ ...base, user_id: uuid, operation: z.enum(['timeout', 'kick', 'ban', 'unban']), minutes: z.number().int().min(0).max(10080).optional() }),
}
export type CommunityAction = keyof typeof mutationSchemas

export class CommunityApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}
export function apiError(error: { message: string; code?: string }) {
  return new CommunityApiError(['P0001', '42501'].includes(error.code || '') ? error.message : txa('İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.'), error.code)
}
async function query<S extends z.ZodTypeAny>(action: string, payload: Record<string, unknown>, schema: S, signal?: AbortSignal): Promise<z.output<S>> {
  const req = supabase.rpc('community_v2_read', { p_action: action, p_payload: payload })
  const { data, error } = await req.abortSignal(signal || AbortSignal.timeout(15000))
  if (error) throw apiError(error)
  return schema.parse(data)
}
export const communityV2 = {
  async sync() {
    const { error } = await supabase.rpc('community_v2_sync').abortSignal(AbortSignal.timeout(15000))
    if (error) throw apiError(error)
  },
  home: (signal?: AbortSignal, serverId?: string | null) => query('home', { server_id: uuid.safeParse(serverId).success ? serverId : undefined }, homeSchema, signal),
  server: (id: string, signal?: AbortSignal) => query('server', { server_id: uuid.parse(id) }, serverSchema, signal),
  activity: (id: string, signal?: AbortSignal) => query('activity', { server_id: uuid.parse(id) }, activitySchema, signal),
  members: (id: string, search = '', offset = 0, includeInactive = false, channelId?: string) => query('members', { server_id: uuid.parse(id), search, offset, include_inactive: includeInactive, channel_id: channelId }, z.array(memberSchema)),
  messages: (id: string, before?: string, signal?: AbortSignal) => query('messages', { channel_id: uuid.parse(id), before }, z.array(messageSchema), signal),
  refreshMessages: (id: string, ids: string[]) => query('message_refresh', { channel_id: uuid.parse(id), ids: z.array(uuid).max(250).parse(ids) }, z.object({ latest: z.array(messageSchema), snapshot: z.array(messageSchema) })),
  messageSnapshot: (id: string, ids: string[]) => query('message_snapshot', { channel_id: uuid.parse(id), ids: z.array(uuid).max(250).parse(ids) }, z.array(messageSchema)),
  messageContext: (id: string, messageId: string) => query('message_context', { channel_id: uuid.parse(id), message_id: uuid.parse(messageId) }, z.array(messageSchema)),
  pins: (id: string) => query('pins', { channel_id: uuid.parse(id) }, z.array(messageSchema)),
  mentionCandidates: (id: string, search: string, signal?: AbortSignal) => query('mention_candidates', { channel_id: uuid.parse(id), search }, z.array(mentionSchema), signal),
  auditActors: (id: string, search: string) => query('audit_actors', { server_id: uuid.parse(id), search }, z.array(z.object({id: uuid, username: z.string()}))),
  audit: (id: string, offset = 0, filters: {action?: string; actor_id?: string; from?: string; to?: string} = {}) => query('audit', { server_id: uuid.parse(id), offset, ...filters }, z.array(auditSchema)),
  discover: (search = '', offset = 0) => query('discover', { search, offset }, z.array(discoverySchema)),
  seriesCandidates: (id: string, search = '', offset = 0, signal?: AbortSignal) => query('series_candidates', { server_id: uuid.parse(id), search, offset }, z.array(seriesCandidateSchema), signal),
  channelEntry: async (id: string, signal?: AbortSignal) => query('channel_entry', { channel_id: uuid.parse(id) }, channelEntrySchema, signal),
  async seriesChannels(id: string, offset = 0, signal?: AbortSignal) {
    const { data, error } = await supabase.rpc('community_v2_series_channels', { p_manga_id: uuid.parse(id), p_offset: offset }).abortSignal(signal || AbortSignal.timeout(15000))
    if (error) throw apiError(error)
    return z.array(channelEntrySchema).parse(data)
  },
  async write(action: CommunityAction, payload: Record<string, unknown>) {
    const valid = mutationSchemas[action].parse(payload)
    const { data, error } = await supabase.rpc('community_v2_write', { p_action: action, p_payload: valid }).abortSignal(AbortSignal.timeout(15000))
    if (error) throw apiError(error)
    return data as { pending?: boolean; ok?: boolean; id?: string; seq?: string; version?: number }
  },
  async send(payload: Record<string, unknown>) {
    const valid = mutationSchemas.send.parse(payload)
    const { data, error } = await supabase.rpc('community_v2_write', { p_action: 'send', p_payload: valid }).abortSignal(AbortSignal.timeout(15000))
    if (error) throw apiError(error)
    return z.object({ id: uuid, seq: z.string(), message: messageSchema, server_now: z.string(), next_send_at: z.string().nullable() }).parse(data)
  },
  subscribe(kind: 'server' | 'channel', id: string, refresh: (activityOnly: boolean) => void, status?: (connected: boolean) => void, options: { refreshOnSubscribe?: boolean } = {}) {
    let structureChanged = false
    const scheduler = createCommunityRefreshScheduler(() => { const activityOnly = !structureChanged; structureChanged = false; refresh(activityOnly) })
    const invalidate = (activityOnly = false) => { structureChanged ||= !activityOnly; scheduler.invalidate() }
    const channel = supabase.channel(`community-v2:${kind}:${uuid.parse(id)}`, { config: { private: true } })
      .on('broadcast', { event: 'refresh' }, event => invalidate(kind === 'server' && event.payload?.scope === 'activity'))
      .on('broadcast', { event: 'presence' }, () => { if (kind === 'channel') window.dispatchEvent(new Event(`community-presence:${id}`)) })
      .subscribe(state => { status?.(state === 'SUBSCRIBED'); if (state === 'SUBSCRIBED' && options.refreshOnSubscribe !== false) invalidate() })
    return () => { scheduler.dispose(); void supabase.removeChannel(channel) }
  },
}
