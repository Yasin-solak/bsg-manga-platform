import type { Manga } from '@/types'

export interface DbManga {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  cover_image_url: string | null
  description: string | null
  status: string | null
  rating: number | null
  total_ratings: number | null
  total_views: number | null
  follower_count?: number | null
  is_new: boolean | null
  last_chapter_number: number | null
  genres: string[] | null
  /** manga | manhwa | manhua | webtoon | yerli. The series TYPE, not the source LANGUAGE. */
  series_type?: string | null
  /** 18+ label. Also enforced in RLS; hiding it in the UI alone is not enough. */
  is_mature?: boolean | null
  created_at: string
  updated_at: string
}

export interface DbSearchPublicMangaRow extends DbManga {
  search_score: number | null
  total_count: number | null
}

export interface DbChapter {
  id: string
  manga_id: string
  chapter_number: number
  title: string | null
  notes?: string | null
  pages: unknown
  /** {"<page-ref>":{"w":1200,"h":1800}}; null = unknown (old chapters). */
  page_dimensions?: unknown
  publish_at: string | null
  is_approved?: boolean | null
  is_active?: boolean | null
  created_at: string
}

export interface DbChapterFansubRow {
  id: string
  name: string
  slug: string
  avatar_url?: string | null
  active_name_style?: Record<string, unknown> | null
}

export interface DbChapterWithFansub extends DbChapter {
  fansub?: DbChapterFansubRow | null
}

export interface DbPendingContentRevisionRow {
  target_type: 'manga' | 'chapter'
  target_id: string
  change_action: 'create' | 'edit'
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}

export interface DbPopularWindowManga {
  id: string
  title: string
  cover_image_url: string | null
  last_chapter_number: number | null
  is_new: boolean | null
  rating: number | null
  total_views: number | null
  recent_views: number | null
  updated_at: string
}

export interface DbLatestChapterRow {
  id: string
  manga_id: string
  chapter_number: number
  title: string | null
  publish_at: string | null
  created_at: string
}

export type PendingRevisionMap = Map<string, DbPendingContentRevisionRow>

export interface SubmitMangaRatingRpcRow {
  average_rating: number | null
  total_ratings: number | null
  user_rating: number | null
}

export interface SubmitMangaRatingResult {
  averageRating: number | null
  totalRatings: number
  userRating: number
}

export interface MangaFilterParams {
  search?: string
  genres?: string[]
  status?: string
  sort?: string
  page?: number
  limit?: number
}

export const MANGA_PUBLIC_SELECT = `
  id,
  fansub_id,
  title,
  slug,
  cover_image_url,
  description,
  status,
  rating,
  total_ratings,
  total_views,
  is_new,
  last_chapter_number,
  genres,
  series_type,
  is_mature,
  created_at,
  updated_at
`

export const CHAPTER_LIST_SELECT = `
  id,
  manga_id,
  chapter_number,
  title,
  publish_at,
  created_at
`

export const CHAPTER_DETAIL_SELECT = `
  id,
  manga_id,
  chapter_number,
  title,
  notes,
  pages,
  page_dimensions,
  publish_at,
  created_at
`

/**
 * Fallback selection for environments without the `page_dimensions` column yet.
 * The column is only for reserving space; without it the reader measures the ratio from the image.
 */
export const CHAPTER_DETAIL_SELECT_WITHOUT_PAGE_DIMENSIONS = CHAPTER_DETAIL_SELECT
  .split('\n')
  .filter((line) => !line.trim().startsWith('page_dimensions'))
  .join('\n')

export const ALLOWED_SORTS = new Set(['popular', 'latest', 'rating', 'title'])
export const ALLOWED_STATUSES = new Set(['all', 'ongoing', 'completed', 'hiatus', 'new'])

export type { Manga }
