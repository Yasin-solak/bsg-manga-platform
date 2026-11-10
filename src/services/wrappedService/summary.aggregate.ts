import {
  buildHighlights,
  buildWeekdayActivity,
  getSingleRelation,
  toPeriodLabel,
  type DbReadingHistoryRow,
} from './shared'
import type {
  WrappedFansubStat,
  WrappedMangaCard,
  WrappedPeriod,
  WrappedSummary,
} from './types'
import type { WrappedSummaryCounts } from './summary.fetch'

export function buildWrappedSummary(
  readingRows: DbReadingHistoryRow[],
  counts: WrappedSummaryCounts,
  period: WrappedPeriod,
): WrappedSummary {
  const periodLabel = toPeriodLabel(period)

  const recentMangas = readingRows.map((row) => {
    const manga = getSingleRelation(row.manga)
    const fansub = getSingleRelation(manga?.fansub)
    return {
      mangaId: row.manga_id,
      title: manga?.title || 'Bilinmeyen Manga',
      slug: manga?.slug || '',
      coverImageUrl: manga?.cover_image_url || undefined,
      chapterNumber: typeof row.chapter_number === 'number' ? row.chapter_number : undefined,
      readAt: row.read_at,
      fansubName: fansub?.name || undefined,
    } satisfies WrappedMangaCard
  })

  const genreMap = new Map<string, number>()
  const fansubMap = new Map<string, WrappedFansubStat>()
  let chapterNumberTotal = 0
  let chapterNumberCount = 0

  readingRows.forEach((row) => {
    const manga = getSingleRelation(row.manga)
    const fansub = getSingleRelation(manga?.fansub)
    const genres = Array.isArray(manga?.genres) ? manga?.genres : []

    genres.forEach((genreRaw) => {
      const genre = String(genreRaw || '').trim()
      if (!genre) return
      genreMap.set(genre, (genreMap.get(genre) || 0) + 1)
    })

    if (fansub?.id) {
      const previous = fansubMap.get(fansub.id)
      if (previous) {
        previous.readCount += 1
      } else {
        fansubMap.set(fansub.id, {
          fansubId: fansub.id,
          fansubName: fansub.name || 'Bilinmeyen Fansub',
          readCount: 1,
        })
      }
    }

    if (typeof row.chapter_number === 'number' && Number.isFinite(row.chapter_number)) {
      chapterNumberTotal += row.chapter_number
      chapterNumberCount += 1
    }
  })

  const topGenres = Array.from(genreMap.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const topFansubs = Array.from(fansubMap.values())
    .sort((a, b) => b.readCount - a.readCount)
    .slice(0, 5)

  const avgLastChapter = chapterNumberCount > 0
    ? Number((chapterNumberTotal / chapterNumberCount).toFixed(1))
    : 0

  return {
    period,
    periodLabel,
    generatedAt: new Date().toISOString(),
    totalReadMangas: recentMangas.length,
    totalFollowedMangas: counts.totalFollowedMangas,
    mangaCommentsCount: counts.mangaCommentsCount,
    avgLastChapter,
    latestReadAt: recentMangas[0]?.readAt,
    topGenres,
    topFansubs,
    recentMangas: recentMangas.slice(0, 8),
    weekdayActivity: buildWeekdayActivity(recentMangas),
    highlights: buildHighlights({
      periodLabel,
      totalReadMangas: recentMangas.length,
      totalFollowedMangas: counts.totalFollowedMangas,
      avgLastChapter,
      topGenre: topGenres[0],
      topFansub: topFansubs[0],
    }),
  }
}
