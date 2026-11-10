import { supabase } from '../supabase'
import {
  adminMangaControlDetailCache,
  adminMangaControlDetailInFlight,
  type DbAdminMangaChapterRow,
  type DbAdminMangaCommentRow,
  type DbAdminMangaControlRow,
  type DbAdminMangaRatingRow,
  cloneAdminMangaControlDetail,
  fetchFansubAdminUsersByFansubIds,
  fetchMangaFollowerCountsByMangaIds,
  mapDbAdminMangaChapter,
  mapDbAdminMangaComment,
  mapDbAdminMangaControl,
  mapDbAdminMangaRating,
  mapDbMangaChapterStats,
  readAdminMangaControlDetailCache,
  writeAdminMangaControlDetailCache,
} from './shared'
import type {
  AdminMangaControlDetail,
  AdminMangaFansubMini,
} from './types'

export async function getAdminMangaControlDetail(mangaId: string): Promise<AdminMangaControlDetail> {
  const normalizedMangaId = mangaId.trim()
  if (!normalizedMangaId) throw new Error('Manga id zorunludur.')

  const cached = readAdminMangaControlDetailCache(normalizedMangaId)
  if (cached) return cached

  const inFlight = adminMangaControlDetailInFlight.get(normalizedMangaId)
  if (inFlight) return cloneAdminMangaControlDetail(await inFlight)

  const request = getAdminMangaControlDetailFresh(normalizedMangaId)
  adminMangaControlDetailInFlight.set(normalizedMangaId, request)
  try {
    const detail = await request
    writeAdminMangaControlDetailCache(normalizedMangaId, detail)
    return cloneAdminMangaControlDetail(detail)
  } finally {
    adminMangaControlDetailInFlight.delete(normalizedMangaId)
  }
}

export function invalidateAdminMangaControlDetailCache(mangaId?: string) {
  if (!mangaId) {
    adminMangaControlDetailCache.clear()
    adminMangaControlDetailInFlight.clear()
    return
  }

  const normalizedMangaId = mangaId.trim()
  if (!normalizedMangaId) return
  adminMangaControlDetailCache.delete(normalizedMangaId)
  adminMangaControlDetailInFlight.delete(normalizedMangaId)
}

export async function getAdminMangaControlDetailFresh(mangaId: string): Promise<AdminMangaControlDetail> {
  const { data: mangaData, error: mangaError } = await supabase
    .from('mangas')
    .select(`
      id,
      fansub_id,
      title,
      slug,
      cover_image_url,
      description,
      status,
      is_approved,
      is_active,
      is_new,
      total_views,
      total_ratings,
      rating,
      genres,
      series_type,
      is_mature,
      last_chapter_number,
      created_at,
      updated_at,
      fansub:fansub_id (
        id,
        name,
        slug
      )
    `)
    .eq('id', mangaId)
    .single()

  if (mangaError) {
    console.error('[adminService] getAdminMangaControlDetail manga error', mangaError)
    throw mangaError
  }

  const mangaRow = mangaData as DbAdminMangaControlRow
  const creatorByFansubId = await fetchFansubAdminUsersByFansubIds(
    mangaRow.fansub_id ? [mangaRow.fansub_id] : [],
  )

  const [
    { data: chapterData, error: chapterError },
    { data: commentData, error: commentError },
    { data: ratingData, error: ratingError },
  ] = await Promise.all([
    supabase
      .from('chapters')
      .select(`
        id,
        fansub_id,
        chapter_number,
        title,
        is_approved,
        is_active,
        publish_at,
        created_at,
        updated_at,
        fansub:fansub_id (
          id,
          name,
          slug
        )
      `)
      .eq('manga_id', mangaId)
      .order('chapter_number', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('manga_comments')
      .select(`
        id,
        manga_id,
        user_id,
        parent_id,
        content,
        likes,
        is_active,
        is_pinned,
        is_spoiler,
        created_at,
        updated_at,
        user:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('manga_id', mangaId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('manga_ratings')
      .select(`
        manga_id,
        user_id,
        rating,
        created_at,
        updated_at,
        user:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('manga_id', mangaId)
      .order('updated_at', { ascending: false })
      .limit(500),
  ])

  if (chapterError) {
    console.error('[adminService] getAdminMangaControlDetail chapter error', chapterError)
    throw chapterError
  }
  if (commentError) {
    console.error('[adminService] getAdminMangaControlDetail comment error', commentError)
    throw commentError
  }
  if (ratingError) {
    console.error('[adminService] getAdminMangaControlDetail rating error', ratingError)
    throw ratingError
  }

  const chapters = (chapterData || []) as DbAdminMangaChapterRow[]
  const chapterStatsByMangaId = mapDbMangaChapterStats(
    chapters.map((chapter) => ({
      manga_id: mangaId,
      is_approved: chapter.is_approved,
      is_active: chapter.is_active,
    })),
  )
  const followerCountByMangaId = await fetchMangaFollowerCountsByMangaIds([mangaId])

  const mapped = mapDbAdminMangaControl(
    mangaRow,
    chapterStatsByMangaId,
    followerCountByMangaId,
    creatorByFansubId,
  )
  const mappedChapters = chapters.map(mapDbAdminMangaChapter)
  const chapterContributorFansubs = new Map<string, AdminMangaFansubMini>()

  mappedChapters.forEach((chapter) => {
    if (!chapter.fansubId || chapter.fansubName === '-') return
    if (chapterContributorFansubs.has(chapter.fansubId)) return
    chapterContributorFansubs.set(chapter.fansubId, {
      id: chapter.fansubId,
      name: chapter.fansubName,
      slug: chapter.fansubSlug,
    })
  })

  return {
    ...mapped,
    chapters: mappedChapters,
    chapterContributorFansubs: Array.from(chapterContributorFansubs.values()),
    comments: ((commentData || []) as DbAdminMangaCommentRow[]).map(mapDbAdminMangaComment),
    ratings: ((ratingData || []) as DbAdminMangaRatingRow[]).map(mapDbAdminMangaRating),
  }
}
