import { type ChangeEvent, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { ProfileTheme } from '@/lib/profileTheme'
import type { CurrentUser } from '@/contexts/AuthContext'
import type { StoreItem } from '@/data/storeProducts'
import type { PrivacyVisibility, UserPrivacySettings } from '@/services/userService'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
} from '@/data/nameTextEffects'
import {
  pickNameTextFxSelection,
  resolveNameTextStyleFromOwnedItems,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import { type Badge as BadgeData, type UserBadge } from '@/services/badgeService'
import { toast } from '@/services/toastService'
import {
  buildProfileBackgroundLabel,
  validateProfileAvatarFile,
  validateProfileBackgroundFile,
} from './profileEditForm'
import { getSocialByPlatform } from './helpers'
import {
  resolveProfileBackgroundUploadSlotLimit,
  resolveProfileBackgroundUploadTargetSlotIndex,
} from './profileBackgroundUploads'
import { useProfileEditMutations } from './useProfileEditMutations'
import type { EditModalTab, MockUser, OwnedBackground, ProfileEditDraft } from './types'
import type { MySelectableFansubIdentityTag } from '@/services/fansubIdentityTagService'
import { txa } from '@/i18n/activeLocale'

type SetState<T> = Dispatch<SetStateAction<T>>

type ProfileEditActionsParams = {
  currentUser: CurrentUser | null
  updateCurrentUser: (patch: Partial<CurrentUser>) => void
  user: MockUser | null
  isEditSaving: boolean
  editDraft: ProfileEditDraft
  avatarUploadFile: File | null
  backgroundUploadFile: File | null
  selectedFansubIdentityTagId: string | null
  selectedFansubIdentityTag: MySelectableFansubIdentityTag | null
  privacySettings: UserPrivacySettings | null
  selectedProfileVisibility: PrivacyVisibility
  selectedPrivacySettings: UserPrivacySettings | null
  profileOwnedItems: Record<string, unknown>
  profilePremiumExpiresAt: string | null
  equippedFrame: string | null
  equippedBackground: OwnedBackground | null
  equippedProfileEffect: StoreItem | null
  selectedBadgeIds: string[]
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
  selectedHoverTheme: ProfileTheme | null
  pendingAvatarObjectUrlRef: MutableRefObject<string | null>
  pendingBackgroundObjectUrlRef: MutableRefObject<string | null>
  pendingBackgroundFallbackRef: MutableRefObject<OwnedBackground | null>
  editSessionFrameRef: MutableRefObject<string | null>
  editSessionBackgroundRef: MutableRefObject<OwnedBackground | null>
  editSessionProfileEffectRef: MutableRefObject<StoreItem | null>
  setAvatarUploadFile: SetState<File | null>
  setAvatarSelectionLabel: SetState<string | null>
  setBackgroundUploadFile: SetState<File | null>
  setBackgroundSelectionLabel: SetState<string | null>
  setEditDraft: SetState<ProfileEditDraft>
  setEquippedBackground: SetState<OwnedBackground | null>
  setEquippedFrame: SetState<string | null>
  setEquippedProfileEffect: SetState<StoreItem | null>
  setHasNameTextAccess: SetState<boolean>
  setSelectedNameFontId: SetState<NameTextFontId>
  setSelectedNameEffectId: SetState<NameTextEffectId>
  setSelectedNameColorId: SetState<NameTextColorId>
  setSelectedNameSecondaryColorId: SetState<NameTextColorId>
  setSelectedNameMotionId: SetState<NameTextMotionId>
  setSelectedNameFx: SetState<NameTextFxSelection>
  setSelectedNameColorSlot: SetState<'primary' | 'secondary'>
  setEditModalTab: SetState<EditModalTab>
  setIsEditOpen: SetState<boolean>
  setIsEditSaving: SetState<boolean>
  setUser: SetState<MockUser | null>
  setOwnedBadges: SetState<(UserBadge & { badge?: BadgeData })[]>
  setProfileOwnedItems: SetState<Record<string, unknown>>
  setProfilePremiumExpiresAt: SetState<string | null>
  onPrivacySettingsSaved: (settings: UserPrivacySettings) => void
}

export function useProfileEditActions({
  currentUser,
  updateCurrentUser,
  user,
  isEditSaving,
  editDraft,
  avatarUploadFile,
  backgroundUploadFile,
  selectedFansubIdentityTagId,
  selectedFansubIdentityTag,
  privacySettings,
  selectedProfileVisibility,
  selectedPrivacySettings,
  profileOwnedItems,
  profilePremiumExpiresAt,
  equippedFrame,
  equippedBackground,
  equippedProfileEffect,
  selectedBadgeIds,
  selectedNameFontId,
  selectedNameEffectId,
  selectedNameColorId,
  selectedNameSecondaryColorId,
  selectedNameMotionId,
  selectedNameFx,
  selectedHoverTheme,
  pendingAvatarObjectUrlRef,
  pendingBackgroundObjectUrlRef,
  pendingBackgroundFallbackRef,
  editSessionFrameRef,
  editSessionBackgroundRef,
  editSessionProfileEffectRef,
  setAvatarUploadFile,
  setAvatarSelectionLabel,
  setBackgroundUploadFile,
  setBackgroundSelectionLabel,
  setEditDraft,
  setEquippedBackground,
  setEquippedFrame,
  setEquippedProfileEffect,
  setHasNameTextAccess,
  setSelectedNameFontId,
  setSelectedNameEffectId,
  setSelectedNameColorId,
  setSelectedNameSecondaryColorId,
  setSelectedNameMotionId,
  setSelectedNameFx,
  setSelectedNameColorSlot,
  setEditModalTab,
  setIsEditOpen,
  setIsEditSaving,
  setUser,
  setOwnedBadges,
  setProfileOwnedItems,
  setProfilePremiumExpiresAt,
  onPrivacySettingsSaved,
}: ProfileEditActionsParams) {
  const {
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
    saveEdit,
  } = useProfileEditMutations({
    currentUser,
    updateCurrentUser,
    user,
    isEditSaving,
    editDraft,
    avatarUploadFile,
    backgroundUploadFile,
    selectedFansubIdentityTagId,
    selectedFansubIdentityTag,
    privacySettings,
    selectedProfileVisibility,
    selectedPrivacySettings,
    profileOwnedItems,
    profilePremiumExpiresAt,
    equippedFrame,
    equippedBackground,
    equippedProfileEffect,
    selectedBadgeIds,
    selectedNameFontId,
    selectedNameEffectId,
    selectedNameColorId,
    selectedNameSecondaryColorId,
    selectedNameMotionId,
    selectedNameFx,
    selectedHoverTheme,
    pendingAvatarObjectUrlRef,
    pendingBackgroundObjectUrlRef,
    pendingBackgroundFallbackRef,
    setAvatarUploadFile,
    setAvatarSelectionLabel,
    setBackgroundUploadFile,
    setBackgroundSelectionLabel,
    setEditDraft,
    setEquippedBackground,
    setHasNameTextAccess,
    setSelectedNameFontId,
    setSelectedNameEffectId,
    setSelectedNameColorId,
    setSelectedNameSecondaryColorId,
    setSelectedNameMotionId,
    setSelectedNameFx,
    setSelectedNameColorSlot,
    setIsEditOpen,
    setIsEditSaving,
    setUser,
    setOwnedBadges,
    setProfileOwnedItems,
    setProfilePremiumExpiresAt,
    onPrivacySettingsSaved,
  })

  const openEdit = () => {
    if (!user) return

    editSessionFrameRef.current = equippedFrame
    editSessionBackgroundRef.current = equippedBackground
    editSessionProfileEffectRef.current = equippedProfileEffect
    resetPendingAvatarSelection(user.avatar)
    resetPendingBackgroundSelection(equippedBackground)

    const resolvedNameTextStyle = resolveNameTextStyleFromOwnedItems(profileOwnedItems, profilePremiumExpiresAt)
    setEditDraft({
      displayName: user.displayName || user.username,
      bio: user.bio,
      avatar: user.avatar,
      discord: getSocialByPlatform(user.socialLinks, txa('Discord')),
      instagram: getSocialByPlatform(user.socialLinks, txa('Instagram')),
      x: getSocialByPlatform(user.socialLinks, txa('Twitter')) || getSocialByPlatform(user.socialLinks, 'X'),
    })
    setHasNameTextAccess(resolvedNameTextStyle.hasPremiumAccess)
    setSelectedNameFontId(resolvedNameTextStyle.style?.fontId || DEFAULT_NAME_TEXT_FONT_ID)
    setSelectedNameEffectId(resolvedNameTextStyle.style?.effectId || DEFAULT_NAME_TEXT_EFFECT_ID)
    setSelectedNameColorId(resolvedNameTextStyle.style?.colorId || DEFAULT_NAME_TEXT_COLOR_ID)
    setSelectedNameSecondaryColorId(resolvedNameTextStyle.style?.secondaryColorId || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
    setSelectedNameMotionId(resolvedNameTextStyle.style?.motionId || DEFAULT_NAME_TEXT_MOTION_ID)
    setSelectedNameFx(pickNameTextFxSelection(resolvedNameTextStyle.style))
    setSelectedNameColorSlot('primary')
    setEditModalTab('profil')
    setIsEditOpen(true)
  }

  const closeEdit = () => {
    if (isEditSaving) return
    resetPendingAvatarSelection(user?.avatar)
    resetPendingBackgroundSelection(editSessionBackgroundRef.current)
    setEquippedFrame(editSessionFrameRef.current)
    setEquippedProfileEffect(editSessionProfileEffectRef.current)
    setIsEditOpen(false)
  }

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      validateProfileAvatarFile(file)
      resetPendingAvatarSelection()
      const previewUrl = URL.createObjectURL(file)
      pendingAvatarObjectUrlRef.current = previewUrl
      setAvatarUploadFile(file)
      setAvatarSelectionLabel(file.name)
      setEditDraft((prev) => ({ ...prev, avatar: previewUrl }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Avatar seçilemedi.'))
    }
    event.target.value = ''
  }

  const handleBackgroundFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      validateProfileBackgroundFile(file)
      const fallbackBackground = pendingBackgroundFallbackRef.current ?? equippedBackground
      const targetSlotLimit = resolveProfileBackgroundUploadSlotLimit(profileOwnedItems, profilePremiumExpiresAt)
      if (targetSlotLimit <= 0) {
        resetPendingBackgroundSelection()
        toast.warning(txa('Profil arka planı yüklemek için Premium gerekir.'))
        event.target.value = ''
        return
      }
      const targetSlotIndex = resolveProfileBackgroundUploadTargetSlotIndex(
        profileOwnedItems,
        fallbackBackground?.origin === 'upload' ? fallbackBackground.slotIndex ?? 0 : null,
        targetSlotLimit,
      )
      resetPendingBackgroundSelection()
      pendingBackgroundFallbackRef.current = fallbackBackground
      const previewUrl = URL.createObjectURL(file)
      pendingBackgroundObjectUrlRef.current = previewUrl
      setBackgroundUploadFile(file)
      setBackgroundSelectionLabel(file.name)
      setEquippedBackground({
        id: previewUrl,
        label: buildProfileBackgroundLabel(file.name),
        background: previewUrl,
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
        origin: 'upload',
        slotIndex: targetSlotIndex,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Arka plan seçilemedi.'))
    }
    event.target.value = ''
  }

  const selectEquippedBackground = (background: OwnedBackground) => {
    resetPendingBackgroundSelection(background)
  }

  const resetBackground = () => {
    resetPendingBackgroundSelection(null)
  }

  return {
    openEdit,
    closeEdit,
    saveEdit,
    handleAvatarFile,
    handleBackgroundFile,
    selectEquippedBackground,
    resetBackground,
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
  }
}
