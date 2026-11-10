import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { ProfileTheme } from '@/lib/profileTheme'
import type { CurrentUser } from '@/contexts/AuthContext'
import { type NameTextColorId, type NameTextEffectId, type NameTextFontId, type NameTextMotionId } from '@/data/nameTextEffects'
import { type NameTextFxSelection } from '@/data/userNameStyle'
import type { StoreItem } from '@/data/storeProducts'
import { setMyActiveFansubIdentityTag, type MySelectableFansubIdentityTag } from '@/services/fansubIdentityTagService'
import { type Badge as BadgeData, type UserBadge } from '@/services/badgeService'
import { userService, type PrivacyVisibility, type UserPrivacySettings } from '@/services/userService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { toast } from '@/services/toastService'
import { reportUserFacingError } from '@/services/userFacingError'

import {
  buildProfileBackgroundLabel,
  buildProfileSocialLinksFromDraft,
  getProfileEditDisplayNameError,
  sanitizeProfileEditBio,
  sanitizeProfileEditDisplayName,
} from './profileEditForm'
import {
  buildUploadedBackgroundSlotRecord,
  toOwnedBackgroundFromUploadedSlot,
} from './profileBackgroundUploads'
import {
  applyProfileEditSuccess,
  buildPendingAvatarSelectionResetter,
  persistProfileEditRequest,
  revokeObjectUrl,
} from './profileEditMutationHelpers'
import type { MockUser, OwnedBackground, ProfileEditDraft } from './types'
import { txa } from '@/i18n/activeLocale'

const profileEditMutationLogger = createScopedLogger('ProfilePage')

type SetState<T> = Dispatch<SetStateAction<T>>

const PRIVACY_SETTING_KEYS: Array<keyof UserPrivacySettings> = [
  'profileVisibility',
  'statsVisibility',
  'socialLinksVisibility',
  'activityVisibility',
]

function havePrivacySettingsChanged(current: UserPrivacySettings | null, next: UserPrivacySettings | null) {
  if (!current || !next) return false
  return PRIVACY_SETTING_KEYS.some((key) => current[key] !== next[key])
}

interface UseProfileEditMutationsOptions {
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
  setAvatarUploadFile: SetState<File | null>
  setAvatarSelectionLabel: SetState<string | null>
  setBackgroundUploadFile: SetState<File | null>
  setBackgroundSelectionLabel: SetState<string | null>
  setEditDraft: SetState<ProfileEditDraft>
  setEquippedBackground: SetState<OwnedBackground | null>
  setHasNameTextAccess: SetState<boolean>
  setSelectedNameFontId: SetState<NameTextFontId>
  setSelectedNameEffectId: SetState<NameTextEffectId>
  setSelectedNameColorId: SetState<NameTextColorId>
  setSelectedNameSecondaryColorId: SetState<NameTextColorId>
  setSelectedNameMotionId: SetState<NameTextMotionId>
  setSelectedNameFx: SetState<NameTextFxSelection>
  setSelectedNameColorSlot: SetState<'primary' | 'secondary'>
  setIsEditOpen: SetState<boolean>
  setIsEditSaving: SetState<boolean>
  setUser: SetState<MockUser | null>
  setOwnedBadges: SetState<(UserBadge & { badge?: BadgeData })[]>
  setProfileOwnedItems: SetState<Record<string, unknown>>
  setProfilePremiumExpiresAt: SetState<string | null>
  onPrivacySettingsSaved: (settings: UserPrivacySettings) => void
}

