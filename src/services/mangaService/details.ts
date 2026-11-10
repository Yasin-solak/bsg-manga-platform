import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { primeMangaLiteRows } from '../mangaLiteDirectory'
import { createRequestContext, toRequestContextLogContext, type RequestContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { buildPreferredPublicMangaSlug, extractGeneratedSlugSuffix } from '@/lib/slug'
import {
  CHAPTER_DETAIL_SELECT,
  CHAPTER_DETAIL_SELECT_WITHOUT_PAGE_DIMENSIONS,
  CHAPTER_LIST_SELECT,
  type DbChapter,
  type DbChapterWithFansub,
  type DbManga,
  MANGA_PUBLIC_SELECT,
  mapDbChapter,
  mapDbChapterFansub,
  mapDbManga,
  type SubmitMangaRatingResult,
  type SubmitMangaRatingRpcRow,
} from './shared'

const mangaDetailsLogger = createScopedLogger('mangaService.details')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function takeFirstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value.trim())
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const target = error as { code?: string; message?: string; details?: string }
  const message = (target.message || '').toLowerCase()
  const details = (target.details || '').toLowerCase()
  return target.code === 'PGRST116' || message.includes('not found') || details.includes('0 rows')
}

async function resolveLegacyPublicMangaId(identifier: string, signal?: AbortSignal) {
  const suffix = extractGeneratedSlugSuffix(identifier)
  if (!suffix) return null

  const requestContext = createRequestContext('mangaService.details', 'resolve-legacy-public-manga-id', {
    legacyPublicSlug: identifier,
    suffix,
  })
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_PUBLIC_SELECT)
        .eq('is_approved', true)
        .eq('is_active', true)
        .like('slug', `%-${suffix}`)
        .limit(6),
      requestSignal,
    ),
    { label: 'mangaService.resolveLegacyPublicMangaId', signal },
  )

  if (error) {
    logMangaDetailsError('warn', requestContext, 'legacy manga slug cozumleme sorgusu basarisiz oldu.', error)
    return null
  }

  const rows = Array.isArray(data) ? data as DbManga[] : []
  if (rows.length === 1) {
    return rows[0]?.id ?? null
  }

  const match = rows.find((row) => buildPreferredPublicMangaSlug({
    slug: row.slug,
    title: row.title,
  }) === identifier)

  return match?.id ?? null
}

function logMangaDetailsError(
  level: 'warn' | 'error',
  requestContext: RequestContext,
  message: string,
  error: unknown,
  extraContext?: Record<string, unknown>,
) {
  mangaDetailsLogger[level]({
    event: requestContext.event,
    message: toUserFacingErrorMessage(error, message),
    context: toRequestContextLogContext(requestContext, extraContext),
    error,
  })
}

async function getMangaByColumn(
  column: 'id' | 'slug',
  value: string,
  signal?: AbortSignal,
) {
  const requestContext = createRequestContext('mangaService.details', `get-manga-by-${column}`, {
    [column === 'id' ? 'mangaId' : 'mangaSlug']: value,
  })
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_PUBLIC_SELECT)
        .eq(column, value)
        .eq('is_approved', true)
        .eq('is_active', true)
        .single<DbManga>(),
      requestSignal,
    ),
    { label: `mangaService.getMangaBy${column === 'id' ? 'Id' : 'Slug'}`, signal },
  )

  if (error) {
    if (isNotFoundError(error)) {
      throw error
    }
    logMangaDetailsError('error', requestContext, 'manga kaydi yuklenemedi.', error)
    throw error
  }

  primeMangaLiteRows([
    {
      id: data.id,
      title: data.title,
      slug: data.slug,
      cover_image_url: data.cover_image_url ?? null,
    },
  ])

  const base = mapDbManga(data)

  const { count: followerCount, error: followerError } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('manga_follows')
        .select('manga_id', { count: 'exact' })
        .eq('manga_id', data.id)
        .limit(1),
      requestSignal,
    ),
    { label: 'mangaService.getManga.followerCount', signal },
  )

  if (followerError) {
    logMangaDetailsError('warn', requestContext, 'manga takipci sayisi yuklenemedi.', followerError, {
      stage: 'follower-count',
    })
    return base
  }

  return {
    ...base,
    followerCount: followerCount || 0,
  }
}

export async function getMangaById(id: string, signal?: AbortSignal) {
  return getMangaByColumn('id', id, signal)
}

export async function getMangaByIdentifier(identifier: string, signal?: AbortSignal) {
  const normalizedIdentifier = identifier.trim()
  if (!normalizedIdentifier) {
    throw new Error('MANGA_NOT_FOUND')
  }

  // If the input is a UUID, search directly by the ID column.
  // This avoids searching it as a slug and getting a PostgREST 406 Not Acceptable error.
  if (isUuid(normalizedIdentifier)) {
    return getMangaByColumn('id', normalizedIdentifier, signal)
  }

  let slugLookupError: unknown = null
  try {
    return await getMangaByColumn('slug', normalizedIdentifier, signal)
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error
    }
    slugLookupError = error
  }

  const legacyPublicMangaId = await resolveLegacyPublicMangaId(normalizedIdentifier, signal)
  if (legacyPublicMangaId) {
    return getMangaByColumn('id', legacyPublicMangaId, signal)
  }

  throw slugLookupError
}

