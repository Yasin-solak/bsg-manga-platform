import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { buildCoverPlaceholder as buildLocalCoverPlaceholder } from '@/lib/coverPlaceholder'
import type { ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { intlLocale } from '@/i18n/activeLocale'

export type CalendarReminder = {
  id: string
  text: string
  createdAt: string
  scope?: 'chapter' | 'next_chapter'
  chapterId?: string
  mangaId?: string
}

const TIME_FORMATTER = new Intl.DateTimeFormat(intlLocale(), {
  hour: '2-digit',
  minute: '2-digit',
})

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function entryDateKey(entry: ReleaseScheduleEntry) {
  const date = new Date(entry.publishAt)
  return Number.isNaN(date.getTime()) ? 'invalid' : toDateKey(date)
}

export function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--:--' : TIME_FORMATTER.format(date)
}

export function formatChapterNumber(value: number) {
  if (!Number.isFinite(value)) return '?'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** A published chapter goes to the reader, an unopened one to the series page. */
export function getEntryDestination(entry: ReleaseScheduleEntry) {
  if (entry.isUpcoming) {
    return buildPublicMangaPath({
      id: entry.mangaId,
      slug: entry.mangaSlug,
      title: entry.mangaTitle,
    })
  }

  return buildPublicChapterPath({
    mangaId: entry.mangaId,
    mangaSlug: entry.mangaSlug,
    mangaTitle: entry.mangaTitle,
    chapterNumber: entry.chapterNumber,
    chapterId: entry.chapterId,
    fansubId: entry.fansubId,
    fansubSlug: entry.fansubSlug,
  })
}

export function buildCoverPlaceholder(title: string) {
  return buildLocalCoverPlaceholder(title)
}
