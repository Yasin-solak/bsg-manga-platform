import type { ProfileTheme } from '@/lib/profileTheme'
import type { FrameType } from '@components/common/AvatarFrame'
import type { StoreItem } from '@/data/storeProducts'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import type { UserProgression } from '@/services/userProgressionService'

export interface Badge {
  id: string
  icon: string
  name: string
  color: string
}

export interface SocialLink {
  platform: string
  username: string
}

export interface FollowingManga {
  id: string
  slug?: string
  title: string
  coverImage: string
  lastChapter?: string
  isNew?: boolean
}

export interface ReadingHistoryItem {
  mangaId: string
  mangaSlug?: string
  title: string
  coverImage: string
  chapterNumber: number
  /** The series' last chapter: real reading progress (chapter / last chapter). */
  lastChapterNumber?: number
}

export interface FollowUser {
  id: string
  username: string
  avatar: string
}

export interface FollowingFansub {
  id: string
  slug?: string
  name: string
  avatar: string
  mangaCount?: number
  followerCount?: number
  frameType?: FrameType
  frameCustomOverlayUrl?: string
  framePosterOverlayUrl?: string
  primaryColor?: string
  secondaryColor?: string
}

export interface OwnedBackground {
  id: string
  label: string
  background: string
  mediaType?: 'image' | 'video'
  origin?: 'store' | 'upload'
  slotIndex?: number
}

export interface ProfileOwnedBadge {
  id: string
  badge_id: string
  display_order: number
  is_displayed: boolean
  badge?: {
    name?: string
    description?: string | null
    rarity?: string | null
    category?: string | null
    subcategory?: string | null
    image_url?: string | null
  }
}

export interface ActivityFeedItem {
  id: string
  type: 'read' | 'comment'
  mangaTitle?: string
  mangaId?: string
  chapterNumber?: number
  targetLabel?: string
  timestamp: string
}

export interface FavoriteGenre {
  name: string
  percent: number
}

export interface MockUser {
  id?: string
  username: string
  displayName?: string
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
  avatar: string
  frameType: FrameType
  bio: string
  joinDate: string
  /** Raw membership time (ISO): for membership length calculations. */
  joinedAt?: string
  level: string
  progression?: UserProgression
  isPremiumActive?: boolean
  /** Profile/hover card theme (unlocked with premium) */
  /** Profil temasi (renkler + stil + desen). */
  hoverTheme?: ProfileTheme | null
  activeProfileEffectId?: string | null
  stats: {
    reading: number
    followers: number
    following?: number
    totalChaptersRead?: number
    timeSpentMinutes?: number
    comments?: number
  }
  favoriteGenres?: FavoriteGenre[]
  badges: Badge[]
  socialLinks: SocialLink[]
  following: FollowingManga[]
  readingHistory: ReadingHistoryItem[]
  followingFansubs: FollowingFansub[]
  ownedFrames: string[]
  ownedBackgrounds: OwnedBackground[]
  activityFeed: ActivityFeedItem[]
  followsCurrentUser?: boolean
  followersList?: FollowUser[]
  followingList?: FollowUser[]
}

export type EditModalTab =
  | 'profil'
  | 'gizlilik'
  | 'hoverTemasi'
  | 'fansubEtiketleri'
  | 'cerceveler'
  | 'profilEfektleri'
  | 'metinAnimasyonlari'
  | 'rozetler'

export interface ProfileEditDraft {
  displayName: string
  bio: string
  avatar: string
  discord: string
  instagram: string
  x: string
}



export type ProfileOwnedEffect = StoreItem
