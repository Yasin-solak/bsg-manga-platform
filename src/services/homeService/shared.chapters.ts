import type { Manga } from '@/types'
import { getPublicChapterUnlockCutoffIso } from '../premiumPackagePublicService'
import { supabase } from '../supabase'
import type { DbHomeChapterLastRow } from './shared.types'
import { txa } from '@/i18n/activeLocale'

export async function resolvePublicLastChapterByMangaIds(mangaIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = Array.from(new Set((mangaIds || []).filter(Boolean)))
  const chapterMap = new Map<string, number>()
  if (uniqueIds.length === 0) return chapterMap

  const nowIso = await getPublicChapterUnlockCutoffIso()
  const { data, error } = await supabase
    .from('chapters')
    .select('manga_id, chapter_number')
    .in('manga_id', uniqueIds)
    .eq('is_approved', true)
    .eq('is_active', true)
    .lte('publish_at', nowIso)
    .order('chapter_number', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[homeService] resolvePublicLastChapterByMangaIds error', error)
    return chapterMap
  }

  ;((data || []) as DbHomeChapterLastRow[]).forEach((row) => {
    if (!chapterMap.has(row.manga_id)) {
      chapterMap.set(row.manga_id, Number(row.chapter_number))
    }
  })

  return chapterMap
}

export function applyLastChapterFallback(items: Manga[], chapterMap: Map<string, number>): Manga[] {
  return items.map((item) => {
    if (item.lastChapter) return item
    const chapterNumber = chapterMap.get(item.id)
    if (chapterNumber == null) return item
    return {
      ...item,
      lastChapter: txa('{v1}. Bolum', { v1: chapterNumber }),
    }
  })
}


