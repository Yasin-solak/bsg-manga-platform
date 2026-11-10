import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/**
 * Genre statistics: series counts on cards and the "popular" marker.
 *
 * RPC INVOKER: counting runs over the catalog the caller can see, so the
 * 18+ gate applies to the count too; counting series an age-unverified user cannot see
 * would make the number a lie.
 */

const genreStatsLogger = createScopedLogger('genreStatsService')

const rowSchema = z.object({
  genre: z.string(),
  series_count: z.union([z.number(), z.string()]),
  is_hot: z.boolean().nullish(),
})

export interface GenreStat {
  genre: string
  seriesCount: number
  /** En cok okunan turlerden biri. */
  isHot: boolean
}

export async function listGenreStats(): Promise<GenreStat[]> {
  try {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(supabase.rpc('get_public_genre_stats'), signal),
      { label: 'Tur istatistiklerini listeleme' },
    )
    if (error) throw error

    const rows = Array.isArray(data) ? data : []
    const out: GenreStat[] = []
    for (const row of rows) {
      const parsed = rowSchema.safeParse(row)
      // One broken row should not empty the list.
      if (!parsed.success) continue
      out.push({
        genre: parsed.data.genre,
        seriesCount: Number(parsed.data.series_count) || 0,
        isHot: parsed.data.is_hot === true,
      })
    }
    return out
  } catch (error) {
    genreStatsLogger.warn({
      event: 'list-genre-stats',
      message: toUserFacingErrorMessage(error, 'Tur istatistikleri yuklenemedi.'),
      error,
    })
    // If the count is unknown, genre selection STILL works; cards render without numbers.
    return []
  }
}
