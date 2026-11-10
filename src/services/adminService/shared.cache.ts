import {
  ADMIN_MANGA_CONTROL_DETAIL_CACHE_TTL_MS,
  adminMangaControlDetailCache,
} from './shared.constants'
import type { AdminMangaControlDetail } from './types'

export function cloneAdminMangaControlDetail(detail: AdminMangaControlDetail): AdminMangaControlDetail {
  return {
    ...detail,
    genres: [...detail.genres],
    chapterStats: { ...detail.chapterStats },
    creatorUser: detail.creatorUser ? { ...detail.creatorUser } : undefined,
    chapters: detail.chapters.map((item) => ({ ...item })),
    chapterContributorFansubs: detail.chapterContributorFansubs.map((item) => ({ ...item })),
    comments: detail.comments.map((item) => ({ ...item })),
    ratings: detail.ratings.map((item) => ({ ...item })),
  }
}

export function readAdminMangaControlDetailCache(mangaId: string): AdminMangaControlDetail | null {
  const cached = adminMangaControlDetailCache.get(mangaId)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    adminMangaControlDetailCache.delete(mangaId)
    return null
  }
  return cloneAdminMangaControlDetail(cached.value)
}

export function writeAdminMangaControlDetailCache(mangaId: string, detail: AdminMangaControlDetail) {
  adminMangaControlDetailCache.set(mangaId, {
    value: cloneAdminMangaControlDetail(detail),
    expiresAt: Date.now() + ADMIN_MANGA_CONTROL_DETAIL_CACHE_TTL_MS,
  })
}
