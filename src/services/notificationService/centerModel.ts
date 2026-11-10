import { z } from 'zod'
import type { Notification } from './types'

export const notificationCategorySchema = z.enum(['all', 'chapter', 'community', 'system'])
export type NotificationCategory = z.infer<typeof notificationCategorySchema>
export type NotificationCursor = { createdAt: string; id: string }
export type NotificationUnreadCounts = Record<NotificationCategory, number>

export const notificationIdSchema = z.string().uuid()
// Keeps PostgreSQL microseconds; Date.toISOString() skips records on pages with equal timestamps.
export const notificationTimestampSchema = z.string().datetime({ offset: true })
export const notificationCursorSchema = z.object({
  createdAt: notificationTimestampSchema,
  id: notificationIdSchema,
})

function timestampMicroseconds(value: string): bigint | null {
  if (!notificationTimestampSchema.safeParse(value).success) return null
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return null
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] ?? ''
  const remainder = fraction.padEnd(6, '0').slice(3, 6)
  return BigInt(milliseconds) * 1000n + BigInt(remainder)
}

/** Different UTC spellings and PostgreSQL microseconds are compared on the same time axis. */
export function compareNotificationTimestamps(left: string, right: string): -1 | 0 | 1 | null {
  const leftValue = timestampMicroseconds(left), rightValue = timestampMicroseconds(right)
  if (leftValue === null || rightValue === null) return null
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

export function isNotificationAtOrBefore(value: string, cutoff: string | null | undefined): boolean {
  if (!cutoff) return false
  const comparison = compareNotificationTimestamps(value, cutoff)
  return comparison !== null && comparison <= 0
}

/** Only a success after the query started is applied over a delayed read response. */
export function applyNotificationReadVersion(notification: Notification, baseline: ReadonlyMap<string, number>, current: ReadonlyMap<string, number>): Notification {
  const newerRead = (current.get(notification.id) ?? 0) > (baseline.get(notification.id) ?? 0)
  return newerRead && !notification.is_read ? { ...notification, is_read: true } : notification
}

const CHAPTER_EVENTS = ['manga_chapter_release', 'fansub_new_chapter'] as const
const COMMUNITY_EVENTS = ['fansub_new_manga', 'fansub_post', 'fansub_special_notification'] as const
const COMMUNITY_TYPES = ['follow', 'comment', 'mention'] as const

export function getNotificationCategory(notification: Pick<Notification, 'type' | 'data'>): Exclude<NotificationCategory, 'all'> {
  const event = notification.data?.event
  if (CHAPTER_EVENTS.some(value => value === event)) return 'chapter'
  if (COMMUNITY_TYPES.some(value => value === notification.type) || COMMUNITY_EVENTS.some(value => value === event)) return 'community'
  return 'system'
}

/** Old notifications with a null event still belong to a definite category. */
export function notificationCategoryFilter(category: NotificationCategory): string | null {
  const chapterEvents = CHAPTER_EVENTS.join(',')
  if (category === 'all') return null
  if (category === 'chapter') return `data->>event.in.(${chapterEvents})`
  if (category === 'community') {
    return `and(or(data->>event.is.null,data->>event.not.in.(${chapterEvents})),or(type.in.(${COMMUNITY_TYPES.join(',')}),data->>event.in.(${COMMUNITY_EVENTS.join(',')})))`
  }
  return `and(type.not.in.(${COMMUNITY_TYPES.join(',')}),or(data->>event.is.null,data->>event.not.in.(${[...CHAPTER_EVENTS, ...COMMUNITY_EVENTS].join(',')})))`
}

export function notificationCursorFilter(value: NotificationCursor): string {
  const cursor = notificationCursorSchema.parse(value)
  return `or(created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id}))`
}

export function notificationActorFilters(blockedUserIds: string[]): string[] {
  const ids = [...new Set(z.array(notificationIdSchema).parse(blockedUserIds))]
  if (!ids.length) return []
  // Event producers use this field; the recipient's user_id is not the actor.
  return ['actor_user_id', 'sender_user_id', 'invited_by', 'requester_id', 'transferred_by']
    .map(key => `or(data->>${key}.is.null,data->>${key}.not.in.(${ids.join(',')}))`)
}
