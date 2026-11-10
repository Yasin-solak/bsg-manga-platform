import { z } from 'zod'
import { summarizeUnread, type UnreadMangaEntry } from '@/lib/unreadChapters'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'

/**
 * Library: the user's OWN reading state.
 *
 * This is the source of all three tabs because all three derive from the same two tables
 * (`manga_follows` + `reading_history`) and need the same manga info.
 * A separate service per tab would run the same cover query three times.
 *
 * **No "Saved" or "Completed".** They were in the prototype but have no match in
 * the schema: there was never a separate bookmark concept (the home page's bookmark
 * button is already tied to FOLLOWING) and no "finished" mark is kept.
 * Rather than show an empty tab, we did not open a tab that does not exist.
 *
 * **"Reading" and "History" also turned out the same:** `reading_history` keeps
 * ONE row per manga (the last chapter read), so there is no per-chapter history
 * anyway. Both were "the series you read last, by time".
 *
 * The unread count comes from the rule in `src/lib/unreadChapters.ts` and is not
 * recalculated here. The home strip and Library must show the same number.
 */

const libraryLogger = createScopedLogger('libraryService')

/** Chapters older than this window do not count as "new"; the counter should not swell with back catalog. */
const WINDOW_DAYS = 60
const MAX_SERIES = 200

const followRowSchema = z.object({
  manga_id: z.string(),
  created_at: z.string().nullish(),
})

const historyRowSchema = z.object({
  manga_id: z.string(),
  chapter_number: z.union([z.number(), z.string()]).nullish(),
  read_at: z.string().nullish(),
  created_at: z.string().nullish(),
})

const chapterRowSchema = z.object({
  manga_id: z.string(),
  chapter_number: z.union([z.number(), z.string()]),
  publish_at: z.string().nullish(),
  created_at: z.string().nullish(),
})

const mangaRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string().nullish(),
  cover_image_url: z.string().nullish(),
})

/** DROPS invalid rows, not all of them: one broken record should not empty the tab. */
function parseRows<T extends z.ZodTypeAny>(schema: T, rows: unknown): z.infer<T>[] {
  if (!Array.isArray(rows)) return []
  const out: z.infer<T>[] = []
  for (const row of rows) {
    const result = schema.safeParse(row)
    if (result.success) out.push(result.data)
  }
  return out
}

export interface LibraryManga {
  mangaId: string
  title: string
  slug?: string
  coverImage: string
}

export interface LibraryFollowEntry extends LibraryManga {
  followedAt: string | null
  /** Unread chapters released after following. */
  unreadCount: number
  /** Earliest unread chapter number; for "Continue from chapter 4". */
  nextChapterNumber: number | null
  /** Last chapter read in that series; null if never read. */
  lastReadChapter: number | null
}

export interface LibraryReadEntry extends LibraryManga {
  lastReadChapter: number
  lastReadAt: string | null
  /** Also following? For the follow badge on read items. */
  isFollowed: boolean
}

export interface LibraryData {
  follows: LibraryFollowEntry[]
  reads: LibraryReadEntry[]
  /** Total unread chapters; the SAME number as the home strip. */
  unreadTotal: number
}

const EMPTY: LibraryData = { follows: [], reads: [], unreadTotal: 0 }

