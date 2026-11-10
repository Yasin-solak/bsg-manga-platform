export const LIST_TITLE_MIN_LENGTH = 3
export const LIST_TITLE_MAX_LENGTH = 56
export const LIST_DESCRIPTION_MAX_LENGTH = 1200
export const MANGA_LIST_MIN_ITEM_COUNT = 5
export const MANGA_LIST_HERO_COVER_COUNT = 5
export const MANGA_LIST_ITEM_NOTE_MAX_LENGTH = 180
export const DEFAULT_MANGA_LIST_CATEGORY_ID = 'action'
export const MANGA_LIST_CATEGORY_IDS = [
  'action',
  'romance',
  'fantasy',
  'comedy',
  'drama',
  'horror',
  'isekai',
  'sports',
  'adventure',
  'supernatural',
  'magic',
  'mystery',
  'slice-of-life',
  'school',
  'music',
  'cooking',
  'sci-fi',
  'psychological',
  'thriller',
  'historical',
] as const

export const MANGA_LIST_SELECT = `
  id,
  owner_id,
  title,
  description,
  is_public,
  category_id,
  cover_manga_id,
  items_count,
  ratings_count,
  rating_avg,
  comments_count,
  created_at,
  updated_at,
  users:owner_id (
    id,
    username,
    avatar_url,
    frame_type,
    background_type
  ),
  cover_manga:cover_manga_id (
    id,
    title,
    slug,
    cover_image_url
  )
`

export const MANGA_LIST_ITEM_SELECT = `
  id,
  list_id,
  manga_id,
  position,
  note,
  mangas:manga_id (
    id,
    title,
    slug,
    cover_image_url,
    last_chapter_number,
    is_new,
    rating,
    total_views,
    genres
  )
`
