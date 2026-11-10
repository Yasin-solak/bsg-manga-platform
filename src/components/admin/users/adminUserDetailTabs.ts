import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  History,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

export type AdminUserDetailTab =
  | 'profil'
  | 'aktivite'
  | 'okuma'
  | 'fansub'
  | 'yorumlar'
  | 'sahiplikler'
  | 'moderasyon'

export interface AdminUserDetailTabDefinition {
  value: AdminUserDetailTab
  label: string
  icon: LucideIcon
}

export const ADMIN_USER_DETAIL_TABS: AdminUserDetailTabDefinition[] = [
  { value: 'profil', get label() { return txa('Genel Bakış') }, icon: LayoutDashboard },
  { value: 'aktivite', get label() { return txa('Aktivite') }, icon: Activity },
  { value: 'okuma', get label() { return txa('Okuma') }, icon: BookOpen },
  { value: 'fansub', get label() { return txa('Fansub') }, icon: Building2 },
  { value: 'yorumlar', get label() { return txa('Yorumlar') }, icon: Users },
  { value: 'sahiplikler', get label() { return txa('Sahiplikler') }, icon: BriefcaseBusiness },
  { value: 'moderasyon', get label() { return txa('Moderasyon Geçmişi') }, icon: History },
]
