import type { AdminUserOverview, AdminUserRole } from '@/services/adminUserService'
import { txa } from '@/i18n/activeLocale'

/**
 * Summary strip of the Users v2 desk = view. Each view is filtered on the server
 * (list_admin_user_management_page_v2 p_view); the count comes from the server
 * summary and counts the same condition.
 */
export type AdminUsersView = 'all' | 'new' | 'staff' | 'review' | 'banned'

export interface UsersViewOption {
  id: AdminUsersView
  label: string
  count: (overview: AdminUserOverview) => number | null
}

export const USERS_VIEW_OPTIONS: UsersViewOption[] = [
  { id: 'all', get label() { return txa('Tüm kullanıcılar') }, count: (o) => o.total },
  { id: 'new', get label() { return txa('Yeni (7 gün)') }, count: (o) => o.newUsersCurrent ?? null },
  { id: 'staff', get label() { return txa('Yetkililer') }, count: (o) => o.admins + o.moderators },
  { id: 'review', get label() { return txa('İncelenmeli') }, count: (o) => o.lowTrustReview ?? null },
  { id: 'banned', get label() { return txa('Banlı') }, count: (o) => o.banned ?? null },
]

export const DEFAULT_USERS_VIEW: AdminUsersView = 'all'

export const USERS_PER_PAGE = 20

export const ROLE_OPTIONS: Array<{ id: AdminUserRole, label: string, consequence: string }> = [
  { id: 'user', get label() { return txa('Kullanıcı') }, get consequence() { return txa('Yetkili rolü kalkar; moderatör ya da admin yetkilerini kaybeder.') } },
  { id: 'moderator', get label() { return txa('Moderatör') }, get consequence() { return txa('Sitede moderatör olarak görünür ve moderatör yetkilerini alır. Yönetim paneline yalnız adminler girer.') } },
  { id: 'admin', get label() { return txa('Admin') }, get consequence() { return txa('Yönetim paneline tam erişim kazanır: kullanıcıları banlayabilir, rolleri değiştirebilir, ayarları ve ekonomiyi düzenleyebilir.') } },
]

export function roleTone(role: AdminUserRole) {
  return role === 'admin' ? 'violet' as const : role === 'moderator' ? 'sky' as const : undefined
}
