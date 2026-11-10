import { z } from 'zod'
import { txa } from '@/i18n/activeLocale'

export const kindLabels = { get news() { return txa('Duyuru') }, get system() { return txa('Sistem') }, get reward() { return txa('Ödül') }, get invitation() { return txa('Davet') } } as const
export const referenceLabels = { get manga() { return txa('Seri') }, get list() { return txa('Liste') }, get user() { return txa('Kullanıcı') }, get fansub() { return txa('Fansub') } } as const
export const audienceLabels = { get all() { return txa('Herkes') }, get members() { return txa('Üyeler') }, get premium() { return txa('Premium üyeler') }, get selected() { return txa('Seçili kişiler') } } as const
export const statusLabels = { get draft() { return txa('Taslak') }, get published() { return txa('Yayında / planlı') }, get archived() { return txa('Arşiv') } } as const
export const safeAnnouncementUrl = (value: string) => value.length <= 2048 && !/[\s\\]/.test(value)
  && (/^\/[a-zA-Z0-9]/.test(value) || /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+([/:?#]|$)/.test(value))
const url = z.string().refine(safeAnnouncementUrl, 'Güvenli bir site yolu veya HTTPS bağlantısı gir.')
export const referenceKindSchema = z.enum(['manga', 'list', 'user', 'fansub'])
export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1, 'Metin bloğu boş bırakılamaz.').max(4000, 'Bir metin bloğu en fazla 4000 karakter olabilir.'), highlight: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('reference'), kind: referenceKindSchema, id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('image'), url: url.refine(v => v.startsWith('https://'), 'Görsel HTTPS adresiyle eklenmeli.'), alt: z.string().trim().min(1, 'Görsel açıklaması gerekli.').max(200, 'Görsel açıklaması en fazla 200 karakter olabilir.') }).strict(),
])
export const rewardConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('verified_email') }).strict(),
  z.object({ type: z.literal('premium') }).strict(),
  z.object({ type: z.literal('account_age'), days: z.number().int().min(1).max(3650) }).strict(),
  z.object({ type: z.literal('follow_manga'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('follow_fansub'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('profile_completed') }).strict(),
  z.object({ type: z.literal('read_chapters'), count: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('read_manga'), id: z.string().uuid(), count: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('follow_manga_count'), count: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('follow_fansub_count'), count: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('level'), count: z.number().int().min(1).max(10) }).strict(),
  z.object({ type: z.literal('claimed_quests'), count: z.number().int().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('fansub_member'), id: z.string().uuid() }).strict(),
])
const conditions = z.array(rewardConditionSchema).max(13).refine(items => new Set(items.map(c => c.type)).size === items.length, 'Aynı şart bir kez eklenebilir.')
export type RewardCondition = z.infer<typeof rewardConditionSchema>
export const invitationChoiceIds = ['accepted', 'declined', 'option3', 'option4'] as const
export const invitationChoiceSchema = z.object({ id: z.enum(invitationChoiceIds), label: z.string().trim().min(1, 'Seçenek adı gerekli.').max(60) }).strict()
const invitationOptionsSchema = z.array(invitationChoiceSchema).min(1).max(4).refine(rows => new Set(rows.map(r => r.id)).size === rows.length
  && new Set(rows.map(r => r.label.toLocaleLowerCase('tr-TR'))).size === rows.length, 'Seçenek adları ve kimlikleri farklı olmalı.')
