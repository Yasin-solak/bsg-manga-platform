import { z } from 'zod'
import { supabase } from './supabase'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { summarizeUnread, type UnreadSummary } from '@/lib/unreadChapters'

/**
 * UNREAD chapter count in followed series.
 *
 * The rule is in `src/lib/unreadChapters.ts` and is pure; this only gathers the input of
 * three queries.
 *
 * No separate RPC was written: followed series number in the tens and chapters in the recent
 * window are limited. A migration's cost was needless for a calculation
 * of this size.
 */

const unreadLogger = createScopedLogger('unreadChapterService')

/** Chapters older than this window do not count as "new"; the counter should not swell with back catalog. */
const WINDOW_DAYS = 60

const followRowSchema = z.object({
  manga_id: z.string(),
  created_at: z.string().nullish(),
})

const chapterRowSchema = z.object({
  manga_id: z.string(),
  chapter_number: z.union([z.number(), z.string()]),
  publish_at: z.string().nullish(),
  created_at: z.string().nullish(),
})

const progressRowSchema = z.object({
  manga_id: z.string(),
  chapter_number: z.union([z.number(), z.string()]).nullish(),
})

/** DROPS invalid rows, not all of them: one broken record should not zero the counter. */
function parseRows<T extends z.ZodTypeAny>(schema: T, rows: unknown): z.infer<T>[] {
  if (!Array.isArray(rows)) return []
  const out: z.infer<T>[] = []
  for (const row of rows) {
    const result = schema.safeParse(row)
    if (result.success) out.push(result.data)
  }
  return out
}

export interface UnreadResult extends UnreadSummary {
  /** Seride gosterilecek kapaklar; mangaIds sirasiyla. */
  covers: string[]
}

export async function loadUnreadSummary(userId: string): Promise<UnreadResult> {
  const requestContext = createRequestContext('unreadChapterService', 'load-unread-summary')
  const empty: UnreadResult = { count: 0, mangaIds: [], byManga: [], covers: [] }

  try {
    const { data: followData, error: followError } = await supabase
      .from('manga_follows')
      .select('manga_id,created_at')
      .eq('user_id', userId)
      .limit(200)
    if (followError) throw followError

    const follows = parseRows(followRowSchema, followData)
    if (follows.length === 0) return empty

    const mangaIds = follows.map((row) => row.manga_id)
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [chapterResult, progressResult] = await Promise.all([
      supabase
        .from('chapters')
        .select('manga_id,chapter_number,publish_at,created_at')
        .in('manga_id', mangaIds)
        .eq('is_active', true)
        .eq('is_approved', true)
        .gte('publish_at', since)
        .limit(500),
      supabase
        .from('reading_history')
        .select('manga_id,chapter_number')
        .eq('user_id', userId)
        .in('manga_id', mangaIds)
        .limit(200),
    ])

    if (chapterResult.error) throw chapterResult.error
    if (progressResult.error) throw progressResult.error

    const summary = summarizeUnread(
      follows.map((row) => ({ mangaId: row.manga_id, followedAt: row.created_at })),
      parseRows(chapterRowSchema, chapterResult.data).map((row) => ({
        mangaId: row.manga_id,
        chapterNumber: Number(row.chapter_number),
        // created_at if there is no publish_at: old records may have an empty publish_at
        // and those chapters would silently drop from the count.
        publishAt: row.publish_at ?? row.created_at ?? null,
      })),
      parseRows(progressRowSchema, progressResult.data).map((row) => ({
        mangaId: row.manga_id,
        lastReadChapter: Number(row.chapter_number ?? 0),
      })),
    )

    if (summary.count === 0) return empty

    // Covers are only for the strip; the first three series are enough.
    const coverIds = summary.mangaIds.slice(0, 3)
    const { data: coverData } = await supabase
      .from('mangas')
      .select('id,cover_image_url')
      .in('id', coverIds)

    const coverById = new Map<string, string>()
    for (const row of (coverData || []) as Array<{ id?: string; cover_image_url?: string | null }>) {
      if (row?.id && row.cover_image_url) coverById.set(row.id, row.cover_image_url)
    }

    return {
      ...summary,
      covers: coverIds.map((id) => coverById.get(id)).filter((url): url is string => Boolean(url)),
    }
  } catch (error) {
    unreadLogger.warn({
      event: requestContext.event,
      message: 'Okunmamis bolum sayisi hesaplanamadi.',
      context: toRequestContextLogContext(requestContext),
      error,
    })
    // Without a counter the greeting subline is not shown at all; showing nothing
    // is right rather than a wrong number.
    return empty
  }
}
