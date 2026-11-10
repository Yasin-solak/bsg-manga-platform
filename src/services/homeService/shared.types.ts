export type DbHomeManga = {
  id: string
  title: string
  slug?: string | null
  cover_image_url: string | null
  description?: string | null
  status?: 'ongoing' | 'completed' | 'hiatus' | null
  genres?: string[] | null
  last_chapter_number: number | null
  is_new: boolean | null
  rating: number | null
  total_ratings?: number | null
  total_views: number | null
  updated_at: string
}

export type DbHomeFansub = {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  description: string | null
  frame_type: string | null
  primary_color: string | null
  secondary_color: string | null
  custom_background_asset_url: string | null
  has_full_name_style?: boolean | null
  can_upload_static_background?: boolean | null
  can_upload_video_background?: boolean | null
  manga_count: number | null
  follower_count: number | null
  active_frame_id: string | null
  active_background_id: string | null
  active_pattern_id: string | null
}

export type DbHomePost = {
  id: string
  category: string | null
  title: string | null
  body: string | null
  likes_count: number | null
  comments_count: number | null
  frame_type: string | null
  frame_custom_overlay_url?: string | null
  frame_poster_overlay_url?: string | null
  primary_color: string | null
  secondary_color: string | null
  profile_background_style?: string | null
  profile_background_video_url?: string | null
  profile_pattern_style?: string | null
  is_verified: boolean | null
  created_at: string | null
  author_id: string
  username: string | null
  avatar_url: string | null
  related_fansub_id: string | null
  fansub_name: string | null
  fansub_slug: string | null
  fansub_avatar_url: string | null
}

export type DbHomeChapterLastRow = {
  manga_id: string
  chapter_number: number
}

export type HomeFeedRpcResult = {
  trending_mangas?: DbHomeManga[]
  latest_mangas?: DbHomeManga[]
  popular_mangas?: DbHomeManga[]
  fansubs?: DbHomeFansub[]
  announcements?: DbHomePost[]
}

export type DbDiscussionMangaRow = {
  manga_id: string
  manga_title: string
  manga_slug?: string | null
  cover_image_url: string | null
  comment_count: number | null
  recent_comment_count: number | null
  last_comment_at: string | null
}

export type DbDiscussionChapterRow = {
  chapter_id: string
  manga_id: string
  manga_slug?: string | null
  chapter_number: number
  chapter_title: string | null
  manga_title: string
  cover_image_url: string | null
  comment_count: number | null
  recent_comment_count: number | null
  last_comment_at: string | null
}

export type HomeDiscussionRpcResult = {
  window_days?: number
  top_mangas?: DbDiscussionMangaRow[]
  top_chapters?: DbDiscussionChapterRow[]
}
