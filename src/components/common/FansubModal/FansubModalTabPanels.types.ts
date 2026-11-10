import type { ChangeEvent, FormEvent } from 'react'
import type { FrameType } from '@components/common/AvatarFrame'
import type { StoreItem } from '@/data/storeProducts'
import type { FansubBadge } from '@/services/badgeService'

export type ModalTab = 'general' | 'members' | 'mangas' | 'inventory' | 'badges'

export interface MemberRow {
  id: string
  username: string
  role: string
  avatar?: string | null
  created_at?: string
}

export interface ChapterRow {
  id: string
  manga_id: string
  chapter_number: number
  title?: string | null
  created_at: string
  mangas?: {
    id?: string
    title?: string
    cover_image_url?: string | null
  } | null
}

export interface InventoryRow {
  id: string
  storeItemId: string
  type: string
  image?: string
  name: string
}

export interface ActiveItemsState {
  frame?: string
  background?: string
  pattern?: string
}

export interface FansubModalTabsHeaderProps {
  activeTab: ModalTab
  isEdit: boolean
  membersCount: number
  chaptersCount: number
  inventoryCount: number
  badgesCount: number
  onTabChange: (tab: ModalTab) => void
}

export interface FansubModalTabPanelsProps {
  activeTab: ModalTab
  isEdit: boolean
  loading: boolean
  uploading: boolean
  name: string
  description: string
  avatar: string
  previewFrame: FrameType
  presetAvatars: string[]
  members: MemberRow[]
  hasMemberChanges: boolean
  chapters: ChapterRow[]
  activeMangaId: string | null
  coinBalance: number
  redeemCodeInput: string
  inventory: InventoryRow[]
  activeItems: ActiveItemsState
  giftModalOpen: boolean
  storeItems: StoreItem[]
  ownedBadges: FansubBadge[]
  selectedBadgeIds: string[]
  onGeneralSubmit: (event: FormEvent<HTMLFormElement>) => void
  onNameChange: (value: string) => void
  onAvatarFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onPickAvatar: (value: string) => void
  onDescriptionChange: (value: string) => void
  onClose: () => void
  onMemberRoleChange: (memberId: string, role: string) => void
  onRemoveMember: (member: MemberRow) => Promise<void>
  onSaveMemberChanges: () => Promise<void>
  onToggleMangaGroup: (mangaId: string) => void
  onRemoveChapter: (chapter: ChapterRow) => Promise<void>
  onRedeemCodeInputChange: (value: string) => void
  onRedeemCode: () => Promise<void>
  onOpenGiftModal: () => void
  onCloseGiftModal: () => void
  onGiftItem: (storeItemId: string) => Promise<void>
  onGoStore: () => void
  onEquipItem: (item: InventoryRow & { image?: string }) => Promise<void>
  onRemoveInventoryItem: (storeItemId: string) => Promise<void>
  getPatternPreview: (name?: string) => string
  getBackgroundPreview: (name?: string) => string
  onToggleBadge: (badgeId: string) => void
  onSaveBadges: () => Promise<void>
}

export interface GeneralTabProps {
  isEdit: boolean
  loading: boolean
  uploading: boolean
  name: string
  description: string
  avatar: string
  previewFrame: FrameType
  presetAvatars: string[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onNameChange: (value: string) => void
  onAvatarFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onPickAvatar: (value: string) => void
  onDescriptionChange: (value: string) => void
  onClose: () => void
}

export interface MembersTabProps {
  members: MemberRow[]
  loading: boolean
  hasMemberChanges: boolean
  onRoleChange: (memberId: string, role: string) => void
  onRemoveMember: (member: MemberRow) => Promise<void>
  onSaveMemberChanges: () => Promise<void>
}

export interface MangasTabProps {
  chapters: ChapterRow[]
  activeMangaId: string | null
  onToggleMangaGroup: (mangaId: string) => void
  onRemoveChapter: (chapter: ChapterRow) => Promise<void>
}

export interface InventoryTabProps {
  coinBalance: number
  redeemCodeInput: string
  inventory: InventoryRow[]
  activeItems: ActiveItemsState
  giftModalOpen: boolean
  storeItems: StoreItem[]
  avatar: string
  onRedeemCodeInputChange: (value: string) => void
  onRedeemCode: () => Promise<void>
  onOpenGiftModal: () => void
  onCloseGiftModal: () => void
  onGiftItem: (storeItemId: string) => Promise<void>
  onGoStore: () => void
  onEquipItem: (item: InventoryRow & { image?: string }) => Promise<void>
  onRemoveInventoryItem: (storeItemId: string) => Promise<void>
  getPatternPreview: (name?: string) => string
  getBackgroundPreview: (name?: string) => string
}

export interface BadgesTabProps {
  isEdit: boolean
  ownedBadges: FansubBadge[]
  selectedBadgeIds: string[]
  onToggleBadge: (badgeId: string) => void
  onSaveBadges: () => Promise<void>
}
