import type { AdminFansubTransactionType } from './types'

export type DbSiteSettings = {
  id: number
  site_title: string
  site_description: string
  contact_email: string
  maintenance_mode: boolean
  registration_enabled: boolean
  discord_invite_url: string
  logo_url: string | null
  store_home_config?: unknown
}

export type DbAdminFansubRow = {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  description: string | null
  is_active: boolean | null
  manga_count: number | null
  follower_count: number | null
  coin_balance: number | null
  created_at: string
  updated_at: string
}

export type DbAdminMangaRow = {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  cover_image_url: string | null
  status: 'ongoing' | 'completed' | 'hiatus' | null
  is_approved: boolean | null
  is_active: boolean | null
  total_views: number | null
  last_chapter_number: number | null
  updated_at: string
}

export type DbAdminFansubMiniRelation = {
  id: string
  name: string
  slug: string
}

export type DbAdminMangaControlRow = {
  id: string
  fansub_id: string | null
  title: string
  slug: string
  cover_image_url: string | null
  description: string | null
  status: 'ongoing' | 'completed' | 'hiatus' | null
  is_approved: boolean | null
  is_active: boolean | null
  is_new: boolean | null
  total_views: number | null
  total_ratings: number | null
  rating: number | null
  genres: string[] | null
  series_type?: string | null
  is_mature?: boolean | null
  last_chapter_number: number | null
  created_at: string
  updated_at: string
  fansub?: DbAdminFansubMiniRelation | DbAdminFansubMiniRelation[] | null
}

export type DbAdminChapterStatRow = {
  manga_id: string
  is_approved: boolean | null
  is_active: boolean | null
}

export type DbAdminMangaChapterRow = {
  id: string
  fansub_id: string | null
  chapter_number: number
  title: string | null
  is_approved: boolean | null
  is_active: boolean | null
  publish_at: string | null
  created_at: string
  updated_at: string
  fansub?: DbAdminFansubMiniRelation | DbAdminFansubMiniRelation[] | null
}

export type DbAdminUserRelation = {
  id: string
  username: string
  avatar_url: string | null
}

export type DbAdminMangaCommentRow = {
  id: string
  manga_id: string
  user_id: string
  parent_id: string | null
  content: string | null
  likes: number | null
  is_active: boolean | null
  is_pinned: boolean | null
  is_spoiler?: boolean | null
  created_at: string
  updated_at: string
  user?: DbAdminUserRelation | DbAdminUserRelation[] | null
}

export type DbAdminMangaRatingRow = {
  manga_id: string
  user_id: string
  rating: number | null
  created_at: string
  updated_at: string
  user?: DbAdminUserRelation | DbAdminUserRelation[] | null
}

export type DbAdminFansubAdminMemberRow = {
  fansub_id: string
  user_id: string
  user?: DbAdminUserRelation | DbAdminUserRelation[] | null
}

export type DbAdminFansubMemberHistoryRow = {
  id: string
  fansub_id: string
  user_id: string | null
  role: 'admin' | 'moderator' | 'member'
  team_tag: string | null
  joined_at: string
  left_at: string | null
  left_reason: 'active' | 'leave' | 'removed' | 'admin_transfer_exit' | 'fansub_deactivated'
  ended_by_user_id: string | null
  user?: {
    id: string
    username: string
    avatar_url: string | null
  } | {
    id: string
    username: string
    avatar_url: string | null
  }[] | null
  ended_by_user?: {
    id: string
    username: string
  } | {
    id: string
    username: string
  }[] | null
}

export type DbAdminStoreItemRelation = {
  id: string
  name: string
  type: string
  identifier: string
  image_key: string | null
  custom_asset_url: string | null
  is_active: boolean | null
}

export type DbAdminFansubInventoryRow = {
  id: string
  fansub_id: string
  store_item_id: string
  acquired_at: string
  acquired_by: string | null
  store_item?: DbAdminStoreItemRelation | DbAdminStoreItemRelation[] | null
  acquired_by_user?: DbAdminUserRelation | DbAdminUserRelation[] | null
}

export type DbAdminFansubTransactionRow = {
  id: string
  fansub_id: string
  amount: number | null
  type: AdminFansubTransactionType | null
  description: string | null
  related_item_id: string | null
  created_by: string | null
  created_at: string
  related_item?: DbAdminStoreItemRelation | DbAdminStoreItemRelation[] | null
  created_by_user?: DbAdminUserRelation | DbAdminUserRelation[] | null
}

export type DbAdminSetFansubActiveResult = {
  success: boolean
  fansub_id: string
  fansub_name: string
  is_active: boolean
  previous_is_active: boolean
  removed_member_count: number
}

export type DbAdminUpdateFansubMemberResult = {
  success: boolean
  fansub_id: string
  member_user_id: string
  role: 'admin' | 'moderator' | 'member'
  team_tag: string | null
}
