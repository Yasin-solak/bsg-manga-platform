import { resolveStoreAssetUrl } from '../assetUrlService'
import type { Notification } from './types'

export function resolveNotificationIcon(icon?: string | null) {
  return resolveStoreAssetUrl(icon) || icon || null
}

export function mapNotification(row: Notification): Notification {
  return {
    ...row,
    icon: resolveNotificationIcon(row.icon),
  }
}
