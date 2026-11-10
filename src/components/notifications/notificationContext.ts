import { createContext, useContext } from 'react'
import type { Notification } from '@/services/notificationService'
import { txa } from '@/i18n/activeLocale'
export type UnreadCounts = { all: number; chapter: number; community: number; system: number }
export interface NotificationState {
  enabled: boolean; flagsLoading: boolean; userId: string | null
  counts: UnreadCounts | null; countError: boolean
  readIds: ReadonlyMap<string, number>; readAllRevision: number; busy: Set<string>
  refreshCounts: () => Promise<void>
  markRead: (item: Notification) => Promise<boolean>
  markAll: (snapshotAt: string) => Promise<boolean>
}
export const NotificationContext = createContext<NotificationState | null>(null)
export function useNotificationCenter() {
  const value = useContext(NotificationContext)
  if (!value) throw new Error(txa('Bildirim sağlayıcısı bulunamadı.'))
  return value
}
