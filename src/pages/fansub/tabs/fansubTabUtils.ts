import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { resolveProfileSurfaceImage } from '../../profile/profileMedia'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Shared pure helpers for fansub tabs (v2): cover, relative time, day groups. */

export const DAY_MS = 86_400_000

export const tabCover = (value: string | undefined | null, title: string, width = 240) =>
  resolveProfileSurfaceImage(value, width) || buildCoverPlaceholder(title || txa('Manga'))

export function toTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(time) ? time : null
}

/** "5 min ago", "3 hr ago", "2 days ago"; a date if older than a month. */
export function relativeAgo(value: string | null | undefined) {
  const time = toTime(value)
  if (time === null) return ''
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000))
  if (minutes < 1) return txa('az önce')
  if (minutes < 60) return txa('{v1} dk önce', { v1: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return txa('{v1} sa önce', { v1: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  return new Date(time).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: days > 330 ? 'numeric' : undefined })
}

/** For a future moment "at 18:00", "tomorrow 21:30", "in 3 days". */
export function relativeAhead(value: string | null | undefined) {
  const time = toTime(value)
  if (time === null) return ''
  const date = new Date(time)
  const clock = date.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
  const days = dayDiff(time)
  if (days <= 0) return txa('bugün {v1}', { v1: clock })
  if (days === 1) return txa('yarın {v1}', { v1: clock })
  if (days < 7) return txa('{v1} gün sonra · {v2}', { v1: days, v2: clock })
  return `${date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })} · ${clock}`
}

function startOfDay(time: number) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Calendar day difference from today (future positive, past negative). */
export function dayDiff(time: number) {
  return Math.round((startOfDay(time) - startOfDay(Date.now())) / DAY_MS)
}

export type DayBucket = 'today' | 'yesterday' | 'week' | 'month' | 'older'

export const DAY_BUCKET_LABEL: Record<DayBucket, string> = {
  get today() { return txa('Bugün') },
  get yesterday() { return txa('Dün') },
  get week() { return txa('Bu hafta') },
  get month() { return txa('Bu ay') },
  get older() { return txa('Daha eski') },
}

export function pastBucket(value: string | null | undefined): DayBucket {
  const time = toTime(value)
  if (time === null) return 'older'
  const diff = -dayDiff(time)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return 'week'
  if (diff < 31) return 'month'
  return 'older'
}

/** Splits an ordered list into consecutive groups by key (order kept). */
export function groupInOrder<T, K extends string>(items: T[], keyOf: (item: T) => K) {
  const groups: { key: K, items: T[] }[] = []
  for (const item of items) {
    const key = keyOf(item)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

export function formatChapterNumber(value: number) {
  if (!Number.isFinite(value)) return '?'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export const LEAD_ROLE_PATTERN = /admin|owner|kurucu|lider|sahip|yonetici|yönetici/i

const ROLE_LABEL: Record<string, string> = {
  get owner() { return txa('Kurucu') },
  get admin() { return txa('Yönetici') },
  get moderator() { return txa('Moderatör') },
  get member() { return txa('Üye') },
  get translator() { return txa('Çevirmen') },
  get editor() { return txa('Editör') },
  get cleaner() { return txa('Temizleyici') },
  get typesetter() { return txa('Dizgici') },
  get proofreader() { return txa('Redaktör') },
}

/** Database role key (admin / member ...) to a label; custom roles stay as is. */
export function roleLabel(role: string | null | undefined) {
  const key = (role ?? '').trim()
  if (!key) return txa('Üye')
  return ROLE_LABEL[key.toLowerCase()] ?? key
}
