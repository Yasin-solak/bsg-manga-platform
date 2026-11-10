import { z } from 'zod'
import { listMangas } from './mangaService'
import {
  getFollowedMangas,
  getMyPreferredGenres,
  getReadingHistory,
} from './userService'
import { createScopedLogger } from './logger'
import type { Manga } from '@/types'

/**
 * Data gathering for "Lucky pick".
 *
 * Selection logic is in `src/lib/luckyPick.ts` and is PURE; this only gathers
 * inputs. The split is deliberate: network access and decisions are kept apart so the
 * rule can be tested deterministically.
 */

const luckyLogger = createScopedLogger('luckyPickService')

/*
 * Reading history and follow rows come from an UNTYPED join
 * (the `manga` relation is sometimes an object, sometimes an array). Casting with `as unknown` by
 * hand and reading fields would silently produce empty signals the day the schema changes: user genres
 * "not found", Lucky pick falls back to plain random and nobody notices.
 * So rows are validated before reading.
 */
const relatedMangaSchema = z.object({
  id: z.string().optional(),
  genres: z.array(z.string()).nullish(),
})

const activityRowSchema = z.object({
  manga_id: z.string().nullish(),
  // PostgREST can return the relation as a single item or an array.
  manga: z.union([relatedMangaSchema, z.array(relatedMangaSchema)]).nullish(),
})

type ActivityRow = z.infer<typeof activityRowSchema>

/** DROPS invalid rows, not all of them: one broken record should not zero the signal. */
function parseActivityRows(rows: unknown, label: string): ActivityRow[] {
  if (!Array.isArray(rows)) return []
  const parsed: ActivityRow[] = []
  let skipped = 0
  for (const row of rows) {
    const result = activityRowSchema.safeParse(row)
    if (result.success) parsed.push(result.data)
    else skipped += 1
  }
  if (skipped > 0) {
    luckyLogger.warn({
      event: 'lucky-row-shape',
      message: `${label}: ${skipped} satir beklenen sekilde degil, atlandi.`,
    })
  }
  return parsed
}

function relatedOf(row: ActivityRow) {
  return Array.isArray(row.manga) ? row.manga[0] : row.manga
}

export interface LuckyPickContext {
  candidates: Manga[]
  /** Onboarding tercihleri + okuma gecmisinden turetilen turler, birlesik. */
  genreSignals: string[]
  /** Takip edilen ya da okunmus seri id'leri. */
  excludeIds: Set<string>
}

/**
 * Extracts the genre signal from reading history.
 *
 * `reading_history` keeps ONE row per manga (the last chapter read), so
 * what we know is "started this series". Genre counts are based on that;
 * starting a series and dropping it is a signal too.
 */
function genresFromHistory(rows: ActivityRow[]): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const genres = relatedOf(row)?.genres ?? []
    for (const genre of genres) {
      const key = String(genre || '').trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre]) => genre)
}

export async function loadLuckyPickContext(userId?: string): Promise<LuckyPickContext> {
  // The catalog is public; guests should be able to spin Lucky pick too.
  // listMangas returns a paged result ({ data, count }); Lucky pick only wants the list.
  const candidates = await listMangas({ limit: 200 })
    .then((page) => page.data)
    .catch((error) => {
      luckyLogger.warn({
        event: 'lucky-candidates',
        message: 'Sans icin katalog yuklenemedi.',
        error,
      })
      return [] as Manga[]
    })

  if (!userId) {
    return { candidates, genreSignals: [], excludeIds: new Set() }
  }

  /*
   * The three calls are independent: if one blows up, the others keep working.
   * Lucky pick should not fully break because personalization data did not arrive; at
   * worst it falls back to plain random.
   */
  const [preferred, history, follows] = await Promise.allSettled([
    getMyPreferredGenres(userId),
    getReadingHistory(userId),
    getFollowedMangas(userId),
  ])

  const preferredGenres = preferred.status === 'fulfilled' ? preferred.value : []
  const historyRows = parseActivityRows(
    history.status === 'fulfilled' ? history.value : [],
    'okuma gecmisi',
  )
  const followRows = parseActivityRows(
    follows.status === 'fulfilled' ? follows.value : [],
    'takip listesi',
  )

  const excludeIds = new Set<string>()
  const collectId = (row: ActivityRow) => {
    const id = String(row.manga_id || relatedOf(row)?.id || '').trim()
    if (id) excludeIds.add(id)
  }
  historyRows.forEach(collectId)
  followRows.forEach(collectId)

  // Two sources merge; repeats count once.
  const genreSignals = Array.from(new Set([
    ...preferredGenres.map((genre: string) => String(genre || '').trim()).filter(Boolean),
    ...genresFromHistory(historyRows),
  ]))

  return { candidates, genreSignals, excludeIds }
}