export async function loadLibrary(userId: string): Promise<LibraryData> {
  const requestContext = createRequestContext('libraryService', 'load-library')

  try {
    const [followResult, historyResult] = await Promise.all([
      supabase
        .from('manga_follows')
        .select('manga_id,created_at')
        .eq('user_id', userId)
        .limit(MAX_SERIES),
      supabase
        .from('reading_history')
        .select('manga_id,chapter_number,read_at,created_at')
        .eq('user_id', userId)
        .order('read_at', { ascending: false, nullsFirst: false })
        .limit(MAX_SERIES),
    ])

    if (followResult.error) throw followResult.error
    if (historyResult.error) throw historyResult.error

    const follows = parseRows(followRowSchema, followResult.data)
    const history = parseRows(historyRowSchema, historyResult.data)

    // Iki listenin BIRLESIMI: takip edip okumadigin da, okuyup takip
    // etmedigin de kutuphaneye girer.
    const mangaIds = Array.from(new Set([
      ...follows.map((row) => row.manga_id),
      ...history.map((row) => row.manga_id),
    ]))
    if (mangaIds.length === 0) return EMPTY

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [chapterResult, mangaResult] = await Promise.all([
      supabase
        .from('chapters')
        .select('manga_id,chapter_number,publish_at,created_at')
        .in('manga_id', mangaIds)
        .eq('is_active', true)
        .eq('is_approved', true)
        .gte('publish_at', since)
        .limit(1000),
      supabase
        .from('mangas')
        .select('id,title,slug,cover_image_url')
        .in('id', mangaIds),
    ])

    if (mangaResult.error) throw mangaResult.error
    // If the chapter query fails the counter is 0 but the library STILL opens:
    // the list is useful without unread counts.
    const chapters = chapterResult.error ? [] : parseRows(chapterRowSchema, chapterResult.data)

    const mangaById = new Map<string, LibraryManga>()
    for (const row of parseRows(mangaRowSchema, mangaResult.data)) {
      mangaById.set(row.id, {
        mangaId: row.id,
        title: row.title,
        slug: row.slug ?? undefined,
        coverImage: row.cover_image_url ?? '',
      })
    }

    const lastReadByManga = new Map<string, { chapter: number; at: string | null }>()
    for (const row of history) {
      const chapter = Number(row.chapter_number ?? 0)
      const at = row.read_at ?? row.created_at ?? null
      const current = lastReadByManga.get(row.manga_id)
      // If several records come for the same series, the FURTHEST wins.
      if (!current || chapter > current.chapter) {
        lastReadByManga.set(row.manga_id, { chapter, at })
      }
    }

    const summary = summarizeUnread(
      follows.map((row) => ({ mangaId: row.manga_id, followedAt: row.created_at })),
      chapters.map((row) => ({
        mangaId: row.manga_id,
        chapterNumber: Number(row.chapter_number),
        // created_at if there is no publish_at: old records may have an empty publish_at
        // and those chapters would silently drop from the count.
        publishAt: row.publish_at ?? row.created_at ?? null,
      })),
      Array.from(lastReadByManga.entries()).map(([mangaId, value]) => ({
        mangaId,
        lastReadChapter: value.chapter,
      })),
    )

    const unreadByManga = new Map<string, UnreadMangaEntry>()
    for (const entry of summary.byManga) unreadByManga.set(entry.mangaId, entry)

    const followedIds = new Set(follows.map((row) => row.manga_id))

    const libraryFollows: LibraryFollowEntry[] = follows
      .map((row) => {
        const manga = mangaById.get(row.manga_id)
        if (!manga) return null
        const unread = unreadByManga.get(row.manga_id)
        const lastRead = lastReadByManga.get(row.manga_id)
        return {
          ...manga,
          followedAt: row.created_at ?? null,
          unreadCount: unread?.count ?? 0,
          nextChapterNumber: unread?.numbers[0] ?? null,
          lastReadChapter: lastRead ? lastRead.chapter : null,
        }
      })
      .filter((entry): entry is LibraryFollowEntry => entry !== null)
      // Okunmamisi olan once, sonra en yeni takip. Kutuphaneyi acan kisinin
      // aradigi ilk sey "ne birikmis" sorusunun cevabi.
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount
        return Date.parse(b.followedAt ?? '') - Date.parse(a.followedAt ?? '') || 0
      })

    const libraryReads: LibraryReadEntry[] = history
      .map((row) => {
        const manga = mangaById.get(row.manga_id)
        if (!manga) return null
        const lastRead = lastReadByManga.get(row.manga_id)
        if (!lastRead) return null
        return {
          ...manga,
          lastReadChapter: lastRead.chapter,
          lastReadAt: lastRead.at,
          isFollowed: followedIds.has(row.manga_id),
        }
      })
      .filter((entry): entry is LibraryReadEntry => entry !== null)
      // Ayni seri gecmiste birden fazla satirla gelirse tekrar basma.
      .filter((entry, index, all) => all.findIndex((x) => x.mangaId === entry.mangaId) === index)

    return { follows: libraryFollows, reads: libraryReads, unreadTotal: summary.count }
  } catch (error) {
    libraryLogger.warn({
      event: requestContext.event,
      message: 'Kutuphane yuklenemedi.',
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return EMPTY
  }
}
