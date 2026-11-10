import { supabase } from '../supabase'
import type {
  ChapterPipelineStatus,
  ChaptersOverviewActivityItem,
  ChaptersOverviewCalendarDay,
  ChaptersOverviewChapter,
  ChaptersOverviewMangaGroup,
  ChaptersOverviewMetrics,
  FansubManageChaptersOverview,
} from './types'

type MangaRow = {
  id: string
  title: string | null
  slug: string | null
  cover_image_url: string | null
  total_views: number | null
  is_active: boolean | null
}

type ChapterRow = {
  id: string
  manga_id: string
  chapter_number: number | null
  title: string | null
  pages: unknown
  is_approved: boolean | null
  is_active: boolean | null
  publish_at: string | null
  created_at: string
  updated_at: string | null
}

type CommentRow = {
  chapter_id: string | null
  manga_id: string | null
  created_at: string | null
}

function pageCountOf(pages: unknown): number {
  return Array.isArray(pages) ? pages.length : 0
}

function resolveStatus(row: ChapterRow, nowMs: number): ChapterPipelineStatus {
  if (row.is_active === false) return 'draft'
  if (!row.is_approved) return 'pending'
  const publishMs = row.publish_at ? new Date(row.publish_at).getTime() : null
  if (publishMs != null && Number.isFinite(publishMs) && publishMs > nowMs) return 'scheduled'
  return 'published'
}

