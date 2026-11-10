import type {
  AdminMangaChapterBrief,
  AdminMangaChapterStats,
  AdminMangaControlItem,
} from '@/services/adminService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const MANGAS_PER_PAGE = 20

export function errText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return txa(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return txa(message)
  }
  return fallback
}

export function dateText(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize))
}

export function statusText(status: AdminMangaControlItem['status']) {
  if (status === 'ongoing') return txa('Devam ediyor')
  if (status === 'completed') return txa('Tamamlandı')
  if (status === 'hiatus') return txa('Ara verdi')
  return txa('Durum belirsiz')
}

export const STATUS_OPTIONS: Array<['ongoing' | 'completed' | 'hiatus', string]> = [
  ['ongoing', 'Devam ediyor'],
  ['completed', 'Tamamlandı'],
  ['hiatus', 'Ara verdi'],
]

export const SERIES_TYPE_LABEL: Record<AdminMangaControlItem['seriesType'], string> = {
  get manga() { return txa('Manga') },
  get manhwa() { return txa('Manhwa') },
  get manhua() { return txa('Manhua') },
  get webtoon() { return txa('Webtoon') },
  get yerli() { return txa('Yerli') },
}

/** Details gaps that break card and SEO surfaces (same measure as the Missing details view). */
export function mangaMissingMeta(manga: Pick<AdminMangaControlItem, 'coverImageUrl' | 'genres' | 'description'>) {
  return [
    !manga.coverImageUrl ? 'kapak' : null,
    manga.genres.length === 0 ? txa('tür') : null,
    !manga.description?.trim() ? txa('açıklama') : null,
  ].filter((item): item is string => Boolean(item))
}

/** "3 hr", "12 days", or a short date when older. */
export function mangaRelativeAge(value?: string | null, now = Date.now()) {
  const ts = value ? Date.parse(value) : Number.NaN
  if (Number.isNaN(ts)) return '—'
  const minutes = Math.max(0, Math.floor((now - ts) / 60_000))
  if (minutes < 60) return txa('{v1} dk önce', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa önce', { v1: hours })
  const days = Math.floor(hours / 24)
  if (days <= 30) return txa('{v1} gün önce', { v1: days })
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(intlLocale(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function chapterStatsFromChapters(chapters: AdminMangaChapterBrief[]): AdminMangaChapterStats {
  return chapters.reduce(
    (acc, chapter) => {
      acc.total += 1
      if (chapter.isApproved) acc.approved += 1
      else acc.pending += 1
      if (chapter.isActive) acc.active += 1
      return acc
    },
    { total: 0, approved: 0, pending: 0, active: 0 },
  )
}

export function normalizeGenre(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 42)
}

export function toDateTimeLocalValue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export interface MangaPageSummary {
  approved: number
  pending: number
  active: number
  inactive: number
  chapterTotal: number
}
