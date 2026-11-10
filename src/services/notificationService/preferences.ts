import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import type {
  NotificationPreferenceKey,
  NotificationPreferences,
  NotificationType,
} from './types'

type NotificationPreferencesRow = {
  follow_enabled: boolean | null
  comment_enabled: boolean | null
  mention_enabled: boolean | null
  badge_enabled: boolean | null
  level_up_enabled: boolean | null
  system_enabled: boolean | null
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  followEnabled: true,
  commentEnabled: true,
  mentionEnabled: true,
  badgeEnabled: true,
  levelUpEnabled: true,
  systemEnabled: true,
}

const notificationPreferencesLogger = createScopedLogger('notificationService/preferences')

function isNotificationPreferenceInfraMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
  return (
    typed.code === 'PGRST202'
    || typed.code === '42703'
    || typed.code === '42883'
    || typed.code === '42P01'
    || text.includes('user_notification_preferences')
    || text.includes('get_my_notification_preferences')
    || text.includes('update_my_notification_preferences')
    || text.includes('is_notification_type_enabled')
  )
}

function buildNotificationPreferenceMigrationError() {
  return new Error('Bu ozellik icin 20260301235902_notification_preferences_phase3.sql migration dosyasini calistirin.')
}

function mapNotificationPreferences(
  row: Partial<NotificationPreferencesRow> | null | undefined,
): NotificationPreferences {
  return {
    followEnabled: row?.follow_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.followEnabled,
    commentEnabled: row?.comment_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.commentEnabled,
    mentionEnabled: row?.mention_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.mentionEnabled,
    badgeEnabled: row?.badge_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.badgeEnabled,
    levelUpEnabled: row?.level_up_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.levelUpEnabled,
    systemEnabled: row?.system_enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.systemEnabled,
  }
}

function normalizeNotificationPreferences(
  preferences: NotificationPreferences,
): NotificationPreferences {
  return {
    followEnabled: preferences.followEnabled === true,
    commentEnabled: preferences.commentEnabled === true,
    mentionEnabled: preferences.mentionEnabled === true,
    badgeEnabled: preferences.badgeEnabled === true,
    levelUpEnabled: preferences.levelUpEnabled === true,
    systemEnabled: preferences.systemEnabled === true,
  }
}

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES }
}

export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const requestContext = createRequestContext('notificationService/preferences', 'getMyNotificationPreferences')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_my_notification_preferences'),
      signal,
    ),
    { label: 'notificationService.getMyNotificationPreferences' },
  )

  if (error) {
    if (isNotificationPreferenceInfraMissingError(error)) throw buildNotificationPreferenceMigrationError()
    notificationPreferencesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Bildirim tercihleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = ((Array.isArray(data) ? data[0] : data) || {}) as Partial<NotificationPreferencesRow>
  return mapNotificationPreferences(payload)
}

export async function updateMyNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const requestContext = createRequestContext('notificationService/preferences', 'updateMyNotificationPreferences')
  const normalized = normalizeNotificationPreferences(preferences)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('update_my_notification_preferences', {
        p_follow_enabled: normalized.followEnabled,
        p_comment_enabled: normalized.commentEnabled,
        p_mention_enabled: normalized.mentionEnabled,
        p_badge_enabled: normalized.badgeEnabled,
        p_level_up_enabled: normalized.levelUpEnabled,
        p_system_enabled: normalized.systemEnabled,
      }),
      signal,
    ),
    { label: 'notificationService.updateMyNotificationPreferences' },
  )

  if (error) {
    if (isNotificationPreferenceInfraMissingError(error)) throw buildNotificationPreferenceMigrationError()
    notificationPreferencesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Bildirim tercihleri guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = ((Array.isArray(data) ? data[0] : data) || {}) as Partial<NotificationPreferencesRow>
  return mapNotificationPreferences(payload)
}

export async function isNotificationEnabledForUser(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const requestContext = createRequestContext('notificationService/preferences', 'isNotificationEnabledForUser', {
    userId,
    type,
  })
  try {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.rpc('is_notification_type_enabled', {
          p_target_user_id: userId,
          p_type: type,
        }),
        signal,
      ),
      { label: 'notificationService.isNotificationEnabledForUser' },
    )

    if (error) {
      if (isNotificationPreferenceInfraMissingError(error)) return true
      notificationPreferencesLogger.warn({
        event: requestContext.event,
        message: toUserFacingErrorMessage(error, 'Bildirim tercih denetimi basarisiz oldu. Varsayilan acik kabul edildi.'),
        context: toRequestContextLogContext(requestContext),
        error,
      })
      return true
    }

    return data !== false
  } catch (error) {
    notificationPreferencesLogger.warn({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Bildirim tercih denetimi beklenmedik sekilde basarisiz oldu. Varsayilan acik kabul edildi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return true
  }
}

export const NOTIFICATION_PREFERENCE_KEYS: NotificationPreferenceKey[] = [
  'followEnabled',
  'commentEnabled',
  'mentionEnabled',
  'badgeEnabled',
  'levelUpEnabled',
  'systemEnabled',
]
