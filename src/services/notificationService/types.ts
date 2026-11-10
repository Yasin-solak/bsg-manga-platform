export type NotificationType =
  | 'badge_earned'
  | 'badge_purchased'
  | 'level_up'
  | 'follow'
  | 'comment'
  | 'mention'
  | 'system'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string | null
  icon: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

export interface CreateNotificationData {
  user_id: string
  type: NotificationType
  title: string
  message?: string
  icon?: string
  data?: Record<string, unknown>
  bypassPreferences?: boolean
}

export interface NotificationPreferences {
  followEnabled: boolean
  commentEnabled: boolean
  mentionEnabled: boolean
  badgeEnabled: boolean
  levelUpEnabled: boolean
  systemEnabled: boolean
}

export type NotificationPreferenceKey = keyof NotificationPreferences
