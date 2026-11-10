import { supabase } from '../supabase'
import {
  type DbManga,
  MANGA_PUBLIC_SELECT,
  mapDbManga,
} from './shared'

export async function getMangasByFansubId(fansubId: string) {
  const [ownedResult, catalogResult] = await Promise.all([
    supabase
      .from('mangas')
      .select(MANGA_PUBLIC_SELECT)
      .eq('fansub_id', fansubId)
      .eq('is_active', true),
    supabase
      .from('mangas')
      .select(MANGA_PUBLIC_SELECT)
      .eq('is_approved', true)
      .eq('is_active', true),
  ])

  if (ownedResult.error) {
    console.error('[mangaService] getMangasByFansubId owned error', ownedResult.error)
  }
  if (catalogResult.error) {
    console.error('[mangaService] getMangasByFansubId catalog error', catalogResult.error)
  }

  const mergedById = new Map<string, DbManga>()

  ;((catalogResult.data || []) as DbManga[]).forEach((row) => {
    mergedById.set(row.id, row)
  })
  ;((ownedResult.data || []) as DbManga[]).forEach((row) => {
    mergedById.set(row.id, row)
  })

  return Array.from(mergedById.values())
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    .map(mapDbManga)
}
