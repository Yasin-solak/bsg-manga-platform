import type {
  DbReadingHistoryRow,
} from './shared.db'
import type {
  AdminUserTopChapter,
  AdminUserTopManga,
} from '../adminUserTypes'
import { getRelationOne, TOP_READ_LIMIT } from './shared.utils'

export function buildFavoriteGenres(rows: DbReadingHistoryRow[]) {
  const genreCounts = new Map<string, number>()
  rows.forEach((row) => {
    const manga = getRelationOne(row.manga)
    const genres = Array.isArray(manga?.genres) ? manga.genres : []
    genres.forEach((genre) => {
      const normalized = (genre || '').trim()
      if (!normalized) return
      genreCounts.set(normalized, (genreCounts.get(normalized) || 0) + 1)
    })
  })

  const total = Array.from(genreCounts.values()).reduce((acc, value) => acc + value, 0)
  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_READ_LIMIT)
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
}

export function buildTopMangas(rows: DbReadingHistoryRow[]) {
  const map = new Map<string, AdminUserTopManga>()
  rows.forEach((row) => {
    const manga = getRelationOne(row.manga)
    if (!manga) return
    const current = map.get(row.manga_id)
    if (!current) {
      map.set(row.manga_id, {
        mangaId: row.manga_id,
        mangaTitle: manga.title,
        mangaCoverUrl: manga.cover_image_url || undefined,
        readCount: 1,
        lastReadAt: row.read_at,
        lastChapterNumber: row.chapter_number ?? undefined,
      })
      return
    }

    current.readCount += 1
    if (new Date(row.read_at).getTime() > new Date(current.lastReadAt).getTime()) {
      current.lastReadAt = row.read_at
      current.lastChapterNumber = row.chapter_number ?? current.lastChapterNumber
    }
  })

  return Array.from(map.values())
    .sort((a, b) => {
      if (b.readCount !== a.readCount) return b.readCount - a.readCount
      return new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime()
    })
    .slice(0, TOP_READ_LIMIT)
}

export function buildTopChapters(rows: DbReadingHistoryRow[]) {
  const map = new Map<string, AdminUserTopChapter>()
  rows.forEach((row) => {
    const manga = getRelationOne(row.manga)
    if (!manga) return
    const chapter = getRelationOne(row.chapter)
    const fallbackKey = `${row.manga_id}:${row.chapter_number ?? 'na'}`
    const key = row.chapter_id || fallbackKey
    const current = map.get(key)

    if (!current) {
      map.set(key, {
        key,
        mangaId: row.manga_id,
        mangaTitle: manga.title,
        mangaCoverUrl: manga.cover_image_url || undefined,
        chapterId: row.chapter_id || undefined,
        chapterTitle: chapter?.title || undefined,
        chapterNumber: (chapter?.chapter_number ?? row.chapter_number) ?? undefined,
        readCount: 1,
        lastReadAt: row.read_at,
      })
      return
    }

    current.readCount += 1
    if (new Date(row.read_at).getTime() > new Date(current.lastReadAt).getTime()) {
      current.lastReadAt = row.read_at
    }
  })

  return Array.from(map.values())
    .sort((a, b) => {
      if (b.readCount !== a.readCount) return b.readCount - a.readCount
      return new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime()
    })
    .slice(0, TOP_READ_LIMIT)
}
