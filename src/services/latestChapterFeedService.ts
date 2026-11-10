import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { listPublicReleaseSchedule } from './releaseScheduleService'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/**
 * Chapter + FANSUB + publish time for the home page "New Chapters" list.
 *
 * The `latest_mangas` field of the home RPC returns MANGA; who translated and when the
 * chapter came out are not there. Those are the two most wanted facts on a chapter
 * row: whose translation, and when it was released.
 *
 * A separate query instead of extending the RPC: `chapters` is already publicly readable
 * (active + approved), so no migration is needed and the home page's current call
 * is unchanged.
 */

const latestChapterLogger = createScopedLogger('latestChapterFeedService')

export interface LatestChapterItem {
  chapterId: string
  chapterNumber: number
  /** Nitro erken erisim hesabinin girdisi. */
  publishAt: string | null
  mangaId: string
  mangaSlug?: string
  mangaTitle: string
  mangaCoverImage: string
  fansubId?: string
  fansubName?: string
  fansubSlug?: string
  fansubAvatarUrl?: string
}

interface DbRow {
  id: string
  chapter_number: number | string
  publish_at: string | null
  created_at: string
  mangas: {
    id: string
    title: string
    slug: string | null
    cover_image_url: string | null
  } | null
  fansubs: {
    id: string
    name: string
    slug: string
    avatar_url: string | null
  } | null
}

export async function listLatestChaptersWithFansub(limit = 6): Promise<LatestChapterItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit || 6), 1), 30)
  const requestContext = createRequestContext('latestChapterFeedService', 'list-latest-chapters')
  const nowIso = new Date().toISOString()

  const { data, error } = await withServiceTimeout(
    (signal) =>
      withAbortSignal(
        supabase
          .from('chapters')
          .select(
            'id,chapter_number,publish_at,created_at,mangas(id,title,slug,cover_image_url),fansubs(id,name,slug,avatar_url)',
          )
          .eq('is_active', true)
          .eq('is_approved', true)
          /*
            HENUZ YAYINLANMAMIS bolum "yeni bolum" degildir; onun yeri Takvim.
            Siradan kullanicida RLS zaten suzuyordu, ama admin ve fansub
            yetkilisi butun satirlari gorebildigi icin gelecege zamanlanmis
            bolumler listeye siziyordu: "8 gun sonra" cikan bir satirin
            yaninda "237 saat sonra herkese acik" yaziyordu ve okunamiyordu.
            Kosul app_private.can_current_user_access_chapter ile ayni:
            publish_at bos ise acik, gelecekse KIMSEYE acik degil (Nitro dahil).
          */
          .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
          .order('publish_at', { ascending: false, nullsFirst: false })
          .limit(safeLimit),
        signal,
      ),
    { label: 'Son bolumleri listeleme' },
  )

  if (error) {
    latestChapterLogger.warn({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Son bolumler yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    // Returns an empty list: the home page must not break because of this rail, and the existing
    // manga-based list stays as a fallback.
    return []
  }

  const rows = (data || []) as unknown as DbRow[]

  return rows
    // Mangasi cozulemeyen satir gosterilemez; basliksiz bir bolum satiri
    // kullaniciya hicbir sey soylemez.
    .filter((row) => row.mangas?.id && row.mangas.title)
    .map((row) => ({
      chapterId: row.id,
      chapterNumber: Number(row.chapter_number),
      publishAt: row.publish_at ?? row.created_at ?? null,
      mangaId: row.mangas!.id,
      mangaSlug: row.mangas!.slug ?? undefined,
      mangaTitle: row.mangas!.title,
      mangaCoverImage: row.mangas!.cover_image_url ?? '',
      fansubId: row.fansubs?.id,
      fansubName: row.fansubs?.name,
      fansubSlug: row.fansubs?.slug,
      fansubAvatarUrl: row.fansubs?.avatar_url ?? undefined,
    }))
}

/**
 * Schedule badge: chapters released to the public TODAY.
 *
 * The `chapters` table used to be queried directly and the badge ALWAYS stayed 0 for signed-out /
 * non-Nitro users: the chapters_select_public policy filters through the
 * early access gate, so all of "today's" chapters
 * (36 hours not yet passed) were hidden from the caller. The badge could not count
 * what it could not see.
 *
 * It now reads from the SAME source as the Schedule page, so the badge number and
 * the list inside the schedule agree; two separate queries can no longer
 * give two answers.
 *
 * The day boundary is the USER'S local day: if the server said "today" by UTC,
 * in Turkey the counter would talk about the wrong day after midnight.
 *
 * Several fansubs can upload the same chapter (chapters uniqueness
 * manga_id+chapter_number+fansub_id); if the badge says "how many new chapters",
 * it must count UNIQUE manga+chapter, not rows.
 */
export async function countChaptersPublishedToday(): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  try {
    const entries = await listPublicReleaseSchedule({
      from: start.toISOString(),
      daysAhead: 1,
      limit: 300,
    })

    const seen = new Set<string>()
    for (const entry of entries) {
      seen.add(`${entry.mangaId}::${entry.chapterNumber}`)
    }
    return seen.size
  } catch (error) {
    latestChapterLogger.warn({
      event: 'count-today',
      message: 'Bugunku bolum sayisi alinamadi.',
      error,
    })
    // If the count is unknown the badge is NOT shown at all; returning 0 would mean
    // "no chapters today", which would be false.
    return 0
  }
}
