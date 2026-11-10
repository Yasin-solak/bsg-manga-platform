import { intlLocale, txa } from '@/i18n/activeLocale'
import type { AdminUserInventoryItem } from '@/services/adminUserService'

export type SocialLinkViewItem = {
  label: string
  href?: string
}

export const cardBase = 'flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5'
export const kvGrid = 'grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5'
export const listRowBase = 'flex items-center gap-2 rounded-md border border-border/60 bg-card/90 p-1.5'
export const listRowTextOnly = 'flex items-start gap-2 rounded-md border border-border/60 bg-card/90 p-1.5'
export const listRowContent = 'flex min-w-0 flex-col gap-0.5'
export const listRowStrong = 'text-xs font-medium leading-tight text-foreground break-words'
export const listRowSpan = 'text-[11px] leading-tight text-muted-foreground break-words'
export const emptyText = 'text-sm text-muted-foreground'
export const noteText = 'mt-0.5 text-[11px] leading-tight text-muted-foreground'

export function formatDateTime(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString(intlLocale())
}

export function roleLabel(role: 'user' | 'moderator' | 'admin') {
  if (role === 'admin') return txa('Admin')
  if (role === 'moderator') return txa('Moderator')
  return txa('Kullanici')
}

export function fansubRoleLabel(role: 'admin' | 'moderator' | 'member') {
  if (role === 'admin') return txa('Fansub Admin')
  if (role === 'moderator') return txa('Fansub Moderator')
  return txa('Uye')
}

export function membershipExitReasonLabel(reason: 'active' | 'leave' | 'removed' | 'admin_transfer_exit' | 'fansub_deactivated') {
  if (reason === 'active') return txa('Halen aktif')
  if (reason === 'leave') return txa('Kendi ayrildi')
  if (reason === 'removed') return txa('Ekipten cikartildi')
  if (reason === 'admin_transfer_exit') return txa('Admin devir cikisi')
  return txa('Fansub pasiflestigi icin')
}

export function toErrorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export type InventoryBlockProps = {
  title: string
  items: AdminUserInventoryItem[]
}
