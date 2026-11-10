export type FansubManageChapterStatusFilter = 'all' | 'approved' | 'pending'

export type FansubManageMangaStatusFilter = 'all' | 'approved' | 'pending'

export type FansubManageMangaVisibilityFilter = 'all' | 'active' | 'inactive'

export interface FansubManageListParams<TStatus extends string> {
  page?: number
  limit?: number
  search?: string
  status?: TStatus
}

export interface FansubManagePagedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface FansubManageChapter {
  id: string
  mangaId: string
  mangaTitle: string
  mangaSlug?: string
  chapterNumber: number
  title?: string
  isApproved: boolean
  publishAt?: string
  createdAt: string
  updatedAt: string
}

export interface FansubManageChapterEditData {
  id: string
  fansubId?: string
  mangaId: string
  chapterNumber: number
  title?: string
  pages: string[]
  isApproved: boolean
  isActive: boolean
  updatedAt: string
}

export interface FansubManageManga {
  id: string
  fansubId?: string
  title: string
  slug: string
  description?: string
  status: 'ongoing' | 'completed' | 'hiatus'
  genres: string[]
  coverImageUrl?: string
  lastChapterNumber?: number
  totalViews: number
  followerCount: number
  rating?: number
  totalRatings: number
  isApproved: boolean
  isActive: boolean
  author?: string
  artist?: string
  isMature?: boolean
  createdAt: string
  updatedAt: string
}

export interface FansubManageAnalyticsOverview {
  followerCount: number
  totalViews: number
  totalDonationAmount: number
  totalDonationCount: number
  totalMangaCount: number
  totalChapterCount: number
  lastDonationAt: string | null
}

export interface FansubManageAnalyticsMomentum {
  newFollowers7d: number
  newFollowers30d: number
  newChapters7d: number
  newChapters30d: number
  donationCount7d: number
  donationCount30d: number
  donationAmount7d: number
  donationAmount30d: number
}

export interface FansubManageAnalyticsStatusGroup {
  approved: number
  pending: number
}

export interface FansubManageAnalyticsMangaStatusGroup extends FansubManageAnalyticsStatusGroup {
  active: number
  inactive: number
}

export interface FansubManageAnalyticsChapterStatusGroup extends FansubManageAnalyticsStatusGroup {
  scheduled: number
}

export interface FansubManageAnalyticsStatuses {
  mangas: FansubManageAnalyticsMangaStatusGroup
  chapters: FansubManageAnalyticsChapterStatusGroup
}

export interface FansubManageAnalyticsTopManga {
  id: string
  title: string
  slug: string
  totalViews: number
  followerCount: number
  lastChapterNumber: number | null
  isApproved: boolean
  isActive: boolean
}

export interface FansubManageAnalyticsActivityActor {
  id: string | null
  username: string | null
  avatarUrl: string | null
  role: string
}

export interface FansubManageAnalyticsActivityItem {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  summary: string
  metadata: Record<string, unknown>
  createdAt: string | null
  actor: FansubManageAnalyticsActivityActor
}

export interface FansubManageAnalyticsSummary {
  overview: FansubManageAnalyticsOverview
  momentum: FansubManageAnalyticsMomentum
  statuses: FansubManageAnalyticsStatuses
  topMangas: FansubManageAnalyticsTopManga[]
  recentActivity: FansubManageAnalyticsActivityItem[]
}

// ─── Bolumler "yayin hatti" genel bakisi ───────────────────────────────────
export type ChapterPipelineStatus = 'published' | 'scheduled' | 'pending' | 'draft'

export interface ChaptersOverviewChapter {
  id: string
  mangaId: string
  mangaTitle: string
  mangaSlug: string
  chapterNumber: number
  title: string | null
  status: ChapterPipelineStatus
  publishAt: string | null
  createdAt: string
  updatedAt: string
  pageCount: number
  commentCount: number
}

