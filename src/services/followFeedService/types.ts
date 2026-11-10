export type FollowActivityEventType =
  | 'user_read'
  | 'user_comment'
  | 'fansub_new_chapter'
  | 'fansub_new_manga'

export type FollowActivityActorType = 'user' | 'fansub'

export interface FollowActivityCursor {
  createdAt: string
  eventKey: string
}

export interface FollowActivityItem {
  id: string
  eventType: FollowActivityEventType
  actorType: FollowActivityActorType
  actorUserId?: string
  actorFansubId?: string
  actorName: string
  actorUsername?: string
  actorAvatarUrl?: string
  actorFrameType?: string
  mangaId?: string
  mangaSlug?: string
  mangaTitle?: string
  mangaCoverImageUrl?: string
  chapterId?: string
  chapterNumber?: number
  commentId?: string
  routeHint?: string
  summary: string
  createdAt: string
}

export interface FollowActivityFeedResult {
  items: FollowActivityItem[]
  nextCursor: FollowActivityCursor | null
}

export type DbFollowActivityRow = {
  event_key: string
  event_type: FollowActivityEventType
  actor_type: FollowActivityActorType
  actor_user_id: string | null
  actor_fansub_id: string | null
  actor_name: string | null
  actor_username: string | null
  actor_avatar_url: string | null
  actor_frame_type: string | null
  manga_id: string | null
  manga_title: string | null
  manga_cover_image_url: string | null
  chapter_id: string | null
  chapter_number: number | null
  post_id: string | null
  comment_id: string | null
  route_hint: string | null
  summary: string | null
  created_at: string
}
