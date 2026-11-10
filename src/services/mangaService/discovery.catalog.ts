import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  type DbManga,
  type DbPopularWindowManga,
  MANGA_PUBLIC_SELECT,
  mapDbManga,
} from './shared'
import { txa } from '@/i18n/activeLocale'

const mangaDiscoveryCatalogLogger = createScopedLogger('mangaService/discovery.catalog')

export async function getTrendingMangas(limit = 10) {
  const requestContext = createRequestContext('mangaService/discovery.catalog', 'getTrendingMangas', { limit })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_PUBLIC_SELECT)
        .eq('is_approved', true)
        .eq('is_active', true)
        .order('total_views', { ascending: false })
        .limit(limit),
      signal,
    ),
    { label: 'mangaService.getTrendingMangas' },
  )

  if (error) {
    mangaDiscoveryCatalogLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Trend mangalar yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return (data as DbManga[]).map(mapDbManga)
}

export async function getPopularMangas(limit = 10) {
  const requestContext = createRequestContext('mangaService/discovery.catalog', 'getPopularMangas', { limit })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_PUBLIC_SELECT)
        .eq('is_approved', true)
        .eq('is_active', true)
        .order('rating', { ascending: false })
        .limit(limit),
      signal,
    ),
    { label: 'mangaService.getPopularMangas' },
  )

  if (error) {
    mangaDiscoveryCatalogLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Populer mangalar yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return (data as DbManga[]).map(mapDbManga)
}

export async function getPopularMangasByPeriod(
  period: 'weekly' | 'monthly',
  limit = 10,
) {
  const days = period === 'monthly' ? 30 : 7
  const requestContext = createRequestContext('mangaService/discovery.catalog', 'getPopularMangasByPeriod', {
    period,
    limit,
    days,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_popular_mangas_by_views_window', {
        p_days: days,
        p_limit: limit,
      }),
      signal,
    ),
    { label: 'mangaService.getPopularMangasByPeriod' },
  )

  if (error) {
    mangaDiscoveryCatalogLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Donemsel populer manga listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return (data as DbPopularWindowManga[]).map((row) => ({
    id: row.id,
    title: row.title,
    coverImage:
      row.cover_image_url
      ?? buildCoverPlaceholder(row.title),
    lastChapter:
      row.last_chapter_number != null ? txa('{v1}. Bolum', { v1: row.last_chapter_number }) : undefined,
    isNew: row.is_new ?? undefined,
    rating: row.rating ?? undefined,
    views: row.recent_views ?? row.total_views ?? undefined,
    updatedAt: row.updated_at,
  }))
}

export async function getGenreCounts() {
  const requestContext = createRequestContext('mangaService/discovery.catalog', 'getGenreCounts')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('get_genre_counts'), signal),
    { label: 'mangaService.getGenreCounts' },
  )

  if (error) {
    mangaDiscoveryCatalogLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Tur sayilari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }

  return data as { genre: string; count: number }[]
}
