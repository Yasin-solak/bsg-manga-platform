export type MangaListPeriod = 'weekly' | 'monthly'

export type MangaListSort = 'newest' | 'recently_updated' | 'top_rated' | 'most_commented'

export type MangaListCommentSortBy = 'newest' | 'oldest' | 'popular'

export interface MangaListSummary {
  id: string
  title: string
  description: string
  isPublic: boolean
  ownerId: string
  ownerUsername: string
  ownerAvatar: string
  ownerFrameType?: string
  ownerProfileBackgroundStyle?: string
  ownerProfileBackgroundVideoUrl?: string
  ownerProfilePatternStyle?: string
  categoryId?: string
  coverMangaId?: string
  coverMangaTitle?: string
  coverMangaSlug?: string
  coverImage?: string
  previewImages?: string[]
  itemsCount: number
  ratingsCount: number
  ratingAvg: number
  commentsCount: number
  periodRatingCount?: number
  periodCommentCount?: number
  score?: number
  createdAt: string
  updatedAt?: string
}

export interface MangaListItem {
  id: string
  mangaId: string
  position: number
  note?: string
  title: string
  slug?: string
  coverImage: string
  lastChapter?: string
  isNew?: boolean
  rating?: number
  views?: number
  /** Manga genres, fed from the mangas.genres text[] column in the DB */
  genres?: string[]
}

export interface MangaListDetail extends MangaListSummary {
  isPublic: boolean
  items: MangaListItem[]
  myRating: number | null
  canEdit: boolean
}
