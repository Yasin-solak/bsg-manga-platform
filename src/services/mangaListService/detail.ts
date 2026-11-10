import { supabase } from '../supabase'
import {
  buildMangaListDetail,
  DbMangaListItemRow,
  DbMangaListRow,
  getCurrentPublicUserId,
  loadMangaListCosmeticMap,
  MANGA_LIST_ITEM_SELECT,
  MANGA_LIST_SELECT,
  mapDbMangaListItemRow,
} from './shared'
import { getE2EMockMangaListDetail } from '@/testing/e2eMocks'
import type { MangaListDetail, MangaListItem } from './types'

export async function getMangaListDetail(listId: string): Promise<MangaListDetail | null> {
  const e2eDetail = getE2EMockMangaListDetail(listId)
  if (e2eDetail) return e2eDetail

  const { data: listRow, error: listError } = await supabase
    .from('user_manga_lists')
    .select(MANGA_LIST_SELECT)
    .eq('id', listId)
    .maybeSingle<DbMangaListRow>()

  if (listError) {
    console.error('[mangaListService] getMangaListDetail list error', listError)
    return null
  }

  if (!listRow) return null

  const [{ data: itemRows, error: itemError }, currentUserId] = await Promise.all([
    supabase
      .from('user_manga_list_items')
      .select(MANGA_LIST_ITEM_SELECT)
      .eq('list_id', listId)
      .order('position', { ascending: true }),
    getCurrentPublicUserId(),
  ])

  if (itemError) {
    console.error('[mangaListService] getMangaListDetail items error', itemError)
  }

  let myRating: number | null = null
  if (currentUserId) {
    const { data: ratingRow, error: ratingError } = await supabase
      .from('user_manga_list_ratings')
      .select('rating')
      .eq('list_id', listId)
      .eq('user_id', currentUserId)
      .maybeSingle<{ rating: number }>()

    if (ratingError) {
      console.error('[mangaListService] getMangaListDetail my rating error', ratingError)
    } else {
      myRating = Number.isFinite(Number(ratingRow?.rating)) ? Number(ratingRow?.rating) : null
    }
  }

  const cosmeticMap = await loadMangaListCosmeticMap([listRow])
  const items = ((itemRows || []) as DbMangaListItemRow[])
    .map(mapDbMangaListItemRow)
    .filter(Boolean) as MangaListItem[]

  return buildMangaListDetail(
    listRow,
    items,
    myRating,
    Boolean(currentUserId && currentUserId === listRow.owner_id),
    cosmeticMap.get(listRow.id),
  )
}