export type InvitationChoice = z.infer<typeof invitationChoiceSchema>
export const defaultInvitationChoices: InvitationChoice[] = [{ id: 'accepted', get label() { return txa('Katılacağım') } }, { id: 'declined', get label() { return txa('Katılamayacağım') } }]
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('link'), label: z.string().trim().min(1).max(60), url, direct: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('reward'), value: z.number().int().min(1).max(10000), maxClaims: z.number().int().min(1).max(100000), conditions: conditions.optional() }).strict(),
  z.object({ type: z.literal('rsvp'), options: invitationOptionsSchema.optional() }).strict(),
])
export const referenceSchema = z.object({ kind: referenceKindSchema, id: z.string().uuid(), title: z.string(), href: url, image: z.string().nullable().optional() })
export const announcementSchema = z.object({
  id: z.string().uuid(), title: z.string(), document: z.array(blockSchema).min(1).max(24), kind: z.enum(['news', 'system', 'reward', 'invitation']),
  startsAt: z.string(), endsAt: z.string().nullable(), priority: z.number(), action: actionSchema,
  references: z.record(referenceSchema.nullable()), revision: z.number(), response: z.enum(invitationChoiceIds).nullable(),
  reward: z.object({ value: z.number(), remaining: z.number(), available: z.boolean(), claimed: z.boolean(), eligible: z.boolean().optional(),
    conditions: z.array(z.object({ type: z.string(), label: z.string(), met: z.boolean(), href: url.optional(), current: z.number().optional(), target: z.number().optional() })).optional() }).nullable(),
})
export const draftSchema = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli.').max(160), document: z.array(blockSchema).min(1).max(24),
  kind: announcementSchema.shape.kind, status: z.enum(['draft', 'published', 'archived']), audience: z.enum(['all', 'members', 'premium', 'selected']),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).nullable(),
  priority: z.number().int().min(0).max(10), showHome: z.boolean(), action: actionSchema, recipients: z.array(z.string().uuid()).max(100),
}).superRefine((d, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (d.endsAt && Date.parse(d.endsAt) <= Date.parse(d.startsAt)) issue('Bitiş, başlangıçtan sonra olmalı.')
  if ((d.audience === 'selected') !== (d.recipients.length > 0)) issue('Seçili kişiler için en az bir alıcı gerekli.')
  if ((d.kind === 'reward') !== (d.action.type === 'reward') || (d.kind === 'invitation') !== (d.action.type === 'rsvp')) issue('Tür ve işlem birbiriyle uyuşmuyor.')
  if ((d.kind === 'reward' || d.kind === 'invitation') && !d.endsAt) issue('Ödül ve davetlerde bitiş tarihi gerekli.')
  if (d.action.type === 'reward' && d.action.value * d.action.maxClaims > 100000000) issue('Toplam dağıtım en fazla 100 milyon coin olabilir.')
})
export const adminAnnouncementSchema = z.object({
  id: z.string().uuid(), title: z.string(), document: z.array(blockSchema), kind: announcementSchema.shape.kind,
  status: z.enum(['draft', 'published', 'archived']), audience: z.enum(['all', 'members', 'premium', 'selected']),
  starts_at: z.string(), ends_at: z.string().nullable(), priority: z.number(), show_home: z.boolean(), action: actionSchema,
  revision: z.number(), created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable().optional(), recipients: z.array(referenceSchema),
  views: z.number(), accepted: z.number(), declined: z.number(), claims: z.number(), rewardLocked: z.boolean(), preview: announcementSchema,
  clicks: z.number().default(0), linkClicks: z.number().default(0), responseCount: z.number().default(0), measurement_started_at: z.string().optional(),
})
export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementBlock = z.infer<typeof blockSchema>
export type AnnouncementReference = z.infer<typeof referenceSchema>
export type ReferenceKind = z.infer<typeof referenceKindSchema>
export type AnnouncementDraft = z.infer<typeof draftSchema>
export type AdminAnnouncementV2 = z.infer<typeof adminAnnouncementSchema>
export function newAnnouncementDraft(): AnnouncementDraft {
  return { title: '', document: [{ type: 'text', text: '' }], kind: 'news', status: 'draft', audience: 'all', startsAt: new Date().toISOString(),
    endsAt: null, priority: 0, showHome: true, action: { type: 'none' }, recipients: [] }
}
export function toAnnouncementDraft(a: AdminAnnouncementV2): AnnouncementDraft {
  return { title: a.title, document: a.document, kind: a.kind, status: a.status, audience: a.audience, startsAt: a.starts_at,
    endsAt: a.ends_at, priority: a.priority, showHome: a.show_home, action: a.action, recipients: a.recipients.map(r => r.id) }
}
export function announcementExcerpt(a: Announcement) {
  return a.document.filter((b): b is Extract<AnnouncementBlock, { type: 'text' }> => b.type === 'text')
    .map(b => b.text.replace(/@\[(user|fansub):([\da-f-]{36})\]/gi, (_, kind: string, id: string) => a.references[`${kind}:${id}`]?.title || txa('Kullanıcı'))
      .replace(/\*\*|==|\*/g, '')).join(' ')
}

// The editor uses a readable name, saving uses a permanent id; the user does not have to type a UUID.
export function announcementTextForEditor(text: string, references: Announcement['references']) {
  return text.replace(/@\[(user|fansub):([\da-f-]{36})\]/gi, (_, kind: string, id: string) => {
    const ref = references[`${kind}:${id}`]
    return ref ? kind === 'user' ? ref.title : `@{${ref.title}}` : txa('@kullanıcı')
  })
}
export function announcementTextFromEditor(text: string, references: Announcement['references']) {
  let result = text
  for (const ref of Object.values(references)) {
    if (!ref || (ref.kind !== 'user' && ref.kind !== 'fansub')) continue
    const label = ref.kind === 'user' ? ref.title : `@{${ref.title}}`
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu'), (_, before: string) => `${before}@[${ref.kind}:${ref.id}]`)
  }
  return result
}
export function mentionAtCursor(text: string, cursor: number) {
  const match = text.slice(0, cursor).match(/(?:^|[\s(])@([\p{L}\p{N}_.-]*)$/u)
  return match ? { start: cursor - match[1].length - 1, end: cursor, query: match[1] } : null
}
