import type { UserProgression } from './userProgressionService'

export type AdminUserRole = 'user' | 'moderator' | 'admin'
export type AdminUserRoleFilter = 'all' | AdminUserRole
export type AdminUserBanFilter = 'all' | 'active' | 'banned'
export type AdminUserView = 'all' | AdminUserRole | 'new' | 'staff' | 'banned' | 'review'
export type AdminUserVerificationFilter = 'all' | 'verified' | 'unverified'
export type AdminUserTrustBand = 'trusted' | 'standard' | 'review' | 'low'
export type AdminUserTrustFilter = 'all' | AdminUserTrustBand
export type AdminUserFansubFilter = 'all' | 'member' | 'none'
export type AdminUserPresenceStatus = 'online' | 'idle' | 'offline' | 'unknown' | 'blocked'
export type AdminUserTrustConfidence = 'low' | 'medium' | 'high'

export interface AdminUserPageCursor {
    createdAt: string
    userId: string
}

export interface AdminPagedResult<T> {
    data: T[]
    count: number
    page: number
    limit: number
    hasNext: boolean
    nextCursor?: AdminUserPageCursor
}

export interface AdminUserTrustSummary {
    score: number
    band: AdminUserTrustBand
    confidence: AdminUserTrustConfidence
    reasonCodes: string[]
    components: Record<string, number | boolean>
    algorithmVersion: string
    calculatedAt: string
}

export interface AdminUserFansubPreview {
    id: string
    name: string
    slug: string
    role: 'admin' | 'moderator' | 'member'
}

export interface AdminManagedUser {
    id: string
    username: string
    /**
     * A display name, not a unique identifier. Optional because old RPCs and E2E
     * records may not carry this field during the transition.
     */
    displayName?: string
    avatarUrl: string
    role: AdminUserRole
    isBanned: boolean
    banReason?: string
    banUntil?: string
    bannedAt?: string
    bannedBy?: string
    isActive: boolean
    level?: string
    progression?: UserProgression
    isVerified?: boolean
    lastActivityAt?: string
    lastSeenAt?: string
    presenceStatus?: AdminUserPresenceStatus
    trust?: AdminUserTrustSummary
    fansubCount?: number
    primaryFansub?: AdminUserFansubPreview
    createdAt: string
    updatedAt: string
}

export interface AdminUserOverview {
    generatedAt: string
    total: number
    activeLast30Days?: number
    onlineNow?: number
    verified?: number
    lowTrustReview?: number
    newUsersCurrent?: number
    newUsersPrevious?: number
    newUsersDelta?: number
    newUsersDeltaPercent?: number
    active?: number
    banned?: number
    admins: number
    moderators: number
}

export interface AdminUserListParams {
    limit?: number
    search?: string
    view?: AdminUserView
    role?: AdminUserRoleFilter
    verification?: AdminUserVerificationFilter
    trust?: AdminUserTrustFilter
    fansub?: AdminUserFansubFilter
    cursor?: AdminUserPageCursor
    page?: number
}

export type AdminUserBulkMutationStatus = 'updated' | 'unchanged' | 'not_found' | 'self_rejected' | 'last_admin_rejected'

export interface AdminUserBulkMutationItem {
    userId: string
    status: AdminUserBulkMutationStatus
}

export interface AdminUserBulkMutationResult {
    requested: number
    updated: number
    unchanged: number
    rejected: number
    items: AdminUserBulkMutationItem[]
}

export type AdminInventoryItemType = 'frame' | 'background' | 'pattern' | 'badge' | 'premium'

export interface AdminUserInventoryItem {
    type: AdminInventoryItemType
    ref: string
    name: string
    storeItemId?: string
    identifier?: string
}

export interface AdminUserBadgeEntry {
    badgeId: string
    name: string
    imageUrl?: string
    isDisplayed: boolean
    displayOrder: number
    obtainedAt: string
}

export interface AdminUserRecentRead {
    mangaId: string
    mangaTitle: string
    mangaCoverUrl?: string
    chapterId?: string
    chapterTitle?: string
    chapterNumber?: number
    readAt: string
}

export interface AdminUserFavoriteGenre {
    name: string
    count: number
    percent: number
}

export interface AdminUserTopManga {
    mangaId: string
    mangaTitle: string
    mangaCoverUrl?: string
    readCount: number
    lastReadAt: string
    lastChapterNumber?: number
}

export interface AdminUserTopChapter {
    key: string
    mangaId: string
    mangaTitle: string
    mangaCoverUrl?: string
    chapterId?: string
    chapterTitle?: string
    chapterNumber?: number
    readCount: number
    lastReadAt: string
}

export interface AdminUserMangaComment {
    id: string
    mangaId: string
    mangaTitle: string
    content: string
    likes: number
    isPinned: boolean
    isActive: boolean
    createdAt: string
}