function monthKey(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * getFansubManageChaptersOverview: enriched overview for the Chapters "publishing line".
 * Client-side aggregation: manga + chapters + comments are readable by fansub staff through
 * RLS; fetching by window/limit keeps it light.
 *
 * Note: per-chapter view data does NOT exist in the schema (chapters has no view column),
 * so that field is not produced. Comment counts are really calculated
 * from manga_comments.chapter_id.
 */
export async function getFansubManageChaptersOverview(
  fansubId: string,
): Promise<FansubManageChaptersOverview> {
  const nowMs = Date.now()
  const now = new Date()
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`

  const [mangaRes, chapterRes] = await Promise.all([
    supabase
      .from('mangas')
      .select('id, title, slug, cover_image_url, total_views, is_active')
      .eq('fansub_id', fansubId)
      .limit(2000),
    supabase
      .from('chapters')
      .select('id, manga_id, chapter_number, title, pages, is_approved, is_active, publish_at, created_at, updated_at')
      .eq('fansub_id', fansubId)
      .limit(5000),
  ])

  const mangas = (mangaRes.data as MangaRow[] | null) || []
  const chapters = (chapterRes.data as ChapterRow[] | null) || []
  const mangaIds = mangas.map((manga) => manga.id)

  let comments: CommentRow[] = []
  if (mangaIds.length > 0) {
    const commentRes = await supabase
      .from('manga_comments')
      .select('chapter_id, manga_id, created_at')
      .in('manga_id', mangaIds)
      .eq('is_active', true)
      .limit(20000)
    comments = (commentRes.data as CommentRow[] | null) || []
  }

  // Yorum sayaclari
  const commentByChapter = new Map<string, number>()
  const commentByManga = new Map<string, number>()
  let totalComments = 0
  let thisMonthComments = 0
  let prevMonthComments = 0
  for (const comment of comments) {
    totalComments += 1
    if (comment.chapter_id) commentByChapter.set(comment.chapter_id, (commentByChapter.get(comment.chapter_id) || 0) + 1)
    if (comment.manga_id) commentByManga.set(comment.manga_id, (commentByManga.get(comment.manga_id) || 0) + 1)
    const mk = monthKey(comment.created_at)
    if (mk === thisMonth) thisMonthComments += 1
    else if (mk === prevMonth) prevMonthComments += 1
  }

  // Group chapters by manga
  const groupMap = new Map<string, ChaptersOverviewMangaGroup>()
  for (const manga of mangas) {
    groupMap.set(manga.id, {
      id: manga.id,
      title: manga.title || 'Adsiz manga',
      slug: manga.slug || '',
      coverImageUrl: manga.cover_image_url,
      totalViews: Math.max(0, Number(manga.total_views) || 0),
      totalChapters: 0,
      publishedChapters: 0,
      commentTotal: commentByManga.get(manga.id) || 0,
      avgPages: 0,
      chapters: [],
    })
  }

  const calendarMap = new Map<string, ChaptersOverviewCalendarDay>()
  let publishedChapters = 0
  let thisMonthPublished = 0
  let prevMonthPublished = 0
  const allOverviewChapters: ChaptersOverviewChapter[] = []

  for (const row of chapters) {
    const status = resolveStatus(row, nowMs)
    const group = groupMap.get(row.manga_id)
    const overviewChapter: ChaptersOverviewChapter = {
      id: row.id,
      mangaId: row.manga_id,
      mangaTitle: group?.title || 'Adsiz manga',
      mangaSlug: group?.slug || '',
      chapterNumber: Number(row.chapter_number) || 0,
      title: row.title,
      status,
      publishAt: row.publish_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at,
      pageCount: pageCountOf(row.pages),
      commentCount: commentByChapter.get(row.id) || 0,
    }
    allOverviewChapters.push(overviewChapter)

    if (group) {
      group.chapters.push(overviewChapter)
      group.totalChapters += 1
      if (status === 'published') group.publishedChapters += 1
    }

    if (status === 'published') {
      publishedChapters += 1
      const mk = monthKey(row.publish_at || row.created_at)
      if (mk === thisMonth) thisMonthPublished += 1
      else if (mk === prevMonth) prevMonthPublished += 1
    }

    // Calendar: chapters with publish_at, by day
    if (row.publish_at) {
      const dayKey = row.publish_at.slice(0, 10)
      const entry = calendarMap.get(dayKey) || { date: dayKey, published: 0, scheduled: 0, pending: 0 }
      if (status === 'scheduled') entry.scheduled += 1
      else if (status === 'pending') entry.pending += 1
      else if (status === 'published') entry.published += 1
      calendarMap.set(dayKey, entry)
    }
  }

  // Sort within groups (chapter number descending) + average pages
  for (const group of groupMap.values()) {
    group.chapters.sort((a, b) => b.chapterNumber - a.chapterNumber)
    const totalPages = group.chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0)
    group.avgPages = group.chapters.length > 0 ? Math.round(totalPages / group.chapters.length) : 0
  }

  // Groups: sorted by most recently updated
  const groups = Array.from(groupMap.values())
    .filter((group) => group.totalChapters > 0)
    .sort((a, b) => {
      const aLatest = a.chapters[0]?.updatedAt || ''
      const bLatest = b.chapters[0]?.updatedAt || ''
      return bLatest.localeCompare(aLatest)
    })

  const recent: ChaptersOverviewActivityItem[] = [...allOverviewChapters]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
    .map((chapter) => ({
      id: chapter.id,
      mangaTitle: chapter.mangaTitle,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.status,
      at: chapter.updatedAt,
    }))

  const metrics: ChaptersOverviewMetrics = {
    totalManga: mangas.length,
    activeManga: mangas.filter((manga) => manga.is_active !== false).length,
    totalChapters: chapters.length,
    publishedChapters,
    thisMonthPublished,
    thisMonthPublishedDeltaPct: deltaPct(thisMonthPublished, prevMonthPublished),
    totalViews: mangas.reduce((sum, manga) => sum + Math.max(0, Number(manga.total_views) || 0), 0),
    totalComments,
    thisMonthComments,
    thisMonthCommentsDeltaPct: deltaPct(thisMonthComments, prevMonthComments),
  }

  return {
    metrics,
    groups,
    calendar: Array.from(calendarMap.values()),
    recent,
  }
}
