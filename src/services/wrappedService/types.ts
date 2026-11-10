export type WrappedPeriod = '30d' | '90d' | '365d' | 'all'

export interface WrappedGenreStat {
  genre: string
  count: number
}

export interface WrappedFansubStat {
  fansubId: string
  fansubName: string
  readCount: number
}

export interface WrappedMangaCard {
  mangaId: string
  title: string
  slug: string
  coverImageUrl?: string
  chapterNumber?: number
  readAt: string
  fansubName?: string
}

export interface WrappedWeekdayActivity {
  dayIndex: number
  label: string
  count: number
}

export interface WrappedSummary {
  period: WrappedPeriod
  periodLabel: string
  generatedAt: string
  totalReadMangas: number
  totalFollowedMangas: number
  mangaCommentsCount: number
  avgLastChapter: number
  latestReadAt?: string
  topGenres: WrappedGenreStat[]
  topFansubs: WrappedFansubStat[]
  recentMangas: WrappedMangaCard[]
  weekdayActivity: WrappedWeekdayActivity[]
  highlights: string[]
}