export function useProfileEditMutations({
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
}: UseProfileEditMutationsOptions) {
  const resetPendingAvatarSelection = buildPendingAvatarSelectionResetter({
    pendingAvatarObjectUrlRef,
    setAvatarUploadFile,
    setAvatarSelectionLabel,
    setEditDraft,
    fallbackAvatarUrl: user?.avatar,
  })

  const resetPendingBackgroundSelection = (nextBackground?: OwnedBackground | null) => {
    revokeObjectUrl(pendingBackgroundObjectUrlRef.current)
    pendingBackgroundObjectUrlRef.current = null
    setBackgroundUploadFile(null)
    setBackgroundSelectionLabel(null)
    const resolvedBackground = nextBackground !== undefined ? nextBackground : pendingBackgroundFallbackRef.current
    setEquippedBackground(resolvedBackground ?? null)
    pendingBackgroundFallbackRef.current = resolvedBackground ?? null
  }

  const saveEdit = async () => {
    if (!user?.id || isEditSaving) return

    const displayNameError = getProfileEditDisplayNameError(editDraft.displayName)
    if (displayNameError) {
      toast.error(displayNameError)
      return
    }

    const normalizedDisplayName = sanitizeProfileEditDisplayName(editDraft.displayName)
    const normalizedBio = sanitizeProfileEditBio(editDraft.bio)
    const links = buildProfileSocialLinksFromDraft(editDraft)
    const requestContext = createRequestContext('ProfilePage', 'save-profile-edit', {
      profileUserId: user.id,
      currentUserId: currentUser?.id || null,
    })

    try {
      setIsEditSaving(true)
      const selectedBackgroundId = equippedBackground?.id || null
      const selectedBackgroundUploadSlotIndex = equippedBackground?.origin === 'upload'
        ? equippedBackground.slotIndex ?? 0
        : null
      const selectedProfileEffectId = equippedProfileEffect?.id || null
      const {
        nextAvatarUrl,
        nextBackgroundRef,
        nextOwnedItems,
        premiumAccess,
        safeSelectedNameFontId,
        safeSelectedNameEffectId,
        safeSelectedNameColorId,
        safeSelectedNameSecondaryColorId,
        safeSelectedNameMotionId,
        safeSelectedNameFx,
        nextPremiumExpiresAt,
      } = await persistProfileEditRequest({
        userId: user.id,
        storageOwnerAuthUserId: currentUser?.authUserId || null,
        currentFrameType: user.frameType,
        currentAvatar: user.avatar,
        avatarUploadFile,
        backgroundUploadFile,
        draftAvatar: editDraft.avatar,
        normalizedBio,
        links,
        profileOwnedItems,
        profilePremiumExpiresAt,
        selectedNameFontId,
        selectedNameEffectId,
        selectedNameColorId,
        selectedNameSecondaryColorId,
        selectedNameMotionId,
        selectedNameFx,
        equippedFrame,
        selectedBackgroundId,
        selectedBackgroundUploadSlotIndex,
        selectedProfileEffectId,
        selectedBadgeIds,
        selectedHoverTheme,
      })
      let nextDisplayName = user.displayName || user.username
      let displayNameSyncWarning: string | null = null

      if (normalizedDisplayName !== nextDisplayName) {
        try {
          const updatedIdentity = await userService.updateMyDisplayName(normalizedDisplayName)
          if (updatedIdentity.id !== user.id) {
            throw new Error(txa('Görünen ad güncellemesi aktif profil ile eşleşmiyor.'))
          }
          nextDisplayName = updatedIdentity.display_name
        } catch (displayNameError) {
          profileEditMutationLogger.warn({
            event: 'save-profile-edit-display-name-sync-failed',
            message: 'gorunen ad kaydedilemedi.',
            context: {
              profileUserId: user.id,
            },
            error: displayNameError,
          })
          displayNameSyncWarning = txa('Profil güncellendi ancak görünen ad eski halinde kaldı.')
        }
      }
      let nextActiveFansubIdentityTag = user.activeFansubIdentityTag ?? null
      const previousActiveTagId = user.activeFansubIdentityTag?.id ?? null
      let fansubIdentitySyncWarning: string | null = null
      let privacySyncWarning: string | null = null

      if (selectedFansubIdentityTagId !== previousActiveTagId) {
        try {
          const result = await setMyActiveFansubIdentityTag(selectedFansubIdentityTagId)
          nextActiveFansubIdentityTag = result.activeTag ?? null
        } catch (identityError) {
          profileEditMutationLogger.warn({
            event: 'save-profile-edit-fansub-identity-sync-failed',
            message: 'fansub etiketi secimi kaydedilemedi.',
            context: {
              profileUserId: user.id,
              selectedFansubIdentityTagId,
            },
            error: identityError,
          })
          fansubIdentitySyncWarning = txa('Profil güncellendi ancak fansub etiketi seçimi eski halinde kaldı.')
          nextActiveFansubIdentityTag = user.activeFansubIdentityTag ?? null
        }
      } else if (!selectedFansubIdentityTagId) {
        nextActiveFansubIdentityTag = null
      } else {
        nextActiveFansubIdentityTag = selectedFansubIdentityTag ?? user.activeFansubIdentityTag ?? null
      }

      const requestedPrivacySettings = privacySettings
        ? {
            ...(selectedPrivacySettings ?? privacySettings),
            profileVisibility: selectedProfileVisibility,
          }
        : null

      if (requestedPrivacySettings && havePrivacySettingsChanged(privacySettings, requestedPrivacySettings)) {
        try {
          const nextPrivacySettings = await userService.updateMyPrivacySettings(requestedPrivacySettings)
          onPrivacySettingsSaved(nextPrivacySettings)
        } catch (privacyError) {
          profileEditMutationLogger.warn({
            event: 'save-profile-edit-privacy-sync-failed',
            message: 'profil gizlilik ayarlari kaydedilemedi.',
            context: {
              profileUserId: user.id,
              requestedPrivacySettings,
            },
            error: privacyError,
          })
          privacySyncWarning = txa('Profil güncellendi ancak gizlilik ayarları eski halinde kaldı.')
        }
      }

      const nextEquippedBackground = backgroundUploadFile && nextBackgroundRef
        ? toOwnedBackgroundFromUploadedSlot(
            buildUploadedBackgroundSlotRecord({
              slotIndex: selectedBackgroundUploadSlotIndex ?? 0,
              ref: nextBackgroundRef,
              label: buildProfileBackgroundLabel(backgroundUploadFile.name),
              mediaType: backgroundUploadFile.type.startsWith('video/') ? 'video' : 'image',
            }),
          )
        : nextBackgroundRef === null
          ? null
          : equippedBackground
            ? {
                ...equippedBackground,
                id: nextBackgroundRef,
              }
            : null

      applyProfileEditSuccess({
        nextDisplayName,
        normalizedBio,
        links,
        selectedHoverTheme,
        nextAvatarUrl,
        nextEquippedBackground,
        nextActiveFansubIdentityTag,
        equippedFrame,
        selectedProfileEffectId,
        selectedBadgeIds,
        nextOwnedItems,
        nextPremiumExpiresAt,
        premiumAccess,
        safeSelectedNameFontId,
        safeSelectedNameEffectId,
        safeSelectedNameColorId,
        safeSelectedNameSecondaryColorId,
        safeSelectedNameMotionId,
        safeSelectedNameFx,
        currentUser,
        user,
        updateCurrentUser,
        resetPendingAvatarSelection,
        resetPendingBackgroundSelection,
        setUser,
        setOwnedBadges,
        setProfileOwnedItems,
        setProfilePremiumExpiresAt,
        setHasNameTextAccess,
        setSelectedNameFontId,
        setSelectedNameEffectId,
        setSelectedNameColorId,
        setSelectedNameSecondaryColorId,
        setSelectedNameMotionId,
        setSelectedNameFx,
        setSelectedNameColorSlot,
        setEditDraft,
      })
      const syncWarnings = [displayNameSyncWarning, fansubIdentitySyncWarning, privacySyncWarning].filter(Boolean)
      if (syncWarnings.length > 0) {
        toast.warning(syncWarnings.join(' '))
      } else {
        toast.success(txa('Profil güncellendi.'))
      }
      setIsEditOpen(false)
    } catch (error) {
      const reportedError = reportUserFacingError(profileEditMutationLogger, {
        event: requestContext.event,
        error,
        fallback: txa('Profil kaydedilirken bir hata oluştu.'),
        requestContext,
      })
      toast.error(reportedError.userMessage)
    } finally {
      setIsEditSaving(false)
    }
  }

  return {
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
    saveEdit,
  }
}
