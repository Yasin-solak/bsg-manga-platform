import type { ProfileTheme } from '@/lib/profileTheme'
import type { FrameType } from '@components/common/AvatarFrame'
import type { Fansub, Manga } from '@/types'
import type { StoreItem } from '@/data/storeProducts'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import type { FansubBadge } from '@/services/badgeService'

export interface FansubMember {
  id: string
  username: string
  avatar: string
  role: string
  teamTag?: string
  frameType?: FrameType
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
}

export interface FansubOwnedBackground {
  id: string
  label: string
  background: string
  posterBackground?: string
  videoUrl?: string
  mediaType?: 'image' | 'video'
  origin?: 'store' | 'upload'
  slotIndex?: number
  assetRef?: string
}

export interface OwnedFrameInfo {
  identifier: string
  isKnown: boolean
  customAssetUrl?: string
  posterAssetUrl?: string
  storeItemId?: string
  name?: string
}

export interface FansubEditResources {
  frameItemIdsByType: Record<string, string>
  hasNameTextAccess: boolean
  ownedBackgrounds: FansubOwnedBackground[]
  ownedFrameInfos: OwnedFrameInfo[]
  ownedFrames: string[]
  ownedProfileEffects: StoreItem[]
}

export type ExtendedFansub = Fansub & {
  slug?: string
  members?: FansubMember[]
  managedByUsername?: string
  ownedFrames?: string[]
  ownedBackgrounds?: FansubOwnedBackground[]
  customBackgroundPreviewUrl?: string
}

export type FansubEditModalTab = 'profil' | 'fansubTemasi' | 'cerceveler' | 'profilEfektleri' | 'metinAnimasyonlari' | 'rozetler'

export type FansubEditDraft = {
  avatar: string
  description: string
  discordInviteUrl: string
  slug: string
  hoverTheme: ProfileTheme | null
}

export type FansubChapterPreview = {
  chapterId: string
  chapterNumber: number
  coverImage: string
  createdAt: string
  isPending: boolean
  mangaId: string
  mangaSlug?: string
  mangaTitle: string
  publishAt?: string | null
  title?: string | null
}

export type FansubMangaShelfItem = Manga & {
  approvedChapterCount: number
  pendingChapterCount: number
  isPendingOwned: boolean
  latestReleaseAt?: string | null
}

export type FansubDisplayedBadge = FansubBadge

export type FansubOwnedProfileEffect = StoreItem