export async function trackMangaRead(
  mangaId: string,
  chapterId?: string | null,
  chapterNumber?: number | null,
  clientKey?: string | null,
): Promise<number | null> {
  const requestContext = createRequestContext('mangaService.details', 'track-manga-read', {
    mangaId,
    chapterId: chapterId ?? null,
    chapterNumber: chapterNumber ?? null,
    hasClientKey: Boolean(clientKey),
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('track_manga_read', {
        p_manga_id: mangaId,
        p_chapter_id: chapterId ?? null,
        p_chapter_number: chapterNumber ?? null,
        p_client_key: clientKey ?? null,
      }),
      signal,
    ),
    { label: 'mangaService.trackMangaRead' },
  )

  if (error) {
    logMangaDetailsError('warn', requestContext, 'manga okuma takibi yazilamadi.', error)
    return null
  }

  const parsed = Number(data)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getMyMangaRating(mangaId: string, signal?: AbortSignal): Promise<number | null> {
  const requestContext = createRequestContext('mangaService.details', 'get-my-manga-rating', { mangaId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_user_manga_rating', {
        p_manga_id: mangaId,
      }),
      signal,
    ),
    { label: 'mangaService.getMyMangaRating', signal },
  )

  if (error) {
    logMangaDetailsError('error', requestContext, 'kullanici manga puani yuklenemedi.', error)
    throw error
  }

  if (data == null) return null
  const parsed = Number(data)
  return Number.isFinite(parsed) ? parsed : null
}

export async function submitMangaRating(
  mangaId: string,
  rating: number,
): Promise<SubmitMangaRatingResult> {
  const normalizedRating = Math.min(5, Math.max(1, Math.round(rating)))
  const requestContext = createRequestContext('mangaService.details', 'submit-manga-rating', {
    mangaId,
    normalizedRating,
  })

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('submit_manga_rating', {
        p_manga_id: mangaId,
        p_rating: normalizedRating,
      }),
      signal,
    ),
    { label: 'mangaService.submitMangaRating' },
  )

  if (error) {
    logMangaDetailsError('error', requestContext, 'manga puani kaydedilemedi.', error)
    throw error
  }

  const row = (Array.isArray(data) ? data[0] : data) as SubmitMangaRatingRpcRow | null

  return {
    averageRating: row?.average_rating != null ? Number(row.average_rating) : null,
    totalRatings: row?.total_ratings != null ? Number(row.total_ratings) : 0,
    userRating: row?.user_rating != null ? Number(row.user_rating) : normalizedRating,
  }
}

export async function getChaptersByMangaId(mangaId: string, signal?: AbortSignal) {
  const requestContext = createRequestContext('mangaService.details', 'get-chapters-by-manga-id', { mangaId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select(`
          ${CHAPTER_LIST_SELECT},
          fansub:fansub_id (
            id,
            name,
            slug
          ),
          manga:manga_id!inner (
            id,
            is_active,
            is_approved
          )
        `)
        .eq('manga_id', mangaId)
        .eq('is_approved', true)
        .eq('is_active', true)
        .eq('manga.is_active', true)
        .eq('manga.is_approved', true)
        .order('chapter_number', { ascending: false })
        .order('created_at', { ascending: false }),
      signal,
    ),
    { label: 'mangaService.getChaptersByMangaId', signal },
  )

  if (error) {
    logMangaDetailsError('error', requestContext, 'manga bolumleri yuklenemedi.', error)
    throw error
  }

  return (data as any[]).map((dbChapter) => ({
    ...mapDbChapter(dbChapter as DbChapter),
    fansub: dbChapter.fansub
      ? {
          id: dbChapter.fansub.id,
          name: dbChapter.fansub.name,
          slug: dbChapter.fansub.slug,
        }
      : undefined,
  }))
}

export async function getChapterDetails(
  mangaId: string,
  chapterNumber: number,
  chapterId?: string,
) {
  const requestContext = createRequestContext('mangaService.details', 'get-chapter-details', {
    mangaId,
    chapterId: chapterId ?? null,
    chapterNumber,
  })
  const buildQuery = (selectClause: string) => {
    let query = supabase
      .from('chapters')
      .select(`
        ${selectClause},
        fansub:fansub_id (
          id,
          name,
          slug,
          avatar_url,
          active_name_style
        ),
        manga:manga_id!inner (
          id,
          is_active,
          is_approved
        )
      `)
      .eq('manga_id', mangaId)
      .eq('chapter_number', chapterNumber)
      .eq('is_approved', true)
      .eq('is_active', true)
      .eq('manga.is_active', true)
      .eq('manga.is_approved', true)

    if (chapterId) {
      query = query.eq('id', chapterId)
    }

    return withServiceTimeout(
      (signal) => withAbortSignal(
        query
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        signal,
      ),
      { label: 'mangaService.getChapterDetails' },
    )
  }

  let { data, error } = await buildQuery(CHAPTER_DETAIL_SELECT)

  // Deploy order guard: if the code ships before the `page_dimensions` migration is applied,
  // the chapter would NOT open at all (42703). This column is only for
  // reserving space; without it the reader measures the ratio from the image. So
  // on a missing column the query is repeated once without it.
  // This fallback can be removed once the migration is applied everywhere.
  if (error && (error as { code?: string }).code === '42703') {
    const fallback = await buildQuery(CHAPTER_DETAIL_SELECT_WITHOUT_PAGE_DIMENSIONS)
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    logMangaDetailsError('error', requestContext, 'bolum detayi yuklenemedi.', error)
    throw error
  }

  if (!data) {
    throw new Error('Chapter not found')
  }

  const row = data as unknown as DbChapterWithFansub
  return {
    ...mapDbChapter(row as DbChapter),
    fansub: mapDbChapterFansub(takeFirstRelation(row.fansub)),
  }
}
