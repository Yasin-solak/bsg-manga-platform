import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  MangaListRatingResponse,
  normalizeMangaListPayload,
} from './shared'

const mangaListMutationsLogger = createScopedLogger('mangaListService/mutations')

export async function createMangaList(payload: {
  title: string
  description?: string
  isPublic?: boolean
  categoryId?: string
  mangaIds: string[]
  itemNotes?: Record<string, string>
}) {
  const requestContext = createRequestContext('mangaListService/mutations', 'createMangaList', {
    mangaCount: payload.mangaIds.length,
  })
  const {
    normalizedTitle,
    normalizedDescription,
    normalizedCategoryId,
    normalizedIds,
    normalizedNotes,
  } = normalizeMangaListPayload(payload)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('create_user_manga_list', {
        p_title: normalizedTitle,
        p_description: normalizedDescription,
        p_is_public: payload.isPublic !== false,
        p_category_id: normalizedCategoryId,
        p_manga_ids: normalizedIds,
      }),
      signal,
    ),
    { label: 'mangaListService.createMangaList' },
  )

  if (error || !data) {
    mangaListMutationsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Liste olusturulamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error || new Error('Liste olusturulamadi.')
  }

  const listId = String(data)
  const noteEntries = Object.entries(normalizedNotes)
  if (noteEntries.length === 0) return listId

  const { data: itemRows, error: itemRowsError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('user_manga_list_items')
        .select('id, manga_id')
        .eq('list_id', listId),
      signal,
    ),
    { label: 'mangaListService.createMangaList.itemRows' },
  )

  if (itemRowsError) {
    mangaListMutationsLogger.warn({
      event: requestContext.event,
      message: toUserFacingErrorMessage(itemRowsError, 'Liste not satirlari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext, { listId }),
      error: itemRowsError,
    })
    return listId
  }

  const noteMap = new Map(noteEntries)
  const rows = (itemRows || []) as Array<{ id: string; manga_id: string }>
  for (const row of rows) {
    const note = noteMap.get(row.manga_id)
    if (!note) continue

    const { error: noteError } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('user_manga_list_items')
          .update({ note })
          .eq('id', row.id),
        signal,
      ),
      { label: 'mangaListService.createMangaList.noteUpdate' },
    )

    if (noteError) {
      mangaListMutationsLogger.warn({
        event: requestContext.event,
        message: toUserFacingErrorMessage(noteError, 'Liste notu guncellenemedi.'),
        context: toRequestContextLogContext(requestContext, { listId, itemId: row.id }),
        error: noteError,
      })
    }
  }

  return listId
}

export async function updateMangaList(
  listId: string,
  payload: {
    title: string
    description?: string
    isPublic?: boolean
    categoryId?: string
    mangaIds: string[]
    itemNotes?: Record<string, string>
  },
) {
  const requestContext = createRequestContext('mangaListService/mutations', 'updateMangaList', {
    listId,
    mangaCount: payload.mangaIds.length,
  })
  const {
    normalizedTitle,
    normalizedDescription,
    normalizedCategoryId,
    normalizedIds,
    normalizedNotes,
  } = normalizeMangaListPayload(payload)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('update_user_manga_list', {
        p_list_id: listId,
        p_title: normalizedTitle,
        p_description: normalizedDescription,
        p_is_public: payload.isPublic !== false,
        p_category_id: normalizedCategoryId,
        p_manga_ids: normalizedIds,
        p_item_notes: normalizedNotes,
      }),
      signal,
    ),
    { label: 'mangaListService.updateMangaList' },
  )

  if (error || !data) {
    mangaListMutationsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Liste guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error || new Error('Liste guncellenemedi.')
  }

  return String(data)
}

export async function setMangaListRating(listId: string, rating: number) {
  const requestContext = createRequestContext('mangaListService/mutations', 'setMangaListRating', {
    listId,
    rating,
  })
  const normalized = Math.max(1, Math.min(5, Math.round(rating)))
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_user_manga_list_rating', {
        p_list_id: listId,
        p_rating: normalized,
      }),
      signal,
    ),
    { label: 'mangaListService.setMangaListRating' },
  )

  if (error || !data) {
    mangaListMutationsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Liste puani kaydedilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error || new Error('Liste puani kaydedilemedi.')
  }

  const row = data as MangaListRatingResponse
  return {
    ratingAvg: Number(row.rating_avg || 0),
    ratingsCount: Number(row.ratings_count || 0),
    userRating: Number(row.user_rating || normalized),
  }
}
