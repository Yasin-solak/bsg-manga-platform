export interface DbUserRow {
  id: string
  username: string | null
  avatar_url: string | null
  frame_type?: string | null
  background_type?: string | null
}

export interface DbMangaRow {
  id: string
  title: string | null
  slug: string | null
  cover_image_url: string | null
  last_chapter_number?: number | null
  is_new?: boolean | null
  rating?: number | null
  total_views?: number | null
  genres?: string[] | null
}

export interface DbMangaListRow {
  id: string
  owner_id: string
  title: string
  description: string | null
  is_public: boolean
  category_id?: string | null
  cover_manga_id: string | null
  items_count: number | null
  ratings_count: number | null
  rating_avg: number | null
  comments_count: number | null
  created_at: string
  updated_at?: string | null
  users?: DbUserRow | DbUserRow[] | null
  cover_manga?: DbMangaRow | DbMangaRow[] | null
}

export interface DbTopMangaListRow {
  list_id: string
  title: string
  description: string | null
  owner_id: string
  owner_username: string | null
  owner_avatar_url: string | null
  category_id?: string | null
  cover_manga_id: string | null
  cover_manga_title: string | null
  cover_manga_slug: string | null
  cover_image_url: string | null
  items_count: number | null
  ratings_count: number | null
  rating_avg: number | null
  comments_count: number | null
  period_rating_count: number | null
  period_comment_count: number | null
  score: number | null
  created_at: string
  updated_at?: string | null
}

export interface DbMangaListItemRow {
  id: string
  list_id: string
  manga_id: string
  position: number
  note: string | null
  mangas?: DbMangaRow | DbMangaRow[] | null
}

export interface DbMangaListCommentRow {
  id: string
  list_id: string
  author_id: string
  parent_id: string | null
  body: string
  is_spoiler?: boolean | null
  likes_count: number | null
  dislikes_count: number | null
  created_at: string
  is_active: boolean
}

export interface DbMangaListCommentReaction {
  comment_id: string
  reaction: 'like' | 'dislike'
}

export interface MangaListCommentReactionResponse {
  is_liked: boolean
  is_disliked: boolean
  likes_count: number
  dislikes_count: number
}

export interface MangaListRatingResponse {
  rating_avg: number
  ratings_count: number
  user_rating: number
}
