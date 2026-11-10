import type { Chapter, ChapterFansub } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * 'Translating teams' derivation (prototype: Series detail > Details tab).
 *
 * WHY WE DERIVE: the manga table has NO field for "who translates this series" and
 * should not: per [[manga-chapter-ownership-model]] manga is a shared
 * catalog and the permission key is the fansub UPLOADING the chapter (chapters.fansub_id).
 * So the only correct source for the team list is the chapters themselves. A separate
 * column would create a second truth lying whenever a chapter is deleted/moved.
 *
 * "MAIN TEAM" = the team uploading the MOST chapters. On a tie the FIRST uploader wins
 * (the team that started the series). This definition is measurable; an approval mechanism like
 * "official team" does NOT exist in the schema and we do not invent it.
 *
 * DELIBERATE DIFFERENCE FROM THE PROTOTYPE: no VERIFIED TICK. The `fansubs`
 * table has no `is_verified` (or an equivalent badge); ticking every team or
 * none would both be a meaningless surface.
 */

export interface MangaTranslationTeam {
  fansub: ChapterFansub
  /** Chapters this team uploaded in this series. */
  chapterCount: number
  /** Ekibin toplam icindeki payi (0-1); ilerleme cubugunun genisligi. */
  share: number
  /** Latest upload time (ISO). */
  lastUploadAt: string
  /** The team uploading the most chapters. */
  isMain: boolean
}

export function deriveTranslationTeams(chapters: Chapter[]): MangaTranslationTeam[] {
  const buckets = new Map<string, {
    fansub: ChapterFansub
    chapterCount: number
    firstUploadAt: number
    lastUploadAt: number
  }>()

  for (const chapter of chapters) {
    const fansub = chapter.fansub
    if (!fansub?.id) continue
    const createdAt = new Date(chapter.createdAt).getTime()
    const safeCreatedAt = Number.isFinite(createdAt) ? createdAt : 0
    const existing = buckets.get(fansub.id)
    if (existing) {
      existing.chapterCount += 1
      existing.firstUploadAt = Math.min(existing.firstUploadAt, safeCreatedAt)
      existing.lastUploadAt = Math.max(existing.lastUploadAt, safeCreatedAt)
      continue
    }
    buckets.set(fansub.id, {
      fansub,
      chapterCount: 1,
      firstUploadAt: safeCreatedAt,
      lastUploadAt: safeCreatedAt,
    })
  }

  const rows = [...buckets.values()]
  if (rows.length === 0) return []

  const total = rows.reduce((sum, row) => sum + row.chapterCount, 0)
  const sorted = rows.sort((a, b) => (
    b.chapterCount - a.chapterCount || a.firstUploadAt - b.firstUploadAt
  ))

  return sorted.map((row, index) => ({
    fansub: row.fansub,
    chapterCount: row.chapterCount,
    // total is always > 0: if rows is not empty, at least one chapter was counted.
    share: row.chapterCount / total,
    lastUploadAt: new Date(row.lastUploadAt).toISOString(),
    isMain: index === 0,
  }))
}

/** "12 chapters · last upload 14 Aug 2026" */
export function formatTeamMeta(team: MangaTranslationTeam): string {
  const uploaded = new Date(team.lastUploadAt)
  if (Number.isNaN(uploaded.getTime())) return txa('{count} bölüm', { count: team.chapterCount })
  const date = uploaded.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
  return txa('{count} bölüm · son yükleme {date}', { count: team.chapterCount, date })
}
