import type { Chapter } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Chapter list derivation (prototype: Series detail > Chapters tab).
 *
 * WHY A SEPARATE FILE: grouping/filtering used to happen inside JSX in a `.map()`
 * loop, returning `null` for non-matching rows. In that structure
 * "how many chapters matched" was unknown, so neither pagination nor a result
 * count could be built; the list must be derived as data first.
 *
 * WHY PAGINATION: on an 84-chapter series all rows were rendered to the DOM at once.
 * On a mobile-first page that cost is measurable.
 */

export type ChapterSortOrder = 'newest' | 'oldest'

/** Rows shown on first open and on each 'Show more' click. */
export const CHAPTER_PAGE_SIZE = 20

export interface ChapterGroup {
  chapterNumber: number
  /** All versions with the same number (different fansubs). */
  versions: Chapter[]
}

/** Gathers chapters with the same number in one row; rows are sorted by number. */
export function groupChapters(chapters: Chapter[], order: ChapterSortOrder): ChapterGroup[] {
  const byNumber = new Map<number, Chapter[]>()
  for (const chapter of chapters) {
    const existing = byNumber.get(chapter.chapterNumber)
    if (existing) existing.push(chapter)
    else byNumber.set(chapter.chapterNumber, [chapter])
  }

  return [...byNumber.entries()]
    .map(([chapterNumber, versions]) => ({ chapterNumber, versions }))
    .sort((a, b) => (
      order === 'oldest'
        ? a.chapterNumber - b.chapterNumber
        : b.chapterNumber - a.chapterNumber
    ))
}

/**
 * Search: chapter NUMBER or any version's title.
 *
 * An empty query passes every row: `''.includes('')` is true anyway, but
 * we do this on purpose, not by accident.
 */
export function filterChapterGroups(groups: ChapterGroup[], query: string): ChapterGroup[] {
  const normalized = query.trim().toLocaleLowerCase('tr')
  if (!normalized) return groups
  return groups.filter((group) => (
    group.chapterNumber.toString().includes(normalized)
    || group.versions.some((version) => (
      (version.title || '').toLocaleLowerCase('tr').includes(normalized)
    ))
  ))
}

/** "Showing 20 of 84 chapters" / "Showing 84 chapters" */
export function formatChapterFoot(shownCount: number, totalCount: number): string {
  if (totalCount === 0) return ''
  if (shownCount >= totalCount) {
    return totalCount === 1 ? txa('1 bölüm gösteriliyor') : txa('{count} bölüm gösteriliyor', { count: totalCount })
  }
  return txa('{total} bölümün {shown} tanesi gösteriliyor', { total: totalCount, shown: shownCount })
}

export function nextSortOrder(order: ChapterSortOrder): ChapterSortOrder {
  return order === 'newest' ? 'oldest' : 'newest'
}

export function sortOrderLabel(order: ChapterSortOrder): string {
  return order === 'newest' ? txa('Yeni') : txa('Eski')
}

/**
 * Chapter row subtext: "4 hours ago · 2 versions".
 *
 * The prototype uses RELATIVE time, not an ABSOLUTE date, because the question this row answers
 * is "is it new", not "when did it come out". Seeing 20.08.2026 requires
 * remembering today's date.
 *
 * Older than 30 days returns to an absolute date: "412 days ago" is not readable
 * info.
 *
 * `Intl.RelativeTimeFormat` output is localized at runtime; it is not
 * source text.
 */
const RELATIVE_CUTOFF_DAYS = 30

export function formatChapterMeta(createdAt: string, versionCount: number, now = Date.now()): string {
  const parts: string[] = []

  const created = new Date(createdAt)
  if (!Number.isNaN(created.getTime())) {
    const diffMs = created.getTime() - now
    const absMs = Math.abs(diffMs)
    const minuteMs = 60 * 1000
    const hourMs = 60 * minuteMs
    const dayMs = 24 * hourMs

    if (absMs >= RELATIVE_CUTOFF_DAYS * dayMs) {
      parts.push(created.toLocaleDateString(intlLocale()))
    } else {
      const relative = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })
      if (absMs < minuteMs) parts.push(relative.format(Math.round(diffMs / 1000), 'second'))
      else if (absMs < hourMs) parts.push(relative.format(Math.round(diffMs / minuteMs), 'minute'))
      else if (absMs < dayMs) parts.push(relative.format(Math.round(diffMs / hourMs), 'hour'))
      else parts.push(relative.format(Math.round(diffMs / dayMs), 'day'))
    }
  }

  // Tek surumde "1 surum" yazmak bilgi tasimaz; coklukta ise satirdaki
  // secicinin NEDEN orada oldugunu acikliyor.
  if (versionCount > 1) parts.push(txa('{count} sürüm', { count: versionCount }))

  return parts.join(' · ')
}
