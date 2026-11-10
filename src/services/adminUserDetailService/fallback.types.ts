import type {
    DbAdminUserProfileRow,
    DbFansubInviteRow,
    DbFansubMemberHistoryRow,
    DbFansubMemberRow,
    DbJoinRequestRow,
    DbMangaCommentRow,
    DbReadingHistoryRow,
    DbUserBadgeRow,
} from './shared'

export interface AdminUserDetailFallbackCounts {
    followers: number
    following: number
    mangaFollows: number
    fansubFollows: number
    readingCount: number
    mangaCommentCount: number
    badgeCount: number
}

export interface AdminUserDetailFallbackPayload {
    profileRow: DbAdminUserProfileRow
    readingRows: DbReadingHistoryRow[]
    badgeRows: DbUserBadgeRow[]
    mangaCommentRows: DbMangaCommentRow[]
    fansubMembershipRows: DbFansubMemberRow[]
    fansubHistoryRows: DbFansubMemberHistoryRow[]
    sentInviteRows: DbFansubInviteRow[]
    joinRequestRows: DbJoinRequestRow[]
    counts: AdminUserDetailFallbackCounts
}
