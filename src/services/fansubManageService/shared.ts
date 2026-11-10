import type {
  FansubManageChapter,
  FansubManageChapterEditData,
  FansubManageManga,
  FansubManagePagedResult,
} from './types'
import { normalizeChapterPageRef } from '../assetUrlService'

export interface FansubManageChapterRow {
  id: string
  manga_id: string
  manga_title: string
  manga_slug: string | null
  chapter_number: number
  title: string | null
  is_approved: boolean
  publish_at: string | null
  created_at: string
  updated_at: string
}

export interface FansubManageChapterEditRow {
  id: string
  fansub_id: string | null
  manga_id: string
  chapter_number: number
  title: string | null
  pages: string[] | null
  is_approved: boolean
  is_active: boolean
  updated_at: string
}

export interface FansubManageMangaRow {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  description: string | null
  status: 'ongoing' | 'completed' | 'hiatus'
  genres: string[] | null
  cover_image_url: string | null
  last_chapter_number: number | null
  total_views: number | null
  rating: number | null
  total_ratings: number | null
  is_approved: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  author?: string | null
  artist?: string | null
  is_mature?: boolean | null
}

export function normalizePage(value?: number) {
  if (!Number.isFinite(value) || !value || value < 1) return 1
  return Math.floor(value)
}

export function normalizeLimit(value?: number) {
  if (!Number.isFinite(value) || !value) return 20
  return Math.min(Math.max(Math.floor(value), 1), 50)
}

export function mergeUniqueIds(...lists: Array<string[] | undefined>) {
  const unique = new Set<string>()
  lists.flatMap((list) => list || []).forEach((id) => {
    if (typeof id !== 'string' || !id.trim()) return
    unique.add(id.trim())
  })
  return Array.from(unique)
}

export function parseRpcPagedResult<TInput, TOutput>(
  raw: unknown,
  mapItem: (item: TInput) => TOutput,
): FansubManagePagedResult<TOutput> {
  const typed = (raw ?? {}) as {
    items?: TInput[]
    total?: number
    page?: number
    limit?: number
  }

  const items = Array.isArray(typed.items) ? typed.items.map(mapItem) : []
  const total = Number.isFinite(typed.total) ? Number(typed.total) : 0
  const page = Number.isFinite(typed.page) ? Number(typed.page) : 1
  const limit = Number.isFinite(typed.limit) ? Number(typed.limit) : 20

  return { items, total, page, limit }
}

export function mapChapterRow(row: FansubManageChapterRow): FansubManageChapter {
  return {
    id: row.id,
    mangaId: row.manga_id,
    mangaTitle: row.manga_title,
    mangaSlug: row.manga_slug ?? undefined,
    chapterNumber: Number(row.chapter_number),
    title: row.title ?? undefined,
    isApproved: Boolean(row.is_approved),
    publishAt: row.publish_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapChapterEditRow(row: FansubManageChapterEditRow): FansubManageChapterEditData {
  return {
    id: row.id,
    fansubId: row.fansub_id || undefined,
    mangaId: row.manga_id,
    chapterNumber: Number(row.chapter_number),
    title: row.title || undefined,
    pages: Array.isArray(row.pages)
      ? row.pages
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        .map((url) => normalizeChapterPageRef(url) || '')
        .filter(Boolean)
      : [],
    isApproved: Boolean(row.is_approved),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
  }
}

export function mapMangaRow(row: FansubManageMangaRow, followerCount: number): FansubManageManga {
  return {
    id: row.id,
    fansubId: row.fansub_id || undefined,
    title: row.title,
    slug: row.slug,
    description: row.description || undefined,
    status: row.status,
    genres: row.genres || [],
    coverImageUrl: row.cover_image_url || undefined,
    lastChapterNumber: row.last_chapter_number ?? undefined,
    totalViews: Number(row.total_views || 0),
    followerCount,
    rating: row.rating ?? undefined,
    totalRatings: Number(row.total_ratings || 0),
    isApproved: Boolean(row.is_approved),
    isActive: Boolean(row.is_active),
    author: row.author || undefined,
    artist: row.artist || undefined,
    isMature: row.is_mature === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
