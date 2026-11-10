/**
 * Read tracking (v2).
 *
 * **Why a separate file and why critical:** v1 recorded a read when a chapter opened
 * (`track_manga_read` + the user's reading history); v2 did NOT do this at all.
 * When /oku became the primary reader, reads silently stopped being counted:
 * view counts, "continue where you left off", profile stats and quests tied to
 * read counts were not fed. Since it raised no error it went unnoticed.
 *
 * Rules are the SAME as v1 and come from the same shared helpers; a read count should not
 * mean different things in the two readers:
 * - A page counts after staying VISIBLE for at least `READ_TRACK_MIN_VISIBLE_MS`
 * (a tab opened and closed right away is not a read).
 * - In a background tab it waits, and retries on coming to front.
 * - `shouldTrackRead` does not recount the same chapter in a session.
 * - Reading history is written only for signed-in users.
 */

import { useEffect } from 'react'
import { trackMangaRead } from '@/services/mangaService'
import { addReadingHistory } from '@/services/userService'
import { getReaderClientKey } from '@/services/readTrackingService'
import { shouldTrackRead } from '@/pages/mangaReader/readerChapterRouting'

/** Visible time needed before counting a read (same as v1). */
export const READER_V2_READ_TRACK_MIN_VISIBLE_MS = 8_000
/** Sekme arka plandayken yeniden deneme araligi. */
const READ_TRACK_RETRY_MS = 1_500

interface UseReaderV2ReadTrackingArgs {
  mangaId: string | null | undefined
  chapterId: string | null | undefined
  chapterNumber: number | null | undefined
  currentUserId: string | null | undefined
}

export function useReaderV2ReadTracking({
  mangaId,
  chapterId,
  chapterNumber,
  currentUserId,
}: UseReaderV2ReadTrackingArgs) {
  useEffect(() => {
    if (!mangaId || !chapterId || typeof chapterNumber !== 'number') return

    const clientKey = getReaderClientKey()
    const loadedAt = Date.now()
    let cancelled = false
    let timeoutId = 0

    const attempt = () => {
      if (cancelled) return

      // Arka plandaki sekme okuma sayilmaz; one gelince tekrar denenir.
      if (document.visibilityState !== 'visible') {
        timeoutId = window.setTimeout(attempt, READ_TRACK_RETRY_MS)
        return
      }

      const elapsed = Date.now() - loadedAt
      if (elapsed < READER_V2_READ_TRACK_MIN_VISIBLE_MS) {
        timeoutId = window.setTimeout(attempt, READER_V2_READ_TRACK_MIN_VISIBLE_MS - elapsed)
        return
      }

      if (!shouldTrackRead(mangaId, chapterId, chapterId)) return

      void trackMangaRead(mangaId, chapterId, chapterNumber, clientKey)
      if (currentUserId) {
        void addReadingHistory(currentUserId, mangaId, chapterId, chapterNumber)
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') attempt()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    timeoutId = window.setTimeout(attempt, READER_V2_READ_TRACK_MIN_VISIBLE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [chapterId, chapterNumber, currentUserId, mangaId])
}
