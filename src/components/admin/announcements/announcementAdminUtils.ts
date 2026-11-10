import { Gift, Mail, Megaphone, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { AdminAnnouncementV2, AnnouncementAdminState } from '@/services/announcementV2'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type AnnouncementRowState = Exclude<AnnouncementAdminState, 'all'>

/** Computed status of a row (same rules as admin_overview on the server). */
export function announcementStateOf(item: AdminAnnouncementV2, now = Date.now()): AnnouncementRowState {
  if (item.deleted_at) return 'deleted'
  if (item.status === 'draft') return 'draft'
  if (item.status === 'archived') return 'archived'
  if (item.ends_at && Date.parse(item.ends_at) <= now) return 'ended'
  if (Date.parse(item.starts_at) > now) return 'scheduled'
  return 'live'
}

export const STATE_META: Record<AnnouncementRowState, { label: string, dot: string, pill: string }> = {
  live: { get label() { return txa('Yayında') }, dot: 'bg-emerald-500', pill: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  scheduled: { get label() { return txa('Planlandı') }, dot: 'bg-sky-500', pill: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  ended: { get label() { return txa('Sona erdi') }, dot: 'bg-muted-foreground/50', pill: 'bg-muted text-muted-foreground' },
  draft: { get label() { return txa('Taslak') }, dot: 'bg-amber-500', pill: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  archived: { get label() { return txa('Arşiv') }, dot: 'bg-muted-foreground/30', pill: 'bg-muted text-muted-foreground' },
  deleted: { get label() { return txa('Çöp kutusu') }, dot: 'bg-rose-500', pill: 'bg-rose-500/12 text-rose-700 dark:text-rose-300' },
}

export const KIND_ICON: Record<AdminAnnouncementV2['kind'], LucideIcon> = {
  news: Megaphone,
  system: ShieldCheck,
  reward: Gift,
  invitation: Mail,
}

export const PRIORITY_LABEL = (priority: number) => (priority >= 10 ? txa('En üstte sabit') : priority >= 5 ? txa('Öne çıkarılmış') : txa('Normal'))

function toTimestamp(value?: string | null) {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

/** "9 Tem 2026 23:18" */
export function formatAnnouncementDate(value?: string | null) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  return new Date(ts).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "9 Tem" (yil farkliysa yil da) */
export function shortAnnouncementDate(value?: string | null, now = Date.now()) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(intlLocale(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
