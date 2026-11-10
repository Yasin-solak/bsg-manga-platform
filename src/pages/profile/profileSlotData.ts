import type { MangaListSummary } from '@/services/mangaListService/types'
import type { ProfileSlotModule } from './profileLayout'
import type { MockUser, ProfileOwnedBadge } from './types'

export interface ProfileSlotData {
  user: MockUser
  badges: ProfileOwnedBadge[]
  lists: MangaListSummary[]
}

/** Does the module have data to show? (otherwise the slot is hidden from visitors) */
export function slotHasContent(module: ProfileSlotModule, data: ProfileSlotData) {
  switch (module) {
    case 'badges': return data.badges.length > 0
    case 'reading': return data.user.readingHistory.length > 0
    case 'fav': return data.user.following.length > 0
    case 'list': return data.lists.length > 0
    case 'stats': return true
    case 'genres': return (data.user.favoriteGenres ?? []).length > 0
    case 'level': return Boolean(data.user.progression)
    case 'teams': return data.user.followingFansubs.length > 0
    case 'activity': return data.user.activityFeed.length > 0
    default: return false
  }
}
