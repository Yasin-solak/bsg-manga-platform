/**
 * "N new chapters are waiting": the rule for the number.
 *
 * The user's question was: if chapter 3 came out in a series I follow and I
 * READ it, should the number go down? Yes. So the counter counts **unread**,
 * not "newly published".
 *
 * The rule is the intersection of two conditions:
 * 1. The chapter was published AFTER the user started following the series.
 * 2. The chapter number is past the LAST chapter READ in that series.
 *
 * Without the first condition, following a 500-chapter old series today would say
 * "500 new chapters": true but useless. The second solves what the user asked:
 * after reading 3 the last read moves to 3 and that chapter drops out of the count
 * by itself.
 *
 * **THE SAME CHAPTER CAN COME FROM SEVERAL FANSUBS.** `chapters` uniqueness is
 * (manga_id, chapter_number, fansub_id), so if three fansubs upload chapter 5 there are
 * three ROWS. Counting rows would say "3 new chapters", yet there is
 * one chapter to read with three translation options. So UNIQUE CHAPTER NUMBERS
 * are counted per series.
 *
 * Being number-based also solves the scenarios the user asked about correctly:
 *   - I read 4 from fansub Y, X also uploaded 4 -> 4 > 4 is false, NOT COUNTED.
 *   - I read 4 from Y, X posted 5 -> 5 > 4, counted once.
 *
 * LIMIT: `reading_history` keeps ONE row per manga (the last chapter read).
 * If you skip 4 and read 5, the schema treats 4 as read too. We cannot tell the
 * difference since we keep no per-chapter read record.
 */

export interface UnreadFollow {
  mangaId: string
  /** Time of following (ISO). Without it the series is NOT counted. */
  followedAt?: string | null
}

export interface UnreadChapter {
  mangaId: string
  chapterNumber: number
  /** Publish time (ISO). Without it, not counted: a chapter with an unknown time is not "new". */
  publishAt?: string | null
}

export interface UnreadProgress {
  mangaId: string
  /** LAST chapter number read in that series. */
  lastReadChapter: number
}

export interface UnreadMangaEntry {
  mangaId: string
  /** UNIQUE unread chapter count in that series. */
  count: number
  /** Time of the newest unread chapter in the series (ms). For sorting. */
  newestAt: number
  /** Unread chapter numbers, ascending. To show where the user left off. */
  numbers: number[]
}

export interface UnreadSummary {
  /** Total unread chapter count. */
  count: number
  /** Ids of series with unread chapters, newest chapter first. */
  mangaIds: string[]
  /**
   * Per-series breakdown, in the SAME order as mangaIds.
   *
   * The home strip showed only the total; Library has to say "3 new chapters" per
   * series. Writing the same count again in a second place would
   * mean the two surfaces silently diverge.
   */
  byManga: UnreadMangaEntry[]
}

export function summarizeUnread(
  follows: UnreadFollow[],
  chapters: UnreadChapter[],
  progress: UnreadProgress[],
): UnreadSummary {
  const followedAt = new Map<string, number>()
  for (const follow of follows) {
    if (!follow.followedAt) continue
    const at = Date.parse(follow.followedAt)
    if (!Number.isNaN(at)) followedAt.set(follow.mangaId, at)
  }

  const lastRead = new Map<string, number>()
  for (const row of progress) {
    // If several records come for the same series, the FURTHEST wins:
    // an earlier record would show read chapters as "new" again.
    const current = lastRead.get(row.mangaId) ?? 0
    if (row.lastReadChapter > current) lastRead.set(row.mangaId, row.lastReadChapter)
  }

  /** UNIQUE unread chapter numbers per series and the newest chapter's time. */
  const perManga = new Map<string, { numbers: Set<number>; newestAt: number }>()

  for (const chapter of chapters) {
    const since = followedAt.get(chapter.mangaId)
    if (since === undefined) continue

    if (!chapter.publishAt) continue
    const publishedAt = Date.parse(chapter.publishAt)
    if (Number.isNaN(publishedAt)) continue

    // A chapter published BEFORE following is not "new", it is back catalog.
    if (publishedAt <= since) continue

    // The last chapter read and earlier ones are not counted.
    if (chapter.chapterNumber <= (lastRead.get(chapter.mangaId) ?? 0)) continue

    const entry = perManga.get(chapter.mangaId) ?? { numbers: new Set<number>(), newestAt: 0 }
    // Set: rows with the same number from different fansubs count as ONE.
    entry.numbers.add(chapter.chapterNumber)
    if (publishedAt > entry.newestAt) entry.newestAt = publishedAt
    perManga.set(chapter.mangaId, entry)
  }

  const byManga: UnreadMangaEntry[] = Array.from(perManga.entries())
    // En yeni bolumu olan seri once: seride kapak gosterecegiz, sirali olmali.
    .sort((a, b) => b[1].newestAt - a[1].newestAt)
    .map(([mangaId, entry]) => ({
      mangaId,
      count: entry.numbers.size,
      newestAt: entry.newestAt,
      numbers: Array.from(entry.numbers).sort((a, b) => a - b),
    }))

  const count = byManga.reduce((total, entry) => total + entry.count, 0)

  return { count, mangaIds: byManga.map((entry) => entry.mangaId), byManga }
}
