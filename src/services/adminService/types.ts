import type { ExploreCollectionConfig } from '@/services/exploreConfigService'

export interface SiteSettings {
    siteTitle: string
    siteDescription: string
    contactEmail: string
    maintenanceMode: boolean
    registrationEnabled: boolean
    discordInviteUrl: string
    logoUrl: string
    homepageFeaturedMangaIds: string[]
    exploreEditorMangaIds: string[]
    exploreCollections: ExploreCollectionConfig[]
    mangaListCreateCoverImages: string[]
}

export interface AdminManagedFansub {
    id: string
    name: string
    slug: string
    avatarUrl: string
    description: string
    isActive: boolean
    mangaCount: number
    followerCount: number
    coinBalance: number
    createdAt: string
    updatedAt: string
    memberCount?: number
    moderatorCount?: number
    manager?: AdminFansubManagerMini
    lastActivityAt?: string
    pendingReviewCount?: number
    isVerified?: boolean | null
    verifiedAt?: string
    trust?: AdminFansubTrustSummary | null
    boostLevel?: number | null
}

export interface AdminFansubManagerMini {
    id: string
    username: string
    avatarUrl?: string
}

export type AdminFansubTrustBand = 'trusted' | 'standard' | 'review' | 'high-risk' | 'unknown'
export type AdminFansubTrustConfidence = 'high' | 'medium' | 'low' | 'unknown'

export interface AdminFansubTrustComponent {
    key: string
    label: string
    description: string
    points: number
}

export interface AdminFansubTrustSummary {
    score: number | null
    band: AdminFansubTrustBand
    confidence: AdminFansubTrustConfidence
    algorithmVersion: string
    components: AdminFansubTrustComponent[]
}

export interface AdminFansubManagementOverview {
    total: number
    active: number
    moderated: number
    verified: number | null
    pendingReview: number
    newFansubs: number
    verificationAvailable: boolean
    trustAvailable: boolean
}

export type AdminFansubManagementView = 'all' | 'active' | 'inactive' | 'verified' | 'new'
export type AdminFansubTrustFilter = 'all' | 'trusted' | 'standard' | 'review'

export interface AdminFansubAuditEvent {
    id: string
    action: string
    resourceType: string
    summary: string
    createdAt: string
    actor?: AdminFansubManagerMini
}

export interface AdminManagedManga {
    id: string
    fansubId: string
    title: string
    slug: string
    coverImageUrl: string
    status: 'ongoing' | 'completed' | 'hiatus' | null
    isApproved: boolean
    isActive: boolean
    totalViews: number
    lastChapterNumber: number | null
    updatedAt: string
}

export type AdminMangaApprovalFilter = 'all' | 'approved' | 'pending'
export type AdminMangaStatusFilter = 'all' | 'ongoing' | 'completed' | 'hiatus'

export interface AdminMangaChapterStats {
    total: number
    approved: number
    pending: number
    active: number
}

export interface AdminMangaActorMini {
    id: string
    username: string
    avatarUrl?: string
}

export interface AdminMangaFansubMini {
    id: string
    name: string
    slug: string
}

export interface AdminMangaControlItem {
    id: string
    fansubId: string
    fansubName: string
    fansubSlug: string
    title: string
    slug: string
    coverImageUrl: string
    description: string
    status: 'ongoing' | 'completed' | 'hiatus' | null
    isApproved: boolean
    isActive: boolean
    isNew: boolean
    totalViews: number
    followerCount: number
    totalRatings: number
    rating: number | null
    genres: string[]
    /** The series type, not the source language. */
    seriesType: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'yerli'
    /** 18+ kapisinin anahtari — gorunurluk RLS'te uygulanir. */
    isMature: boolean
    lastChapterNumber: number | null
    chapterStats: AdminMangaChapterStats
    creatorUser?: AdminMangaActorMini
    createdAt: string
    updatedAt: string
}

export interface AdminMangaChapterBrief {
    id: string
    fansubId?: string
    fansubName: string
    fansubSlug: string
    chapterNumber: number
    title?: string
    isApproved: boolean
    isActive: boolean
    publishAt?: string
    createdAt: string
    updatedAt: string
}

export interface AdminMangaCommentItem {
    id: string
    mangaId: string
    userId: string
    username: string
    avatarUrl?: string
    parentId?: string
    content: string
    likes: number
    isActive: boolean
    isPinned: boolean
    /** Must be visible in moderation: metrics report the spoiler count. */
    isSpoiler: boolean
    createdAt: string
    updatedAt: string
}

export interface AdminMangaRatingItem {
    mangaId: string
    userId: string
    username: string
    avatarUrl?: string
    rating: number
    createdAt: string
    updatedAt: string
}

export interface AdminMangaControlDetail extends AdminMangaControlItem {
    chapters: AdminMangaChapterBrief[]
    chapterContributorFansubs: AdminMangaFansubMini[]
    comments: AdminMangaCommentItem[]
    ratings: AdminMangaRatingItem[]
}

export interface AdminFansubMemberHistoryRecord {
    id: string
    fansubId: string
    userId?: string
    role: 'admin' | 'moderator' | 'member'
    teamTag?: string
    joinedAt: string
    leftAt?: string
    leftReason: 'active' | 'leave' | 'removed' | 'admin_transfer_exit' | 'fansub_deactivated'
    endedByUserId?: string
    user?: {
        id: string
        username: string
        avatarUrl?: string
    }
    endedByUser?: {
        id: string
        username: string
    }
}

