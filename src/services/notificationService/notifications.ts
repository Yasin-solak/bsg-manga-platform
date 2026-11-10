import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext, type RequestContext } from '../requestContext'
import { supabase } from '../supabase'
import { isNotificationEnabledForUser } from './preferences'
import { getE2EMockAuthUser } from '@/testing/e2eMocks'
import type { CreateNotificationData, Notification } from './types'
import { mapNotification, resolveNotificationIcon } from './shared'

const NOTIFICATION_SELECT = 'id, user_id, type, title, message, icon, data, is_read, created_at'
const DEFAULT_NOTIFICATION_LIMIT = 30
const MAX_NOTIFICATION_LIMIT = 100
const notificationsLogger = createScopedLogger('notificationService.notifications')

function logNotificationError(
  requestContext: RequestContext,
  message: string,
  error: unknown,
  extraContext?: Record<string, unknown>,
) {
  notificationsLogger.warn({
    event: requestContext.event,
    message,
    context: toRequestContextLogContext(requestContext, extraContext),
    error,
  })
}

function normalizeNotificationLimit(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_NOTIFICATION_LIMIT
  const normalized = Math.floor(Number(limit))
  if (normalized < 1) return DEFAULT_NOTIFICATION_LIMIT
  return Math.min(normalized, MAX_NOTIFICATION_LIMIT)
}

export async function createNotification(notification: CreateNotificationData): Promise<Notification | null> {
  const requestContext = createRequestContext('notificationService.notifications', 'create-notification', {
    userId: notification.user_id,
    type: notification.type,
  })
  if (!notification.bypassPreferences) {
    const isEnabled = await isNotificationEnabledForUser(notification.user_id, notification.type)
    if (!isEnabled) {
      return null
    }
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message || null,
      icon: resolveNotificationIcon(notification.icon),
      data: notification.data || null,
      is_read: false,
    })
    .select(NOTIFICATION_SELECT)
    .single()

  if (error) {
    logNotificationError(requestContext, 'bildirim olusturulamadi.', error)
    return null
  }

  return mapNotification(data as Notification)
}

export async function getNotifications(
  userId: string,
  options?: {
    limit?: number
    unreadOnly?: boolean
  },
): Promise<Notification[]> {
  const e2eMockUser = getE2EMockAuthUser()
  if (e2eMockUser?.id === userId) {
    return []
  }

  const requestContext = createRequestContext('notificationService.notifications', 'get-notifications', {
    userId,
    unreadOnly: Boolean(options?.unreadOnly),
    limit: normalizeNotificationLimit(options?.limit),
  })
  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(normalizeNotificationLimit(options?.limit))

  if (options?.unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query

  if (error) {
    logNotificationError(requestContext, 'bildirim listesi yuklenemedi.', error)
    return []
  }

  return ((data || []) as Notification[]).map(mapNotification)
}

export async function getUnreadCount(userId: string): Promise<number> {
  const e2eMockUser = getE2EMockAuthUser()
  if (e2eMockUser?.id === userId) {
    return 0
  }

  const requestContext = createRequestContext('notificationService.notifications', 'get-unread-count', { userId })
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    logNotificationError(requestContext, 'okunmamis bildirim sayisi yuklenemedi.', error)
    return 0
  }

  return count || 0
}

export async function markAsRead(notificationId: string): Promise<boolean> {
  const requestContext = createRequestContext('notificationService.notifications', 'mark-notification-read', {
    notificationId,
  })
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('is_read', false)

  if (error) {
    logNotificationError(requestContext, 'bildirim okunmus olarak isaretlenemedi.', error)
    return false
  }

  return true
}

export async function markAllAsRead(userId: string): Promise<boolean> {
  const requestContext = createRequestContext('notificationService.notifications', 'mark-all-notifications-read', {
    userId,
  })
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    logNotificationError(requestContext, 'tum bildirimler okunmus olarak isaretlenemedi.', error)
    return false
  }

  return true
}

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const requestContext = createRequestContext('notificationService.notifications', 'delete-notification', {
    notificationId,
  })
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  if (error) {
    logNotificationError(requestContext, 'bildirim silinemedi.', error)
    return false
  }

  return true
}

export async function cleanOldNotifications(userId: string, daysOld = 30): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)
  const requestContext = createRequestContext('notificationService.notifications', 'clean-old-notifications', {
    userId,
    daysOld,
  })

  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .lt('created_at', cutoffDate.toISOString())
    .select('id')

  if (error) {
    logNotificationError(requestContext, 'eski bildirimler temizlenemedi.', error, {
      cutoffDate: cutoffDate.toISOString(),
    })
    return 0
  }

  return data?.length || 0
}
