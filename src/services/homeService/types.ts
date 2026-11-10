import type { CommunityPost, Fansub, Manga } from '@/types'

export interface HomeFeedParams {
  trendingLimit?: number
  latestLimit?: number
  fansubLimit?: number
  announcementLimit?: number
  sidebarPopularMangaLimit?: number
}

export interface HomeFeedData {
  trendingMangas: Manga[]
  latestMangas: Manga[]
  sidebarPopularMangas: Manga[]
  fansubs: Fansub[]
  announcements: CommunityPost[]
}

export interface HomeDiscussionHighlightManga {
  mangaId: string
  mangaTitle: string
  mangaSlug?: string
  coverImageUrl?: string
  commentCount: number
  recentCommentCount: number
  lastCommentAt?: string
}

export interface HomeDiscussionHighlightChapter {
  chapterId: string
  mangaId: string
  mangaTitle: string
  mangaSlug?: string
  chapterNumber: number
  chapterTitle?: string
  coverImageUrl?: string
  commentCount: number
  recentCommentCount: number
  lastCommentAt?: string
}

export interface HomeDiscussionHighlightsData {
  windowDays: number
  topMangas: HomeDiscussionHighlightManga[]
  topChapters: HomeDiscussionHighlightChapter[]
}
