import type { Manga } from '@/types'
import { supabase } from '../supabase'
import { withAbortSignal } from '../apiResilience'
import { primeMangaLiteRows } from '../mangaLiteDirectory'
import { isAbortError } from '../supabaseError'
import {
  ALLOWED_SORTS,
  ALLOWED_STATUSES,
  type DbManga,
  type DbSearchPublicMangaRow,
  MANGA_PUBLIC_SELECT,
  mapDbManga,
  type MangaFilterParams,
} from './shared'

type ListMangasResult = {
  data: Manga[]
  count: number
}

const LIST_MANGAS_CACHE_TTL_MS = 15_000
const listMangasCache = new Map<string, { result: ListMangasResult; expiresAt: number }>()
const listMangasInFlight = new Map<string, Promise<ListMangasResult>>()

function sanitizePostgrestSearchTerm(value: string) {
  return value.trim().replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

function createListMangasSignature(
  search: string | undefined,
  genres: string[],
  status: string,
  sort: string,
  page: number,
  limit: number,
) {
  return JSON.stringify({
    search: search || '',
    genres,
    status,
    sort,
    page,
    limit,
  })
}

function readListMangasCache(signature: string) {
  const entry = listMangasCache.get(signature)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    listMangasCache.delete(signature)
    return null
  }
  return entry.result
}

export async function listMangas(
  params: MangaFilterParams = {},
  signal?: AbortSignal,
) {
  const {
    search,
    genres,
    status,
    sort = 'popular',
    page = 1,
    limit = 20,
  } = params

  const normalizedSearch = search?.trim()
  const normalizedStatus = ALLOWED_STATUSES.has(status || 'all') ? (status || 'all') : 'all'
  const normalizedSort = ALLOWED_SORTS.has(sort) ? sort : 'popular'
  const safePage = Number.isFinite(page) && page > 0 ? page : 1
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 60) : 20
  const normalizedGenres = Array.from(new Set((genres || [])
    .map((genre) => genre.trim())
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'tr'))

  const signature = createListMangasSignature(
    normalizedSearch,
    normalizedGenres,
    normalizedStatus,
    normalizedSort,
    safePage,
    safeLimit,
  )

  if (!signal) {
    const cached = readListMangasCache(signature)
    if (cached) return cached

    const inFlight = listMangasInFlight.get(signature)
    if (inFlight) return inFlight
  }

  const request = (async (): Promise<ListMangasResult> => {
    const { data: rpcRows, error: rpcError } = await withAbortSignal(
      supabase.rpc('search_public_mangas_v2', {
        p_search: normalizedSearch || null,
        p_genres: normalizedGenres.length > 0 ? normalizedGenres : null,
        p_status: normalizedStatus,
        p_sort: normalizedSort,
        p_page: safePage,
        p_limit: safeLimit,
      }),
      signal,
    )

    if (!rpcError && Array.isArray(rpcRows)) {
      const rows = rpcRows as DbSearchPublicMangaRow[]
      if (!normalizedSearch || rows.length > 0) {
        primeMangaLiteRows(rows)
        const totalCountRaw = rows[0]?.total_count
        const totalCount = Number(totalCountRaw || 0)
        return {
          data: rows.map(mapDbManga),
          count: Number.isFinite(totalCount) ? totalCount : 0,
        }
      }
    }

    if (rpcError) {
      console.warn('[mangaService] listMangas search_public_mangas_v2 fallback', rpcError)
    }

    let query = supabase
      .from('mangas')
      .select(MANGA_PUBLIC_SELECT, { count: 'exact' })
      .eq('is_active', true)
      .eq('is_approved', true)

    if (normalizedSearch) {
      const safeSearch = sanitizePostgrestSearchTerm(normalizedSearch)
      query = query.or(`title.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,author.ilike.%${safeSearch}%,artist.ilike.%${safeSearch}%`)
    }

    if (normalizedGenres.length > 0) {
      query = query.overlaps('genres', normalizedGenres)
    }

    if (normalizedStatus !== 'all') {
      if (normalizedStatus === 'new') query = query.eq('is_new', true)
      else query = query.eq('status', normalizedStatus)
    }

    switch (normalizedSort) {
      case 'latest':
        query = query.order('updated_at', { ascending: false })
        query = query.order('total_views', { ascending: false })
        break
      case 'rating':
        query = query.order('rating', { ascending: false, nullsFirst: false })
        query = query.order('total_views', { ascending: false })
        break
      case 'title':
        query = query.order('title', { ascending: true })
        query = query.order('updated_at', { ascending: false })
        break
      case 'popular':
      default:
        query = query.order('total_views', { ascending: false })
        query = query.order('updated_at', { ascending: false })
        break
    }

    const from = (safePage - 1) * safeLimit
    const to = from + safeLimit - 1
    query = query.range(from, to)

    const { data, error, count } = await withAbortSignal(query, signal)

    if (error) {
      console.error('[mangaService] listMangas error', error)
      throw error
    }

    primeMangaLiteRows((data as DbManga[] | null) || [])

    return {
      data: (data as DbManga[]).map(mapDbManga),
      count: count || 0,
    }
  })()

  if (!signal) {
    listMangasInFlight.set(signature, request)
  }

  try {
    const result = await request
    if (!signal) {
      listMangasCache.set(signature, {
        result,
        expiresAt: Date.now() + LIST_MANGAS_CACHE_TTL_MS,
      })
    }
    return result
  } finally {
    if (!signal) {
      listMangasInFlight.delete(signature)
    }
  }
}

/** Similar series + WHY it is similar (empty array if no match). */
export interface RelatedMangaSuggestion {
  manga: Manga
  matchedGenres: string[]
}

export async function listRelatedMangasForDetail(
  manga: Pick<Manga, 'id' | 'genres'>,
  options: { limit?: number } = {},
  signal?: AbortSignal,
) {
  const safeLimit = Number.isFinite(options.limit) ? Math.min(Math.max(options.limit || 6, 1), 12) : 6
  const normalizedGenres = Array.from(new Set((manga.genres || [])
    .map((genre) => genre.trim())
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'tr'))

  let query = supabase
    .from('mangas')
    .select(MANGA_PUBLIC_SELECT)
    .eq('is_active', true)
    .eq('is_approved', true)
    .neq('id', manga.id)
    .order('total_views', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  const overlapGenres = normalizedGenres.slice(0, 3)
  if (overlapGenres.length > 0) {
    query = query.overlaps('genres', overlapGenres)
  }

  const { data, error } = await withAbortSignal(query, signal)

  if (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw error
    }
    console.error('[mangaService] listRelatedMangasForDetail error', error)
    throw error
  }

  primeMangaLiteRows((data as DbManga[] | null) || [])

  /*
   * REASONS ARE NOT INVENTED. The query narrows with `overlaps(...slice(0, 3))`,
   * so the "why recommended" answer is exactly the intersection with THAT SET.
   * Recalculating the intersection in the caller would leak the service's inner detail
   * (which 3 genres, which order) into the UI, and if the two diverged the
   * screen would show a wrong reason.
   */
  const matchSet = new Set(overlapGenres.map((genre) => genre.toLocaleLowerCase('tr')))

  return ((data as DbManga[] | null) || []).map((row) => {
    const related = mapDbManga(row)
    const matchedGenres = matchSet.size === 0
      ? []
      : (related.genres || []).filter((genre) => matchSet.has(genre.trim().toLocaleLowerCase('tr')))
    return { manga: related, matchedGenres }
  })
}



