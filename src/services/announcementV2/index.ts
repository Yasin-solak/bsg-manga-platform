import { z } from 'zod'
import { supabase } from '../supabase'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { announcementSchema, adminAnnouncementSchema, draftSchema, referenceSchema, type AnnouncementDraft, type ReferenceKind } from './model'
import { announcementReportSchema, type reportFilters } from './reportModel'
import { txa } from '@/i18n/activeLocale'
export * from './model'
export * from './reportModel'

async function rpc<S extends z.ZodTypeAny>(name: string, params: Record<string, unknown>, schema: S, signal?: AbortSignal): Promise<z.output<S>> {
  const { data, error } = await withServiceTimeout(s => withAbortSignal(supabase.rpc(name, params), s), { label: txa('Duyurular'), signal })
  if (error) throw new Error(error.message || txa('Duyuru işlemi tamamlanamadı.'))
  return schema.parse(data)
}
export function listAnnouncements(options: { id?: string; home?: boolean; offset?: number; limit?: number; kind?: string; signal?: AbortSignal } = {}) {
  return rpc('announcement_feed', { p_id: options.id || null, p_home: options.home || false, p_offset: options.offset || 0,
    p_limit: options.limit || 20, p_kind: options.kind || null }, z.array(announcementSchema), options.signal)
}
/** Computed publish status: raw status + time, outside the trash. */
export type AnnouncementAdminState = 'all' | 'live' | 'scheduled' | 'ended' | 'draft' | 'archived' | 'deleted'
const stateCountsSchema = z.object({ live: z.number(), scheduled: z.number(), ended: z.number(), draft: z.number(), archived: z.number(), deleted: z.number() })
export type AnnouncementStateCounts = z.infer<typeof stateCountsSchema>
/** Admin desk: page by status (20), status counts and title search. */
export function listAdminAnnouncementOverview(state: AnnouncementAdminState, query: string, offset = 0, signal?: AbortSignal) {
  return rpc('announcement_admin_overview', { p_state: state, p_query: query.trim().slice(0, 80), p_offset: offset },
    z.object({ total: z.number(), counts: stateCountsSchema, items: z.array(adminAnnouncementSchema) }), signal)
}
export function listAdminAnnouncementsV2(status?: string, offset = 0, signal?: AbortSignal) {
  return rpc('announcement_admin_list', { p_status: status || null, p_offset: offset }, z.object({ total: z.number(), items: z.array(adminAnnouncementSchema) }), signal)
}
export async function saveAnnouncement(id: string, revision: number, draft: AnnouncementDraft) {
  const data = await rpc('announcement_admin_save', { p_id: z.string().uuid().parse(id), p_revision: revision, p_data: draftSchema.parse(draft) }, adminAnnouncementSchema)
  window.dispatchEvent(new Event('mz:announcements-changed'))
  return data
}
export function searchAnnouncementReferences(kind: ReferenceKind, query: string, signal?: AbortSignal) {
  return rpc('announcement_search', { p_kind: kind, p_query: query.trim().slice(0, 80) }, z.array(referenceSchema), signal)
}
export function respondToAnnouncement(id: string, action: 'view' | 'click' | 'link' | 'claim' | 'accepted' | 'declined' | 'option3' | 'option4') {
  return rpc('announcement_respond', { p_id: z.string().uuid().parse(id), p_action: action }, z.object({ success: z.boolean(),
    alreadyClaimed: z.boolean().optional(), credited_value: z.number().optional(), new_balance: z.number().optional(), response: z.string().optional() }))
}
export function notifyAnnouncement(id: string) {
  return rpc('announcement_notify', { p_id: id }, z.object({ sent: z.number(), skipped: z.number(), failed: z.number() }))
}
export function getAnnouncementHistory(id: string) {
  return rpc('announcement_admin_history', { p_id: id }, z.array(z.object({ revision: z.number(), created_at: z.string(), actor: z.string().nullable(), status: z.string(), title: z.string() })))
}
export async function transitionAnnouncement(a: { id: string; revision: number }, action: 'draft' | 'published' | 'archived' | 'delete' | 'restore') {
  const result = await rpc('announcement_admin_transition', { p_id: z.string().uuid().parse(a.id), p_revision: a.revision, p_action: action }, z.object({ success: z.boolean(), revision: z.number() }))
  window.dispatchEvent(new Event('mz:announcements-changed'))
  return result
}
export function getAnnouncementReport(id: string, days: number, offset: number, filter: keyof typeof reportFilters, query: string, signal?: AbortSignal) {
  return rpc('announcement_admin_report', { p_id: z.string().uuid().parse(id), p_days: days, p_offset: offset, p_filter: filter, p_query: query }, announcementReportSchema, signal)
}