export interface ChaptersOverviewMangaGroup {
  id: string
  title: string
  slug: string
  coverImageUrl: string | null
  totalViews: number
  totalChapters: number
  publishedChapters: number
  commentTotal: number
  avgPages: number
  chapters: ChaptersOverviewChapter[]
}

export interface ChaptersOverviewMetrics {
  totalManga: number
  activeManga: number
  totalChapters: number
  publishedChapters: number
  thisMonthPublished: number
  /** % change from the previous month; null if the previous month is 0. */
  thisMonthPublishedDeltaPct: number | null
  totalViews: number
  totalComments: number
  thisMonthComments: number
  thisMonthCommentsDeltaPct: number | null
}

export interface ChaptersOverviewCalendarDay {
  date: string
  published: number
  scheduled: number
  pending: number
}

export interface ChaptersOverviewActivityItem {
  id: string
  mangaTitle: string
  chapterNumber: number
  title: string | null
  status: ChapterPipelineStatus
  at: string
}

export interface FansubManageChaptersOverview {
  metrics: ChaptersOverviewMetrics
  groups: ChaptersOverviewMangaGroup[]
  calendar: ChaptersOverviewCalendarDay[]
  recent: ChaptersOverviewActivityItem[]
}

/** Daily activity time series (for charts). Arrays run old->new, one entry per day. */
export interface FansubManageActivityTimeseries {
  /** ISO gun anahtarlari (YYYY-MM-DD, UTC), eskiden yeniye. */
  days: string[]
  followers: number[]
  chapters: number[]
  donationAmount: number[]
}

// ─── Genel Bakis kokpiti ────────────────────────────────────────────────────
/** Publishing line: chapter lifecycle counters. */
export interface FansubOverviewPipeline {
  draft: number
  pending: number
  scheduled: number
  published: number
  problem: number
}

/** Approval queue item (pending chapter/manga). */
export interface FansubOverviewQueueItem {
  kind: 'chapter' | 'manga'
  id: string
  title: string
  subtitle: string
  at: string | null
}

/** Yaklasan (planli) yayin. */
export interface FansubOverviewUpcoming {
  id: string
  mangaTitle: string
  mangaSlug: string
  coverImageUrl: string | null
  chapterNumber: number
  title: string | null
  publishAt: string | null
}

/** Ekip kirilimi: rol sayaclari + etiket dagilimi. */
export interface FansubOverviewTeam {
  total: number
  admins: number
  moderators: number
  members: number
  tags: Array<{ tag: string; count: number }>
}

/** Gunluk ozet: fansubun serilerine bugun yazilan manga yorumlari. */
export interface FansubOverviewCommunity {
  commentsToday: number
}

export interface FansubManageOverviewCockpit {
  pipeline: FansubOverviewPipeline
  approvalQueue: FansubOverviewQueueItem[]
  upcoming: FansubOverviewUpcoming[]
  team: FansubOverviewTeam
  community: FansubOverviewCommunity
}

// ─── Raporlanan icerik / duzeltme kuyrugu ───────────────────────────────────
export type FansubReportedContentStatus = 'awaiting_fix' | 'fix_submitted' | 'resolved' | 'dismissed'
export type FansubReportedContentTargetType = 'manga' | 'chapter'
export type FansubReportedContentFilter = 'open' | 'awaiting_fix' | 'fix_submitted' | 'resolved' | 'all'

export interface FansubReportedContentItem {
  id: string
  targetType: FansubReportedContentTargetType
  targetId: string
  reportId?: string
  reason?: string
  adminNote?: string
  status: FansubReportedContentStatus
  removedAt: string
  fixNote?: string
  fixedAt?: string
  resolvedAt?: string
  title: string
  mangaSlug?: string
  chapterNumber?: number
  preview?: string
  category?: string
  contentIsActive: boolean
  contentIsApproved: boolean
  contentExists: boolean
}