export interface AdminFansubMemberHistoryStats {
    active: number
    left: number
    total: number
}

export type AdminFansubTransactionType = 'redeem' | 'purchase' | 'reward_view' | 'reward_rank' | 'reward_task' | 'donation' | 'system'
export type AdminFansubTransactionTypeFilter = 'all' | AdminFansubTransactionType

export interface AdminFansubInventoryItem {
    id: string
    fansubId: string
    storeItemId: string
    acquiredAt: string
    acquiredByUserId?: string
    storeItem?: {
        id: string
        name: string
        type: string
        identifier: string
        imageUrl?: string
        isActive: boolean
    }
    acquiredByUser?: {
        id: string
        username: string
        avatarUrl?: string
    }
}

export interface AdminFansubTransactionRecord {
    id: string
    fansubId: string
    amount: number
    type: AdminFansubTransactionType
    description: string
    relatedItemId?: string
    createdByUserId?: string
    createdAt: string
    relatedItem?: {
        id: string
        name: string
        type: string
        identifier: string
        imageUrl?: string
        isActive: boolean
    }
    createdByUser?: {
        id: string
        username: string
        avatarUrl?: string
    }
}

export interface AdminPagedResult<T> {
    data: T[]
    count: number
    page: number
    limit: number
}

export type AdminStatusFilter = 'all' | 'active' | 'inactive'
export type AdminMemberStateFilter = 'all' | 'active' | 'left'

export interface AdminFansubListParams {
    page?: number
    limit?: number
    search?: string
    status?: AdminStatusFilter
    view?: AdminFansubManagementView
    trust?: AdminFansubTrustFilter
}

export interface AdminFansubMangaListParams {
    page?: number
    limit?: number
    search?: string
    status?: AdminStatusFilter
}

/**
 * Manga control view presets.
 *
 * These are not extra filters but shortcuts to the admin's real work queues.
 *
 * `without-fansub` is DELIBERATELY ABSENT: manga is a shared catalog with no ownership. Any
 * fansub can translate and upload a manga's chapters; the permission key is
 * `chapters.fansub_id`. So a "manga without a fansub" is not a gap, and
 * showing it as a queue would mislead.
 */
export type AdminMangaControlView =
    | 'all'
    | 'pending'
    | 'pending-chapters'
    | 'without-chapters'
    | 'incomplete-meta'
    | 'inactive'

export interface AdminMangaListParams {
    page?: number
    limit?: number
    search?: string
    visibility?: AdminStatusFilter
    approval?: AdminMangaApprovalFilter
    status?: AdminMangaStatusFilter
    view?: AdminMangaControlView
}

/**
 * Manga control summary. Calculated from the WHOLE catalog, not the visible page
 * (`get_admin_manga_control_overview`).
 */
export interface AdminMangaControlOverview {
    generatedAt: string
    total: number
    approved: number
    pending: number
    inactive: number
    /** A series without info on the fansub that opened its catalog record. NOT ownership, only a record trace. */
    withoutFansub: number
    /** A series with at least one chapter pending approval: the admin's review queue. */
    pendingChapterSeries: number
    /** A series with no chapters: a dead end for readers. */
    withoutChapters: number
    /** A series missing a cover, genre or description: card and SEO surfaces look broken. */
    incompleteMeta: number
    chaptersTotal: number
    chaptersPending: number
    chaptersScheduled: number
    chaptersWithoutFansub: number
    newMangasCurrent: number
    newMangasPrevious: number
    newMangasDelta: number
    newMangasDeltaPercent: number | null
}

export interface AdminFansubMemberHistoryParams {
    page?: number
    limit?: number
    search?: string
    state?: AdminMemberStateFilter
}

export interface AdminFansubInventoryListParams {
    page?: number
    limit?: number
    search?: string
}

export interface AdminFansubTransactionListParams {
    page?: number
    limit?: number
    search?: string
    type?: AdminFansubTransactionTypeFilter
}

/**
 * Admin metrics for one manga (`get_admin_manga_detail_metrics`).
 *
 * The report count is deliberately absent: `fansub_reported_content` carries only the `post`
 * target type today, so it would always return 0 for manga/chapters and give false confidence.
 */
export interface AdminMangaDetailMetrics {
    generatedAt: string
    /** Goruntulenmeden farkli: TEKIL okuyucu sayisi. */
    readersTotal: number
    readers30d: number
    lastReadAt: string | null
    followers: number
    viewsCurrentMonth: number
    viewsPreviousMonth: number
    /** How many different chapter numbers there are. */
    chapterNumbers: number
    /** Total translation records (a chapter can have several versions). */
    chapterVersions: number
    pendingChapters: number
    scheduledChapters: number
    inactiveChapters: number
    /** A chapter with no pages: the upload was left unfinished. */
    emptyPageChapters: number
    pagesTotal: number
    firstChapterAt: string | null
    lastChapterAt: string | null
    /** Average days between chapters; null for a single-chapter series. */
    avgChapterIntervalDays: number | null
    contributorFansubs: number
    comments: number
    commentsInactive: number
    commentsSpoiler: number
    ratings: number
    ratingAverage: number | null
}
