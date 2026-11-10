/**
 * recommendationService: personal manga recommendations ("For you")
 *
 * Calls the get_recommended_mangas RPC (migration 271): scores candidate manga against the user's
 * genre profile (read + followed + onboarding preferences) and
 * drops what they read/follow. If the profile is empty (new user /
 * anonymous) the same RPC falls back to popular content. matched_genres lets the UI show
 * "why recommended".
 *
 * Gate: the 'home.recommendations' feature flag. If off, an empty list is returned and
 * the caller continues with its existing client-side heuristic fallback.
 */

import { supabase } from './supabase'
import { isFeatureEnabled } from './featureFlagService'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { toUserFacingErrorMessage } from './userFacingError'
import { createScopedLogger } from './logger'
import { mapDbManga } from './mangaService/shared'
import type { DbManga } from './mangaService/shared.types'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('recommendationService')

const FLAG_KEY = 'home.recommendations'

type RecommendedMangaRow = DbManga & { matched_genres: string[] | null }

export interface RecommendedManga {
  manga: Manga
  matchedGenres: string[]
}

export type RecommendationSource = 'reading' | 'genres'

// The source filter is not applied later to the first 14 picks; all candidates are ranked on the server.
export async function getRecommendedMangasBySource(source: RecommendationSource, signal?: AbortSignal): Promise<RecommendedManga[]> {
  if (!(await isFeatureEnabled(FLAG_KEY, false))) return []
  const { data, error } = await withServiceTimeout(
    abortSignal => withAbortSignal(supabase.rpc('get_recommended_mangas_by_source', { p_source: source, p_limit: 14 }), abortSignal),
    { label: txa('Kaynağa göre öneriler'), signal },
  )
  if (error) throw error
  return ((data as RecommendedMangaRow[] | null) || []).map(row => ({ manga: mapDbManga(row), matchedGenres: row.matched_genres || [] }))
}

export async function getRecommendedMangas(
  limit = 12,
  signal?: AbortSignal,
): Promise<RecommendedManga[]> {
  if (!(await isFeatureEnabled(FLAG_KEY, false))) return []

  try {
    const { data, error } = await withServiceTimeout(
      (abortSignal) => withAbortSignal(
        supabase.rpc('get_recommended_mangas', { p_limit: limit }),
        abortSignal,
      ),
      { label: txa('Kisisel manga onerileri'), signal },
    )
    if (error) throw error

    return ((data as RecommendedMangaRow[] | null) || []).map((row) => ({
      manga: mapDbManga(row),
      matchedGenres: row.matched_genres || [],
    }))
  } catch (error) {
    // The recommendation rail never takes down the home page: errors are logged, an empty list is returned,
    // and the caller moves to its heuristic fallback.
    logger.warn('Kisisel oneriler yuklenemedi', {
      error,
      message: toUserFacingErrorMessage(error, txa('Oneriler yuklenemedi.')),
    })
    return []
  }
}