export interface AdminUserFansubMembership {
    fansubId: string
    fansubName: string
    fansubSlug: string
    fansubAvatarUrl?: string
    fansubIsActive: boolean
    role: 'admin' | 'moderator' | 'member'
    teamTag?: string
    joinedAt: string
}

export interface AdminUserFansubMembershipHistoryItem {
    id: string
    fansubId: string
    fansubName: string
    fansubSlug: string
    role: 'admin' | 'moderator' | 'member'
    teamTag?: string
    joinedAt: string
    leftAt?: string
    leftReason: 'active' | 'leave' | 'removed' | 'admin_transfer_exit' | 'fansub_deactivated'
    endedByUserId?: string
    endedByUsername?: string
}

export interface AdminUserSentFansubInvite {
    id: string
    fansubId: string
    fansubName: string
    fansubSlug: string
    invitedUserId: string
    invitedUsername: string
    invitedUserAvatarUrl?: string
    role: 'member' | 'moderator'
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
    note?: string
    respondedAt?: string
    isActive: boolean
    createdAt: string
}

export interface AdminUserJoinRequestSummary {
    id: string
    fansubId: string
    fansubName: string
    fansubSlug: string
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    message?: string
    reviewNote?: string
    reviewedByUsername?: string
    reviewedAt?: string
    isActive: boolean
    createdAt: string
}

export interface AdminUserDetail {
    profile: {
        id: string
        username: string
        displayName?: string
        avatarUrl: string
        bio: string
        level: string
        socialLinks: string[]
        role: AdminUserRole
        stones: number
        frameType: string
        isBanned: boolean
        banReason?: string
        banUntil?: string
        bannedAt?: string
        bannedBy?: string
        isActive: boolean
        createdAt: string
        updatedAt: string
    }
    stats: {
        followers: number
        following: number
        mangaFollows: number
        fansubFollows: number
        readingCount: number
        mangaCommentCount: number
        badgeCount: number
        estimatedReadMinutes: number
        fansubMembershipCount: number
        fansubRoleHistoryCount: number
        sentInviteCount: number
        joinRequestCount: number
    }
    inventory: {
        frames: AdminUserInventoryItem[]
        backgrounds: AdminUserInventoryItem[]
        patterns: AdminUserInventoryItem[]
        badges: AdminUserInventoryItem[]
        premium: AdminUserInventoryItem[]
    }
    badges: AdminUserBadgeEntry[]
    recentReads: AdminUserRecentRead[]
    favoriteGenres: AdminUserFavoriteGenre[]
    favoriteGenreMethod: string
    topMangas: AdminUserTopManga[]
    topChapters: AdminUserTopChapter[]
    mangaComments: AdminUserMangaComment[]
    fansubMemberships: AdminUserFansubMembership[]
    fansubMembershipHistory: AdminUserFansubMembershipHistoryItem[]
    sentFansubInvites: AdminUserSentFansubInvite[]
    joinRequests: AdminUserJoinRequestSummary[]
}

export type AdminUserActivityEventType = 'user_read' | 'user_comment'

export interface AdminUserActivityDay {
    date: string
    total: number
    reads: number
    comments: number
}

export interface AdminUserActivityTimeBucket {
    weekday: number
    hour: number
    total: number
}

export interface AdminUserActivityEvent {
    id: string
    type: AdminUserActivityEventType
    summary: string
    mangaId?: string
    mangaTitle?: string
    chapterId?: string
    chapterNumber?: number
    routeHint?: string
    createdAt: string
}

export type AdminUserModerationEventSource = 'security' | 'audit' | 'report'
export type AdminUserModerationSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface AdminUserModerationEvent {
    id: string
    source: AdminUserModerationEventSource
    type: string
    severity: AdminUserModerationSeverity
    summary: string
    actorUserId?: string
    actorUsername?: string
    actorRole?: 'admin' | 'moderator' | 'user' | 'system' | 'anon'
    createdAt: string
    outcome: string
    metadata: {
        banUntil?: string
        previousRole?: string
        newRole?: string
        status?: string
        resolvedAt?: string
    }
}

export interface AdminUserDetailInsights {
    generatedAt: string
    windowDays: number
    activity: {
        total: number
        reads: number
        comments: number
        activeDays: number
        lastAt?: string
        daily: AdminUserActivityDay[]
        timeBuckets: AdminUserActivityTimeBucket[]
        events: AdminUserActivityEvent[]
    }
    moderation: {
        reports: {
            total: number
            pending: number
            resolved: number
            dismissed: number
        }
        securityEventCount: number
        adminActionCount: number
        currentBan: {
            isBanned: boolean
            reason?: string
            until?: string
            bannedAt?: string
        }
        events: AdminUserModerationEvent[]
    }
}
