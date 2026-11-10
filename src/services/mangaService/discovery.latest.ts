import type { Manga } from '@/types'
import { getPublicChapterUnlockCutoffIso } from '../premiumPackagePublicService'
import { supabase } from '../supabase'
import {
  CHAPTER_LIST_SELECT,
  type DbLatestChapterRow,
  type DbManga,
  MANGA_PUBLIC_SELECT,
  mapDbManga,
} from './shared'
import { txa } from '@/i18n/activeLocale'

export async function getLatestMangas(limit = 10) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 40) : 10
  const nowIso = await getPublicChapterUnlockCutoffIso()
  const chapterPoolLimit = Math.max(safeLimit * 12, 80)

  const { data: chapterRows, error: chapterError } = await supabase
    .from('chapters')
    .select(CHAPTER_LIST_SELECT)
    .eq('is_approved', true)
    .eq('is_active', true)
    .lte('publish_at', nowIso)
    .order('publish_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(chapterPoolLimit)

  if (chapterError) {
    console.error('[mangaService] getLatestMangas chapter pool error', chapterError)
    return []
  }

  const latestChapterByMangaId = new Map<string, DbLatestChapterRow>()
  ;((chapterRows || []) as DbLatestChapterRow[]).forEach((row) => {
    if (!latestChapterByMangaId.has(row.manga_id)) {
      latestChapterByMangaId.set(row.manga_id, row)
    }
  })

  const rankedMangaIds = Array.from(latestChapterByMangaId.keys()).slice(0, safeLimit)
  let rowsByMangaId = new Map<string, DbManga>()

  if (rankedMangaIds.length > 0) {
    const { data: rankedMangaRows, error: rankedMangaError } = await supabase
      .from('mangas')
      .select(MANGA_PUBLIC_SELECT)
      .in('id', rankedMangaIds)
      .eq('is_approved', true)
      .eq('is_active', true)

    if (rankedMangaError) {
      console.error('[mangaService] getLatestMangas ranked mangas error', rankedMangaError)
      return []
    }

    rowsByMangaId = new Map(
      ((rankedMangaRows || []) as DbManga[]).map((row) => [row.id, row]),
    )
  }

  const latestFromChapters: Manga[] = rankedMangaIds
    .map((mangaId) => {
      const mangaRow = rowsByMangaId.get(mangaId)
      const chapterMeta = latestChapterByMangaId.get(mangaId)
      if (!mangaRow || !chapterMeta) return null
      return {
        ...mapDbManga(mangaRow),
        lastChapter: txa('{v1}. Bolum', { v1: Number(chapterMeta.chapter_number) }),
        lastChapterTitle: chapterMeta.title || undefined,
        updatedAt: chapterMeta.publish_at || chapterMeta.created_at,
      } satisfies Manga
    })
    .filter(Boolean) as Manga[]

  if (latestFromChapters.length >= safeLimit) {
    return latestFromChapters.slice(0, safeLimit)
  }

  const fallbackLimit = Math.max(safeLimit * 2, 20)
  const { data: fallbackMangaRows, error: fallbackError } = await supabase
    .from('mangas')
    .select(MANGA_PUBLIC_SELECT)
    .eq('is_approved', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(fallbackLimit)

  if (fallbackError) {
    console.error('[mangaService] getLatestMangas fallback error', fallbackError)
    return latestFromChapters.slice(0, safeLimit)
  }

  const usedIds = new Set(latestFromChapters.map((item) => item.id))
  const fallbackItems = ((fallbackMangaRows || []) as DbManga[])
    .filter((row) => !usedIds.has(row.id))
    .map(mapDbManga)

  return [...latestFromChapters, ...fallbackItems].slice(0, safeLimit)
}


