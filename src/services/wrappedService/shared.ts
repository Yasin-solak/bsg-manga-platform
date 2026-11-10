import type {
  WrappedFansubStat,
  WrappedGenreStat,
  WrappedMangaCard,
  WrappedPeriod,
  WrappedWeekdayActivity,
} from './types'
import { txa } from '@/i18n/activeLocale'

type DbFansubRow = {
  id: string
  name: string
}

type DbMangaRow = {
  id: string
  title: string
  slug: string | null
  cover_image_url: string | null
  genres: string[] | null
  fansub_id: string | null
  fansub?: DbFansubRow | DbFansubRow[] | null
}

export type DbReadingHistoryRow = {
  id: string
  manga_id: string
  chapter_number: number | null
  read_at: string
  manga?: DbMangaRow | DbMangaRow[] | null
}

const WEEKDAY_LABELS = ['Pazar', 'Pzt', 'Sali', 'Cars', 'Pers', 'Cuma', 'Ctes']

export function getSingleRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function toPeriodLabel(period: WrappedPeriod) {
  if (period === '30d') return 'Son 30 Gun'
  if (period === '90d') return 'Son 90 Gun'
  if (period === '365d') return 'Son 365 Gun'
  return 'Tum Zaman'
}

export function toPeriodStartIso(period: WrappedPeriod): string | null {
  if (period === 'all') return null
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export function buildWeekdayActivity(rows: WrappedMangaCard[]): WrappedWeekdayActivity[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  rows.forEach((row) => {
    const parsed = new Date(row.readAt)
    if (Number.isNaN(parsed.getTime())) return
    counts[parsed.getDay()] += 1
  })
  return counts.map((count, dayIndex) => ({
    dayIndex,
    label: WEEKDAY_LABELS[dayIndex],
    count,
  }))
}

export function buildHighlights(input: {
  periodLabel: string
  totalReadMangas: number
  totalFollowedMangas: number
  avgLastChapter: number
  topGenre?: WrappedGenreStat
  topFansub?: WrappedFansubStat
}): string[] {
  const highlights = [] as string[]
  highlights.push(`${input.periodLabel} icinde ${input.totalReadMangas.toLocaleString('tr-TR')} farkli manga okudun.`)
  highlights.push(txa('Takip ettigin seri sayisi: {v1}.', { v1: input.totalFollowedMangas.toLocaleString('tr-TR') }))
  if (input.avgLastChapter > 0) {
    highlights.push(txa('Okudugun serilerde ortalama son bolum seviyesi: {v1}.', { v1: input.avgLastChapter.toFixed(1) }))
  }
  if (input.topGenre) {
    highlights.push(`En cok okudugun tur: ${input.topGenre.genre} (${input.topGenre.count} manga).`)
  }
  if (input.topFansub) {
    highlights.push(`Bu donemde en cok ${input.topFansub.fansubName} cevirilerini okudun.`)
  }
  return highlights
}
