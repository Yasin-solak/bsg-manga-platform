import { useEffect, useMemo, useState } from 'react'
import { selectCollections } from '@/lib/collectionPersonalization'
import { normalizeGenreId, toCanonicalGenreId } from '@/pages/explore/explorePageShared'
import { loadLuckyPickContext } from '@/services/luckyPickService'
import { loadUnreadSummary } from '@/services/unreadChapterService'
import type { ExploreCollectionConfig } from '@/services/exploreConfigService'

/**
 * The home page's PERSONALIZATION data: unread chapter summary and collections picked by the user's
 * genres.
 *
 * In a separate file from HomePage: the page passed the 850-line guard and these three
 * hooks share one topic (user-specific data).
 */

export interface HomePersonalization {
  unreadCount: number
  unreadCovers: string[]
  personalizedCollections: ExploreCollectionConfig[]
}

export function useHomePersonalization(
  userId: string | undefined,
  collections: ExploreCollectionConfig[],
): HomePersonalization {
  /*
   * Unread chapter summary: chapters in followed series published after following and
   * past the last chapter read.
   * Signed in only; guests have no follow list.
   */
  const [unread, setUnread] = useState<{ count: number; covers: string[] }>({ count: 0, covers: [] })
  useEffect(() => {
    if (!userId) { setUnread({ count: 0, covers: [] }); return }
    let cancelled = false
    loadUnreadSummary(userId)
      .then((summary) => {
        if (!cancelled) setUnread({ count: summary.count, covers: summary.covers })
      })
      .catch(() => { if (!cancelled) setUnread({ count: 0, covers: [] }) })
    return () => { cancelled = true }
  }, [userId])

  /*
   * Genre signals come from the SAME source as "Lucky pick" (onboarding preferences +
   * reading history). Sharing a signal across two surfaces is deliberate: if a user sees
   * "for you" in one place but not the other, they cannot tell which
   * is right.
   */
  const [genreSignals, setGenreSignals] = useState<string[]>([])
  useEffect(() => {
    if (!userId) { setGenreSignals([]); return }
    let cancelled = false
    loadLuckyPickContext(userId)
      .then((ctx) => { if (!cancelled) setGenreSignals(ctx.genreSignals) })
      .catch(() => { if (!cancelled) setGenreSignals([]) })
    return () => { cancelled = true }
  }, [userId])

  /*
   * Signals are converted to CANONICAL genre ids.
   *
   * `mangas.genres` and `users.preferred_genres` hold TURKISH ('Aksiyon',
   * 'Doğaüstü'); collections' `targetGenreId` is English
   * ('action', 'supernatural'). Comparing without converting matched NOTHING
   * and personalization silently always fell to the default order. Only live data
   * revealed this, since the "no match" branch already returns the default and
   * does not look like an error on screen.
   */
  const canonicalGenreSignals = useMemo(
    () => genreSignals.map((genre) => toCanonicalGenreId(normalizeGenreId(genre))),
    [genreSignals],
  )

  const personalizedCollections = useMemo(
    () => selectCollections({ collections, genreSignals: canonicalGenreSignals, limit: 4 }).items,
    [collections, canonicalGenreSignals],
  )

  return {
    unreadCount: unread.count,
    unreadCovers: unread.covers,
    personalizedCollections,
  }
}
