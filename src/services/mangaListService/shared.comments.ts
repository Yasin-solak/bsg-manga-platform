import type { Comment } from '@/types'
import type { CommunityCardCosmetics } from '../communityCosmeticService'
import { supabase } from '../supabase'
import type { MangaListCommentSortBy } from './types'
import type {
  DbMangaListCommentRow,
  DbUserRow,
} from './shared.types'

export function sortRootComments(comments: Comment[], sortBy: MangaListCommentSortBy) {
  const roots = [...comments]
  switch (sortBy) {
    case 'newest':
      roots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      break
    case 'oldest':
      roots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      break
    case 'popular':
      roots.sort((a, b) => {
        const scoreA = a.likes - (a.dislikes || 0)
        const scoreB = b.likes - (b.dislikes || 0)
        if (scoreB !== scoreA) return scoreB - scoreA
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
      break
  }
  return roots
}

export function mapDbCommentToComment(
  row: DbMangaListCommentRow,
  author: DbUserRow | undefined,
  reaction?: 'like' | 'dislike',
  authorCosmetic?: CommunityCardCosmetics,
): Comment {
  return {
    id: row.id,
    userId: author?.id || row.author_id,
    username: author?.username || 'Anonim',
    avatar: author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.author_id}`,
    text: row.body,
    isSpoiler: row.is_spoiler === true,
    likes: Number(row.likes_count || 0),
    dislikes: Number(row.dislikes_count || 0),
    date: row.created_at,
    isLiked: reaction === 'like',
    isDisliked: reaction === 'dislike',
    frameType: authorCosmetic?.frameType || author?.frame_type || 'default',
    profileBackgroundStyle: authorCosmetic?.backgroundStyle,
    profileBackgroundVideoUrl: authorCosmetic?.backgroundVideoUrl,
    profilePatternStyle: authorCosmetic?.patternStyle,
    primaryColor: authorCosmetic?.primaryColor,
    secondaryColor: authorCosmetic?.secondaryColor,
    replies: [],
  }
}

export async function loadCommentAuthorMap(authorIds: string[]) {
  const unique = Array.from(new Set(authorIds.filter(Boolean)))
  if (unique.length === 0) return new Map<string, DbUserRow>()

  const { data, error } = await supabase
    .from('public_user_directory')
    .select('id, username, avatar_url, frame_type')
    .in('id', unique)

  if (error || !data) {
    console.error('[mangaListService] loadCommentAuthorMap error', error)
    return new Map<string, DbUserRow>()
  }

  const map = new Map<string, DbUserRow>()
  ;(data as DbUserRow[]).forEach((row) => {
    if (row.id) map.set(row.id, row)
  })
  return map
}
