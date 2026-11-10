import type {
  FansubMemberForManagement,
  FansubMemberRole,
} from '@/services/fansubMembershipService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type InviteDraft = {
  username: string
  note: string
}

export type MemberRoleFilter = 'all' | 'admin' | 'moderator' | 'member'

export const DEFAULT_INVITE_DRAFT: InviteDraft = {
  username: '',
  note: '',
}

export const MEMBER_ROLE_FILTER_OPTIONS: Array<{ value: MemberRoleFilter; label: string }> = [
  { value: 'all', get label() { return txa('Tüm roller') } },
  { value: 'admin', get label() { return txa('Admin') } },
  { value: 'moderator', get label() { return txa('Moderatör') } },
  { value: 'member', get label() { return txa('Üye') } },
]

export const MEMBER_TEAM_TAG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', get label() { return txa('Etiket yok') } },
  { value: 'cevirmen', get label() { return txa('Çevirmen') } },
  { value: 'redaktor', get label() { return txa('Redaktör') } },
  { value: 'dizgici', get label() { return txa('Dizgici') } },
  { value: 'temizleyici', get label() { return txa('Temizleyici') } },
  { value: 'proofreader', get label() { return txa('Proofreader') } },
  { value: 'quality-control', get label() { return txa('Kalite kontrol') } },
  { value: 'uploader', get label() { return txa('Yükleyici') } },
  { value: 'raw-saglayici', get label() { return txa('Raw sağlayıcı') } },
  { value: 'koordinator', get label() { return txa('Koordinatör') } },
]

export function toErrorMessage(error: unknown, fallback = txa('Islem sirasinda hata olustu.')) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export function formatDateTime(value: string | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function getRoleLabel(role: FansubMemberRole | null) {
  if (!role) return txa('Üye değil')
  if (role === 'admin') return txa('Admin')
  if (role === 'moderator') return txa('Moderatör')
  return txa('Üye')
}

export function getRoleBadgeClass(role: FansubMemberRole | 'pending') {
  switch (role) {
    case 'admin':
      return 'bg-amber-500 text-amber-950 border-border'
    case 'moderator':
      return 'bg-blue-300 text-blue-900 border-border'
    case 'member':
      return 'bg-green-300 text-green-900 border-border'
    case 'pending':
      return 'bg-amber-200 text-amber-900 border-border'
    default:
      return 'bg-muted text-foreground border-border'
  }
}

export function getTeamTagLabel(teamTag: string | undefined) {
  if (!teamTag) return txa('Etiket yok')
  return MEMBER_TEAM_TAG_OPTIONS.find((option) => option.value === teamTag)?.label ?? teamTag
}

export function getAvatarFallback(name: string | undefined) {
  const initial = name?.trim().slice(0, 1).toUpperCase()
  return initial || '?'
}

export function buildMemberDraftKey(member: FansubMemberForManagement) {
  return `${member.fansubId}:${member.userId}`
}

export function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR')
}
