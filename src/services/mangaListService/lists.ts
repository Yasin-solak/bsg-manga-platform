import { supabase } from '../supabase'
import { getBlockedUserIds } from '../userService/blocks'
import {
  DbMangaListItemRow,
  DbMangaListRow,
  DbTopMangaListRow,
  getCurrentPublicUserId,
  loadMangaListCosmeticMap,
  MANGA_LIST_SELECT,
  mapDbMangaListRow,
  mapDbTopMangaListRow,
  normalizeMangaListCategoryId,
} from './shared'
import type { MangaListPeriod, MangaListSort, MangaListSummary } from './types'

function sanitizeListSearchTerm(value: string) {
  return value.trim().replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

async function loadMangaListPreviewImageMap(listIds: string[]) {
  const uniqueIds = [...new Set(listIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Map<string, string[]>()

  const { data, error } = await supabase
    .from('user_manga_list_items')
    .select(`
      list_id,
      position,
      mangas:manga_id (
        id,
        title,
        slug,
        cover_image_url,
        rating,
        total_views
      )
    `)
    .in('list_id', uniqueIds)
    .order('position', { ascending: true })

  if (error) {
    console.error('[mangaListService] loadMangaListPreviewImageMap error', error)
    return new Map<string, string[]>()
  }

  const previewMap = new Map<string, string[]>()
  const rowsByList = new Map<string, DbMangaListItemRow[]>()
  ;((data || []) as DbMangaListItemRow[]).forEach((row) => {
    if (!row.list_id) return
    rowsByList.set(row.list_id, [...(rowsByList.get(row.list_id) || []), row])
  })

  rowsByList.forEach((rows, listId) => {
    const images = rows
      .map((row) => {
        const manga = Array.isArray(row.mangas) ? row.mangas[0] : row.mangas
        return {
          image: manga?.cover_image_url || '',
          rating: Number(manga?.rating || 0),
          views: Number(manga?.total_views || 0),
          position: Number(row.position || 0),
        }
      })
      .filter((entry) => entry.image)
      .sort((left, right) => {
        const popularityDiff = right.rating * 1000 + right.views - (left.rating * 1000 + left.views)
        return popularityDiff || left.position - right.position
      })
      .map((entry) => entry.image)
      .filter((image, index, all) => all.indexOf(image) === index)
      .slice(0, 3)

    previewMap.set(listId, images)
  })

  return previewMap
}

function attachPreviewImages(
  summaries: MangaListSummary[],
  previewMap: Map<string, string[]>,
) {
  return summaries.map((summary) => {
    const images = previewMap.get(summary.id) || []
    const merged = [...images, ...(summary.coverImage ? [summary.coverImage] : [])]
      .filter((image, index, all) => image && all.indexOf(image) === index)
      .slice(0, 3)

    return {
      ...summary,
      previewImages: merged,
      coverImage: summary.coverImage || merged[0],
    }
  })
}

export async function listPublicMangaLists(options: {
  sort?: MangaListSort
  page?: number
  limit?: number
  search?: string
  ownerIds?: string[]
  categoryId?: string
} = {}) {
  const sort = options.sort || 'newest'
  const page = Number.isFinite(options.page) && (options.page || 0) > 0 ? Number(options.page) : 1
  const limit = Number.isFinite(options.limit) ? Math.min(Math.max(Number(options.limit), 1), 30) : 12
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('user_manga_lists')
    .select(MANGA_LIST_SELECT, { count: 'exact' })
    .eq('is_public', true)
    .range(from, to)

  const ownerIds = [...new Set(options.ownerIds || [])].filter(Boolean)
  if (ownerIds.length > 0) {
    query = query.in('owner_id', ownerIds)
  }

  if (options.categoryId && options.categoryId !== 'all') {
    query = query.eq('category_id', normalizeMangaListCategoryId(options.categoryId))
  }

  const searchTerm = sanitizeListSearchTerm(options.search || '')
  if (searchTerm.length >= 2) {
    query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
  }

  if (sort === 'top_rated') {
    query = query
      .order('rating_avg', { ascending: false })
      .order('ratings_count', { ascending: false })
      .order('created_at', { ascending: false })
  } else if (sort === 'most_commented') {
    query = query
      .order('comments_count', { ascending: false })
      .order('created_at', { ascending: false })
  } else if (sort === 'recently_updated') {
    query = query
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[mangaListService] listPublicMangaLists error', error)
    return { data: [], count: 0 }
  }

  const blockedUserIds = new Set(await getBlockedUserIds())
  const typedRows = ((data || []) as DbMangaListRow[]).filter((row) => !blockedUserIds.has(row.owner_id))
  const cosmeticMap = await loadMangaListCosmeticMap(typedRows)
  const summaries = typedRows.map((row) => mapDbMangaListRow(row, cosmeticMap.get(row.id)))
  const previewMap = await loadMangaListPreviewImageMap(summaries.map((item) => item.id))

  return {
    data: attachPreviewImages(summaries, previewMap),
    count: count ?? typedRows.length,
  }
}

export async function listTopMangaListsByPeriod(
  period: MangaListPeriod = 'weekly',
  limit = 5,
) {
  const normalizedPeriod: MangaListPeriod = period === 'monthly' ? 'monthly' : 'weekly'
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 12) : 5

  const { data, error } = await supabase.rpc('get_top_user_manga_lists', {
    p_period: normalizedPeriod,
    p_limit: safeLimit,
  })

  if (error) {
    console.error('[mangaListService] listTopMangaListsByPeriod error', error)
    return []
  }

  const blockedUserIds = new Set(await getBlockedUserIds())
  const summaries = ((data || []) as DbTopMangaListRow[])
    .filter((row) => !blockedUserIds.has(row.owner_id))
    .map(mapDbTopMangaListRow)
  const previewMap = await loadMangaListPreviewImageMap(summaries.map((item) => item.id))

  return attachPreviewImages(summaries, previewMap)
}

export async function listUserMangaListsByOwner(
  ownerId: string,
  options: {
    includePrivate?: boolean
    limit?: number
  } = {},
) {
  const blockedUserIds = new Set(await getBlockedUserIds())
  if (blockedUserIds.has(ownerId) && !options.includePrivate) {
    return []
  }

  const includePrivate = options.includePrivate === true
  const limit = Number.isFinite(options.limit)
    ? Math.min(Math.max(Number(options.limit), 1), 40)
    : 20

  let query = supabase
    .from('user_manga_lists')
    .select(MANGA_LIST_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!includePrivate) {
    query = query.eq('is_public', true)
  }

  const { data, error } = await query
  if (error) {
    console.error('[mangaListService] listUserMangaListsByOwner error', error)
    return []
  }

  const typedRows = (data || []) as DbMangaListRow[]
  const cosmeticMap = await loadMangaListCosmeticMap(typedRows)
  const summaries = typedRows.map((row) => mapDbMangaListRow(row, cosmeticMap.get(row.id)))
  const previewMap = await loadMangaListPreviewImageMap(summaries.map((item) => item.id))
  return attachPreviewImages(summaries, previewMap)
}

export async function listMyMangaLists(options: { limit?: number } = {}) {
  const currentUserId = await getCurrentPublicUserId()
  if (!currentUserId) return []

  return listUserMangaListsByOwner(currentUserId, {
    includePrivate: true,
    limit: options.limit,
  })
}

export async function listFollowedCreatorMangaLists(options: { limit?: number } = {}) {
  const currentUserId = await getCurrentPublicUserId()
  if (!currentUserId) return []

  const { data, error } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', currentUserId)
    .limit(80)

  if (error) {
    console.error('[mangaListService] listFollowedCreatorMangaLists follows error', error)
    return []
  }

  const followedUserIds = [...new Set((data || []).map((row) => row.following_id).filter(Boolean))]
  if (followedUserIds.length === 0) return []

  const result = await listPublicMangaLists({
    sort: 'recently_updated',
    limit: options.limit || 12,
    ownerIds: followedUserIds,
  })

  return result.data
}

export async function listRatedMangaLists(options: { limit?: number } = {}) {
  const currentUserId = await getCurrentPublicUserId()
  if (!currentUserId) return []

  const limit = Number.isFinite(options.limit)
    ? Math.min(Math.max(Number(options.limit), 1), 30)
    : 12

  const { data, error } = await supabase
    .from('user_manga_list_ratings')
    .select(`
      updated_at,
      user_manga_lists:list_id (
        ${MANGA_LIST_SELECT}
      )
    `)
    .eq('user_id', currentUserId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[mangaListService] listRatedMangaLists error', error)
    return []
  }

  const blockedUserIds = new Set(await getBlockedUserIds())
  const typedRows = ((data || []) as Array<{ user_manga_lists?: DbMangaListRow | DbMangaListRow[] | null }>)
    .map((row) => Array.isArray(row.user_manga_lists) ? row.user_manga_lists[0] : row.user_manga_lists)
    .filter((row): row is DbMangaListRow => Boolean(row?.id))
    .filter((row) => row.is_public || row.owner_id === currentUserId)
    .filter((row) => !blockedUserIds.has(row.owner_id))

  const cosmeticMap = await loadMangaListCosmeticMap(typedRows)
  const summaries = typedRows.map((row) => mapDbMangaListRow(row, cosmeticMap.get(row.id)))
  const previewMap = await loadMangaListPreviewImageMap(summaries.map((item) => item.id))
  return attachPreviewImages(summaries, previewMap)
}
