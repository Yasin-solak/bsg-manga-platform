import { loadMangaLiteByIds } from '../mangaLiteDirectory'
import { supabase } from '../supabase'
import {
  type HomeDiscussionRpcResult,
  mapDiscussionChapter,
  mapDiscussionManga,
} from './shared'
import type { HomeDiscussionHighlightsData } from './types'

export async function getHomeDiscussionHighlights(params: {
  mangaLimit?: number
  chapterLimit?: number
  windowDays?: number
} = {}): Promise<HomeDiscussionHighlightsData> {
  const {
    mangaLimit = 6,
    chapterLimit = 6,
    windowDays = 14,
  } = params

  const { data, error } = await supabase.rpc('get_home_discussion_highlights', {
    p_manga_limit: mangaLimit,
    p_chapter_limit: chapterLimit,
    p_window_days: windowDays,
  })

  if (error) {
    throw error
  }

  const payload = (data || {}) as HomeDiscussionRpcResult
  const resolvedWindowDays = Number(payload.window_days || windowDays || 14)
  const topMangas = (payload.top_mangas || []).map(mapDiscussionManga)
  const topChapters = (payload.top_chapters || []).map(mapDiscussionChapter)
  const mangaLiteMap = await loadMangaLiteByIds([
    ...topMangas.map((entry) => entry.mangaId),
    ...topChapters.map((entry) => entry.mangaId),
  ])

  return {
    windowDays: Number.isFinite(resolvedWindowDays) ? resolvedWindowDays : 14,
    topMangas: topMangas.map((entry) => ({
      ...entry,
      mangaSlug: entry.mangaSlug || mangaLiteMap.get(entry.mangaId)?.slug,
    })),
    topChapters: topChapters.map((entry) => ({
      ...entry,
      mangaSlug: entry.mangaSlug || mangaLiteMap.get(entry.mangaId)?.slug,
    })),
  }
}
