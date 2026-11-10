import { z } from 'zod'
import { withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { getBlockedUserIds } from './userService/blocks'
import { MANGA_LIST_SELECT, mapDbMangaListRow, type DbMangaListRow } from './mangaListService/shared'
import { txa } from '@/i18n/activeLocale'

const idSchema = z.string().uuid()

/** Reads follow status in bulk for visible series only, instead of a query per card. */
export async function getExploreFollowedIds(userId: string, mangaIds: string[], signal: AbortSignal) {
  const ids = z.array(idSchema).max(60).parse(mangaIds)
  if (!ids.length) return []
  const { data, error } = await withServiceTimeout(requestSignal => supabase.from('manga_follows').select('manga_id')
    .eq('user_id', idSchema.parse(userId)).in('manga_id', ids).abortSignal(requestSignal), { signal, label: 'Keşfet takip durumu' })
  if (error) throw error
  return (data || []).map(row => row.manga_id as string)
}

/** Loads four public covers for the showcase without downloading list contents and cosmetics. */
export async function getExploreLists(signal: AbortSignal) {
  const blocked = new Set(await withServiceTimeout(() => getBlockedUserIds(), { signal, label: txa('Engellenen kullanıcılar') }))
  const { data, error } = await withServiceTimeout(requestSignal => supabase.from('user_manga_lists').select(MANGA_LIST_SELECT)
    .eq('is_public', true).gt('items_count', 0)
    .order('rating_avg', { ascending: false }).order('ratings_count', { ascending: false })
    .order('id', { ascending: true }).limit(8).abortSignal(requestSignal), { signal, label: 'Keşfet listeleri' })
  if (error) throw error
  return ((data || []) as unknown as DbMangaListRow[])
    .filter(row => !blocked.has(row.owner_id)).slice(0, 4).map(row => mapDbMangaListRow(row))
}

/** Chapter 1 is not assumed; the earliest published version is found with a one-row query. */
export async function getExploreFirstChapter(mangaId: string, signal: AbortSignal) {
  const { data, error } = await withServiceTimeout(requestSignal => supabase.from('chapters')
    .select('id,chapter_number,fansub_id,manga:manga_id!inner(id,is_active,is_approved)')
    .eq('manga_id', idSchema.parse(mangaId)).eq('is_active', true).eq('is_approved', true)
    .eq('manga.is_active', true).eq('manga.is_approved', true)
    .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`)
    .order('chapter_number', { ascending: true }).order('created_at', { ascending: true })
    .limit(1).abortSignal(requestSignal).maybeSingle(), { signal, label: txa('İlk bölüm') })
  if (error) throw error
  return data
}
