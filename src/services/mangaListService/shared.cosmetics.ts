import { buildCommunityCardCosmeticMap } from '../communityCosmeticService'
import type { DbMangaListRow } from './shared.types'
import { mapDbMangaListCosmeticRows } from './shared.utils'

export async function loadMangaListCosmeticMap(rows: DbMangaListRow[]) {
  return buildCommunityCardCosmeticMap(mapDbMangaListCosmeticRows(rows))
}
