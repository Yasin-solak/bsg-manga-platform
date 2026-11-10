import { z } from 'zod'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { getBlockedUserIds } from '../userService/blocks'
import { mapNotification } from './shared'
import { enrichNotificationPage } from './centerEnrichment'
import type { Notification } from './types'
import {
  notificationActorFilters, notificationCategoryFilter, notificationCategorySchema,
  notificationCursorFilter, notificationCursorSchema, notificationIdSchema, notificationTimestampSchema,
  type NotificationCategory, type NotificationCursor, type NotificationUnreadCounts,
} from './centerModel'
import { txa } from '@/i18n/activeLocale'

const CENTER_SELECT = 'id,user_id,type,title,message,icon,data,is_read,created_at'
const pageOptionsSchema = z.object({
  category: notificationCategorySchema.default('all'),
  cursor: notificationCursorSchema.nullish(),
  snapshotAt: notificationTimestampSchema.optional(),
  limit: z.number().int().min(1).max(50).default(30),
  unreadOnly: z.boolean().default(false),
})

type ReadOptions = { signal?: AbortSignal }
export type NotificationPageOptions = ReadOptions & {
  category?: NotificationCategory
  cursor?: NotificationCursor | null
  snapshotAt?: string
  limit?: number
  unreadOnly?: boolean
}
export type NotificationPage = {
  items: Notification[]
  nextCursor: NotificationCursor | null
  snapshotAt: string
}

async function actorFilters(userId: string, signal?: AbortSignal) {
  const blocked = await withServiceTimeout(requestSignal => getBlockedUserIds(userId, requestSignal), {
    signal, label: txa('Bildirim gizlilik tercihleri'),
  })
  return notificationActorFilters(blocked)
}

function combineFilters(filters: (string | null)[]) {
  const active = filters.filter((value): value is string => Boolean(value))
  return active.length ? `and(${active.join(',')})` : null
}

async function getNotificationSnapshot(userId: string, signal?: AbortSignal): Promise<string> {
  const { data, error } = await withServiceTimeout(requestSignal => supabase.from('notifications')
    .select('id,created_at').eq('user_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(1).abortSignal(requestSignal).maybeSingle(), { signal, label: txa('Bildirim geçmişi zaman sınırı') })
  if (error) throw error
  // The device clock may run fast or slow; the boundary comes only from a server-produced record.
  return data ? notificationTimestampSchema.parse(data.created_at) : '1970-01-01T00:00:00.000Z'
}

/** Category and privacy filters apply before pagination; no query per card. */
export async function getNotificationPage(userId: string, options: NotificationPageOptions = {}): Promise<NotificationPage> {
  const ownerId = notificationIdSchema.parse(userId)
  const parsed = pageOptionsSchema.parse(options)
  const filters = await actorFilters(ownerId, options.signal)
  const snapshotAt = parsed.snapshotAt ?? await getNotificationSnapshot(ownerId, options.signal)
  const predicate = combineFilters([
    notificationCategoryFilter(parsed.category), ...filters,
    parsed.cursor ? notificationCursorFilter(parsed.cursor) : null,
  ])
  const { data, error } = await withServiceTimeout(signal => {
    let query = supabase.from('notifications').select(CENTER_SELECT).eq('user_id', ownerId)
      .lte('created_at', snapshotAt)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(parsed.limit + 1)
    if (parsed.unreadOnly) query = query.eq('is_read', false)
    if (predicate) query = query.or(predicate)
    return query.abortSignal(signal)
  }, { signal: options.signal, label: txa('Bildirim geçmişi') })
  if (error) throw error
  const rows = (data || []) as Notification[]
  const items = await enrichNotificationPage(rows.slice(0, parsed.limit).map(mapNotification), options.signal)
  const last = items[items.length - 1]
  return {
    items, snapshotAt,
    nextCursor: rows.length > parsed.limit && last ? { createdAt: last.created_at, id: last.id } : null,
  }
}

/** Produces separate category counts from three HEAD queries instead of downloading the whole history. */
export async function getNotificationUnreadCounts(userId: string, options: ReadOptions = {}): Promise<NotificationUnreadCounts> {
  const ownerId = notificationIdSchema.parse(userId)
  const filters = await actorFilters(ownerId, options.signal)
  const categories = ['chapter', 'community', 'system'] as const
  const counts = await Promise.all(categories.map(async category => {
    const predicate = combineFilters([notificationCategoryFilter(category), ...filters])!
    const { count, error } = await withServiceTimeout(signal => supabase.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('user_id', ownerId).eq('is_read', false)
      .or(predicate).abortSignal(signal), { signal: options.signal, label: txa('Okunmamış bildirim sayısı') })
    if (error) throw error
    if (typeof count !== 'number') throw new Error(txa('Bildirim sayısı doğrulanamadı.'))
    return count
  }))
  return { all: counts.reduce((sum, count) => sum + count, 0), chapter: counts[0], community: counts[1], system: counts[2] }
}

/** Uses an explicit recipient filter alongside RLS; a record not found does not count as success. */
export async function markNotificationRead(userId: string, notificationId: string, options: ReadOptions = {}): Promise<Notification> {
  const ownerId = notificationIdSchema.parse(userId)
  const id = notificationIdSchema.parse(notificationId)
  const { data, error } = await withServiceTimeout(signal => supabase.from('notifications')
    .update({ is_read: true }).eq('user_id', ownerId).eq('id', id)
    .select(CENTER_SELECT).abortSignal(signal).single(), { signal: options.signal, label: 'Bildirimi okundu işaretle' })
  if (error) throw error
  if (!data || data.user_id !== ownerId || data.id !== id || data.is_read !== true) {
    throw new Error(txa('Bildirimin okundu durumu doğrulanamadı.'))
  }
  return mapNotification(data as Notification)
}

/** Records arriving after the screen opened are kept; zero changes is a valid, visible result. */
export async function markNotificationCenterRead(userId: string, options: ReadOptions & {
  snapshotAt: string
  category?: NotificationCategory
}): Promise<number> {
  const ownerId = notificationIdSchema.parse(userId)
  const snapshotAt = notificationTimestampSchema.parse(options.snapshotAt)
  const category = notificationCategorySchema.parse(options.category ?? 'all')
  const filters = await actorFilters(ownerId, options.signal)
  const predicate = combineFilters([notificationCategoryFilter(category), ...filters])
  const { count, error } = await withServiceTimeout(signal => {
    let query = supabase.from('notifications').update({ is_read: true }, { count: 'exact' })
      .eq('user_id', ownerId).eq('is_read', false).lte('created_at', snapshotAt)
    if (predicate) query = query.or(predicate)
    return query.abortSignal(signal)
  }, { signal: options.signal, label: txa('Bildirimleri okundu işaretle') })
  if (error) throw error
  if (typeof count !== 'number') throw new Error(txa('Okundu işaretlenen bildirim sayısı doğrulanamadı.'))
  return count
}
