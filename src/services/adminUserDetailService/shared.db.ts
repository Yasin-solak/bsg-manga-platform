import type {
  AdminInventoryItemType,
  AdminUserRole,
} from '../adminUserTypes'

export type DbAdminUserRow = {
  id: string
  username: string
  display_name?: string | null
  avatar_url: string | null
  role: AdminUserRole | null
  is_banned: boolean | null
  is_active: boolean | null
  created_at: string
  updated_at: string
}

export type DbAdminUserProfileRow = DbAdminUserRow & {
  bio: string | null
  level: string | null
  social_links: unknown
  stones: number | null
  frame_type: string | null
  owned_items: unknown
}

export type DbStoreItemMiniRow = {
  id: string
  type: AdminInventoryItemType
  name: string
  identifier: string
}

export type DbBadgeRelationRow = {
  id: string
  name: string
  image_url: string | null
}

export type DbUserBadgeRow = {
  badge_id: string
  is_displayed: boolean | null
  display_order: number | null
  obtained_at: string
  badge: DbBadgeRelationRow | DbBadgeRelationRow[] | null
}

export type DbMangaRelationRow = {
  id: string
  title: string
  cover_image_url: string | null
  genres: string[] | null
}

export type DbChapterRelationRow = {
  id: string
  title: string | null
  chapter_number: number | null
}

export type DbReadingHistoryRow = {
  manga_id: string
  chapter_id: string | null
  chapter_number: number | null
  read_at: string
  manga: DbMangaRelationRow | DbMangaRelationRow[] | null
  chapter: DbChapterRelationRow | DbChapterRelationRow[] | null
}

export type DbMangaCommentMangaRelation = {
  id: string
  title: string
}

export type DbMangaCommentRow = {
  id: string
  manga_id: string
  content: string | null
  likes: number | null
  is_pinned: boolean | null
  is_active: boolean | null
  created_at: string
  manga: DbMangaCommentMangaRelation | DbMangaCommentMangaRelation[] | null
}

export type DbFansubMiniRow = {
  id: string
  name: string
  slug: string
  avatar_url?: string | null
  is_active?: boolean | null
}

export type DbFansubMemberRow = {
  fansub_id: string
  role: 'admin' | 'moderator' | 'member'
  team_tag: string | null
  created_at: string
  fansub: DbFansubMiniRow | DbFansubMiniRow[] | null
}

export type DbFansubHistoryEndedByRelation = {
  id: string
  username: string
}

export type DbFansubMemberHistoryRow = {
  id: string
  fansub_id: string
  role: 'admin' | 'moderator' | 'member'
  team_tag: string | null
  joined_at: string
  left_at: string | null
  left_reason: 'active' | 'leave' | 'removed' | 'admin_transfer_exit' | 'fansub_deactivated'
  ended_by_user_id: string | null
  fansub: DbFansubMiniRow | DbFansubMiniRow[] | null
  ended_by_user: DbFansubHistoryEndedByRelation | DbFansubHistoryEndedByRelation[] | null
}

export type DbInviteUserRelation = {
  id: string
  username: string
  avatar_url: string | null
}

export type DbFansubInviteRow = {
  id: string
  fansub_id: string
  invited_user_id: string
  role: 'member' | 'moderator'
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  note: string | null
  responded_at: string | null
  is_active: boolean | null
  created_at: string
  fansub: DbFansubMiniRow | DbFansubMiniRow[] | null
  invited_user: DbInviteUserRelation | DbInviteUserRelation[] | null
}

export type DbJoinRequestReviewerRelation = {
  id: string
  username: string
}

export type DbJoinRequestRow = {
  id: string
  fansub_id: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  message: string | null
  review_note: string | null
  reviewed_at: string | null
  is_active: boolean | null
  created_at: string
  fansub: DbFansubMiniRow | DbFansubMiniRow[] | null
  reviewed_by_user: DbJoinRequestReviewerRelation | DbJoinRequestReviewerRelation[] | null
}

export type OwnedItemsPayload = {
  frames: string[]
  backgrounds: string[]
  patterns: string[]
  badges: string[]
  premium: string[]
}

export const READ_DATA_WINDOW = 200
export const RECENT_READ_LIMIT = 5
export const TOP_READ_LIMIT = 5
export const ADMIN_USER_DETAIL_CACHE_TTL_MS = 60_000
