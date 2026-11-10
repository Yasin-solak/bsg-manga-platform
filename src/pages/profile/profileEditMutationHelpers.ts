import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { FrameType } from '@components/common/AvatarFrame'
import type { ProfileTheme } from '@/lib/profileTheme'
import type { CurrentUser } from '@/contexts/AuthContext'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  hasNameTextPremiumAccess,
  resolveKnownNameTextColorId,
  resolveKnownNameTextEffectId,
  resolveKnownNameTextFontId,
  resolveKnownNameTextMotionId,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
} from '@/data/nameTextEffects'
import {
  DEFAULT_NAME_TEXT_FX_SELECTION,
  normalizeUserNameTextStyle,
  pickNameTextFxSelection,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import type { Badge as BadgeData, UserBadge } from '@/services/badgeService'
import { resolveAssetMediaType } from '@/services/assetUrlService'
import { updateUserDisplayedBadges } from '@/services/badgeService'
import { uploadUserAvatar, uploadUserProfileBackground } from '@/services/storageService'
import { userService } from '@/services/userService'

import { buildProfileBackgroundLabel } from './profileEditForm'
import {
  buildUploadedBackgroundSlotRecord,
  resolveProfileBackgroundUploadSlotLimit,
  resolveProfileBackgroundUploadTargetSlotIndex,
  resolveUploadedBackgroundsFromOwnedItems,
  withProfileBackgroundUploadSlotLimit,
  upsertUploadedBackgroundSlot,
} from './profileBackgroundUploads'
import { normalizeIsoTimestamp, parseOwnedStringList, toOwnedItemsRecord } from './profilePageUtils'
import type { MockUser, OwnedBackground, ProfileEditDraft } from './types'
import { txa } from '@/i18n/activeLocale'

type SetState<T> = Dispatch<SetStateAction<T>>

interface BuildProfileEditWriteStateOptions {
  profileOwnedItems: Record<string, unknown>
  profilePremiumExpiresAt: string | null
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
}

interface BuiltProfileEditWriteState {
  nextOwnedItems: Record<string, unknown>
  premiumAccess: boolean
  safeSelectedNameFontId: NameTextFontId | null
  safeSelectedNameEffectId: NameTextEffectId | null
  safeSelectedNameColorId: NameTextColorId | null
  safeSelectedNameSecondaryColorId: NameTextColorId | null
  safeSelectedNameMotionId: NameTextMotionId | null
  safeSelectedNameFx: NameTextFxSelection | null
}

type ProfileSocialLinks = {
  platform: string
  username: string
}[]

interface ApplyProfileEditSuccessOptions {
  nextDisplayName: string
  normalizedBio: string
  links: ProfileSocialLinks
  selectedHoverTheme: ProfileTheme | null
  nextAvatarUrl: string
  nextEquippedBackground: OwnedBackground | null
  nextActiveFansubIdentityTag: MockUser['activeFansubIdentityTag']
  equippedFrame: string | null
  selectedProfileEffectId: string | null
  selectedBadgeIds: string[]
  nextOwnedItems: Record<string, unknown>
  nextPremiumExpiresAt: string | null
  premiumAccess: boolean
  safeSelectedNameFontId: NameTextFontId | null
  safeSelectedNameEffectId: NameTextEffectId | null
  safeSelectedNameColorId: NameTextColorId | null
  safeSelectedNameSecondaryColorId: NameTextColorId | null
  safeSelectedNameMotionId: NameTextMotionId | null
  safeSelectedNameFx: NameTextFxSelection | null
  currentUser: CurrentUser | null
  user: MockUser
  updateCurrentUser: (patch: Partial<CurrentUser>) => void
  resetPendingAvatarSelection: (nextAvatarUrl?: string) => void
  resetPendingBackgroundSelection: (nextBackground?: OwnedBackground | null) => void
  setUser: SetState<MockUser | null>
  setOwnedBadges: SetState<(UserBadge & { badge?: BadgeData })[]>
  setProfileOwnedItems: SetState<Record<string, unknown>>
  setProfilePremiumExpiresAt: SetState<string | null>
  setHasNameTextAccess: SetState<boolean>
  setSelectedNameFontId: SetState<NameTextFontId>
  setSelectedNameEffectId: SetState<NameTextEffectId>
  setSelectedNameColorId: SetState<NameTextColorId>
  setSelectedNameSecondaryColorId: SetState<NameTextColorId>
  setSelectedNameMotionId: SetState<NameTextMotionId>
  setSelectedNameFx: SetState<NameTextFxSelection>
  setSelectedNameColorSlot: SetState<'primary' | 'secondary'>
  setEditDraft: SetState<ProfileEditDraft>
}

interface PersistProfileEditRequestOptions {
  userId: string
  storageOwnerAuthUserId: string | null
  currentFrameType: string | null | undefined
  currentAvatar: string
  avatarUploadFile: File | null
  backgroundUploadFile: File | null
  draftAvatar: string
  normalizedBio: string
  links: ProfileSocialLinks
  profileOwnedItems: Record<string, unknown>
  profilePremiumExpiresAt: string | null
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
  equippedFrame: string | null
  selectedBackgroundId: string | null
  selectedBackgroundUploadSlotIndex: number | null
  selectedProfileEffectId: string | null
  selectedBadgeIds: string[]
  selectedHoverTheme: ProfileTheme | null
}

interface PersistedProfileEditRequestResult {
  nextAvatarUrl: string
  nextBackgroundRef: string | null
  nextOwnedItems: Record<string, unknown>
  premiumAccess: boolean
  safeSelectedNameFontId: NameTextFontId | null
  safeSelectedNameEffectId: NameTextEffectId | null
  safeSelectedNameColorId: NameTextColorId | null
  safeSelectedNameSecondaryColorId: NameTextColorId | null
  safeSelectedNameMotionId: NameTextMotionId | null
  safeSelectedNameFx: NameTextFxSelection | null
  nextPremiumExpiresAt: string | null
}

export function revokeObjectUrl(previewUrl: string | null) {
  if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
}

export function resetPendingAvatarSelectionState(
  pendingAvatarObjectUrlRef: MutableRefObject<string | null>,
  setAvatarUploadFile: SetState<File | null>,
  setAvatarSelectionLabel: SetState<string | null>,
  setEditDraft: SetState<ProfileEditDraft>,
  fallbackAvatarUrl: string | undefined,
  nextAvatarUrl?: string,
) {
  revokeObjectUrl(pendingAvatarObjectUrlRef.current)
  pendingAvatarObjectUrlRef.current = null
  setAvatarUploadFile(null)
  setAvatarSelectionLabel(null)
  setEditDraft((prev) => ({ ...prev, avatar: nextAvatarUrl ?? fallbackAvatarUrl ?? prev.avatar }))
}

export function buildPendingAvatarSelectionResetter({
  pendingAvatarObjectUrlRef,
  setAvatarUploadFile,
  setAvatarSelectionLabel,
  setEditDraft,
  fallbackAvatarUrl,
}: {
  pendingAvatarObjectUrlRef: MutableRefObject<string | null>
  setAvatarUploadFile: SetState<File | null>
  setAvatarSelectionLabel: SetState<string | null>
  setEditDraft: SetState<ProfileEditDraft>
  fallbackAvatarUrl: string | undefined
}) {
  return (nextAvatarUrl?: string) => {
    resetPendingAvatarSelectionState(
      pendingAvatarObjectUrlRef,
      setAvatarUploadFile,
      setAvatarSelectionLabel,
      setEditDraft,
      fallbackAvatarUrl,
      nextAvatarUrl,
    )
  }
}

export function buildProfileEditWriteState({
  profileOwnedItems,
  profilePremiumExpiresAt,
  selectedNameFontId,
  selectedNameEffectId,
  selectedNameColorId,
  selectedNameSecondaryColorId,
  selectedNameMotionId,
  selectedNameFx,
}: BuildProfileEditWriteStateOptions): BuiltProfileEditWriteState {
  const baseOwnedItems = toOwnedItemsRecord(profileOwnedItems)
  const premiumOwnedItems = parseOwnedStringList(baseOwnedItems.premium)
  const premiumAccess = hasNameTextPremiumAccess({ ...baseOwnedItems, premium: premiumOwnedItems }, profilePremiumExpiresAt)
  const backgroundUploadSlotLimit = resolveProfileBackgroundUploadSlotLimit(baseOwnedItems, profilePremiumExpiresAt)
  const safeSelectedNameFontId = premiumAccess
    ? (resolveKnownNameTextFontId(selectedNameFontId) || DEFAULT_NAME_TEXT_FONT_ID)
    : null
  const safeSelectedNameEffectId = premiumAccess
    ? (resolveKnownNameTextEffectId(selectedNameEffectId) || DEFAULT_NAME_TEXT_EFFECT_ID)
    : null
  const safeSelectedNameColorId = premiumAccess
    ? (resolveKnownNameTextColorId(selectedNameColorId) || DEFAULT_NAME_TEXT_COLOR_ID)
    : null
  const safeSelectedNameSecondaryColorId = premiumAccess
    ? (resolveKnownNameTextColorId(selectedNameSecondaryColorId) || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
    : null
  const safeSelectedNameMotionId = premiumAccess
    ? (resolveKnownNameTextMotionId(selectedNameMotionId) || DEFAULT_NAME_TEXT_MOTION_ID)
    : null
  // Fill + effect color: the server stores the style object as is; reduced to valid values here.
  const safeSelectedNameFx = premiumAccess
    ? pickNameTextFxSelection(normalizeUserNameTextStyle(selectedNameFx))
    : null
  const preservedActiveNameEffect = typeof baseOwnedItems.active_name_effect === 'string' ? baseOwnedItems.active_name_effect : null
  const preservedActiveNameStyle = baseOwnedItems.active_name_style ?? null
  const nextOwnedItems = withProfileBackgroundUploadSlotLimit({
    ...baseOwnedItems,
    premium: premiumOwnedItems,
    active_name_effect: premiumAccess ? safeSelectedNameEffectId : preservedActiveNameEffect,
    active_name_style: premiumAccess
      ? {
        fontId: safeSelectedNameFontId,
        effectId: safeSelectedNameEffectId,
        colorId: safeSelectedNameColorId,
        secondaryColorId: safeSelectedNameSecondaryColorId,
        motionId: safeSelectedNameMotionId,
        ...safeSelectedNameFx,
        version: 2,
      }
      : preservedActiveNameStyle,
  }, backgroundUploadSlotLimit)

  return {
    nextOwnedItems,
    premiumAccess,
    safeSelectedNameFontId,
    safeSelectedNameEffectId,
    safeSelectedNameColorId,
    safeSelectedNameSecondaryColorId,
    safeSelectedNameMotionId,
    safeSelectedNameFx,
  }
}

export function resolveNextPremiumExpiry(
  updatedProfile: { premium_expires_at?: unknown } | null,
  profilePremiumExpiresAt: string | null,
) {
  return normalizeIsoTimestamp(updatedProfile?.premium_expires_at) ?? profilePremiumExpiresAt
}

function mergeOwnedBackgrounds(
  backgrounds: OwnedBackground[],
  nextOwnedItems: Record<string, unknown>,
  equippedBackground: OwnedBackground | null,
) {
  const storeBackgrounds = backgrounds.filter((background) => background.origin !== 'upload')
  const uploadedBackgrounds = resolveUploadedBackgroundsFromOwnedItems(nextOwnedItems)
  const mergedBackgrounds = [...uploadedBackgrounds, ...storeBackgrounds]
  if (!equippedBackground) return mergedBackgrounds

  return [
    equippedBackground,
    ...mergedBackgrounds.filter((background) => background.id !== equippedBackground.id),
  ]
}

export async function persistProfileEditRequest({
  userId,
  storageOwnerAuthUserId,
  currentFrameType,
  currentAvatar,
  avatarUploadFile,
  backgroundUploadFile,
  draftAvatar,
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
}: PersistProfileEditRequestOptions): Promise<PersistedProfileEditRequestResult> {
  const {
    nextOwnedItems,
    premiumAccess,
    safeSelectedNameFontId,
    safeSelectedNameEffectId,
    safeSelectedNameColorId,
    safeSelectedNameSecondaryColorId,
    safeSelectedNameMotionId,
    safeSelectedNameFx,
  } = buildProfileEditWriteState({
    profileOwnedItems,
    profilePremiumExpiresAt,
    selectedNameFontId,
    selectedNameEffectId,
    selectedNameColorId,
    selectedNameSecondaryColorId,
    selectedNameMotionId,
    selectedNameFx,
  })

  let mutableNextOwnedItems = nextOwnedItems
  if (premiumAccess) {
    // RPC premium kapisiyla dogrular; null gonderildiginde temayi kaldirir.
    mutableNextOwnedItems = { ...mutableNextOwnedItems, active_hover_theme: selectedHoverTheme }
  }
  const mediaStorageOwnerAuthUserId = storageOwnerAuthUserId || ''
  if ((avatarUploadFile || backgroundUploadFile) && !mediaStorageOwnerAuthUserId) {
    throw new Error(txa('Profil medyası yüklemek için oturum bulunamadı.'))
  }

  const nextAvatarUrl = avatarUploadFile
    ? await uploadUserAvatar(avatarUploadFile, mediaStorageOwnerAuthUserId || userId)
    : draftAvatar
  let resolvedNextBackgroundRef = selectedBackgroundId
  if (backgroundUploadFile) {
    const backgroundUploadSlotLimit = resolveProfileBackgroundUploadSlotLimit(mutableNextOwnedItems, profilePremiumExpiresAt)
    const targetBackgroundUploadSlotIndex = resolveProfileBackgroundUploadTargetSlotIndex(
      mutableNextOwnedItems,
      selectedBackgroundUploadSlotIndex,
      backgroundUploadSlotLimit,
    )

    resolvedNextBackgroundRef = await uploadUserProfileBackground(
      backgroundUploadFile,
      mediaStorageOwnerAuthUserId,
      targetBackgroundUploadSlotIndex,
    )

    mutableNextOwnedItems = upsertUploadedBackgroundSlot(
      mutableNextOwnedItems,
      buildUploadedBackgroundSlotRecord({
        slotIndex: targetBackgroundUploadSlotIndex,
        ref: resolvedNextBackgroundRef,
        label: buildProfileBackgroundLabel(backgroundUploadFile.name),
        mediaType: resolveAssetMediaType(resolvedNextBackgroundRef)
          || (backgroundUploadFile.type.startsWith('video/') ? 'video' : 'image'),
      }),
    )
  }

  await userService.updateProfile(userId, {
    bio: normalizedBio,
    avatar_url: nextAvatarUrl,
    social_links: links,
  } as never)

  const customizedProfile = await userService.updateMyProfileCustomization({
    applyFrameType: true,
    frameType: equippedFrame || currentFrameType || 'default',
    applyBackgroundType: true,
    backgroundType: resolvedNextBackgroundRef,
    applyProfileEffect: true,
    activeProfileEffectId: selectedProfileEffectId,
    ownedItemsPatch: mutableNextOwnedItems,
  })

  await updateUserDisplayedBadges(userId, selectedBadgeIds)

  return {
    nextAvatarUrl: nextAvatarUrl || currentAvatar,
    nextBackgroundRef: resolvedNextBackgroundRef,
    nextOwnedItems: (customizedProfile.owned_items as Record<string, unknown> | null) || mutableNextOwnedItems,
    premiumAccess,
    safeSelectedNameFontId,
    safeSelectedNameEffectId,
    safeSelectedNameColorId,
    safeSelectedNameSecondaryColorId,
    safeSelectedNameMotionId,
    safeSelectedNameFx,
    nextPremiumExpiresAt: resolveNextPremiumExpiry(
      customizedProfile as { premium_expires_at?: unknown } | null,
      profilePremiumExpiresAt,
    ),
  }
}

export function applyProfileEditSuccess({
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
}: ApplyProfileEditSuccessOptions) {
  setUser((prev) => (prev ? {
    ...prev,
    displayName: nextDisplayName,
    bio: normalizedBio,
    socialLinks: links,
    avatar: nextAvatarUrl,
    hoverTheme: premiumAccess ? selectedHoverTheme : prev.hoverTheme,
    activeFansubIdentityTag: nextActiveFansubIdentityTag,
    ownedBackgrounds: mergeOwnedBackgrounds(prev.ownedBackgrounds, nextOwnedItems, nextEquippedBackground),
    frameType: (equippedFrame || prev.frameType) as FrameType,
    activeProfileEffectId: selectedProfileEffectId,
  } : prev))

  setOwnedBadges((prev) =>
    prev.map((badge) => {
      const displayOrder = selectedBadgeIds.indexOf(badge.badge_id)
      return {
        ...badge,
        is_displayed: displayOrder !== -1,
        display_order: displayOrder === -1 ? badge.display_order : displayOrder,
      }
    }),
  )

  setProfileOwnedItems(nextOwnedItems)
  setProfilePremiumExpiresAt(nextPremiumExpiresAt)
  setHasNameTextAccess(premiumAccess)
  setSelectedNameFontId(safeSelectedNameFontId || DEFAULT_NAME_TEXT_FONT_ID)
  setSelectedNameEffectId(safeSelectedNameEffectId || DEFAULT_NAME_TEXT_EFFECT_ID)
  setSelectedNameColorId(safeSelectedNameColorId || DEFAULT_NAME_TEXT_COLOR_ID)
  setSelectedNameSecondaryColorId(safeSelectedNameSecondaryColorId || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
  setSelectedNameMotionId(safeSelectedNameMotionId || DEFAULT_NAME_TEXT_MOTION_ID)
  setSelectedNameFx(safeSelectedNameFx || DEFAULT_NAME_TEXT_FX_SELECTION)
  setSelectedNameColorSlot('primary')

  if (currentUser) updateCurrentUser({ avatar: nextAvatarUrl })
  if (currentUser?.id === user.id) {
    updateCurrentUser({
      displayName: nextDisplayName,
      ownedItems: nextOwnedItems,
      premiumExpiresAt: nextPremiumExpiresAt,
      activeProfileEffectId: selectedProfileEffectId,
    })
  }

  resetPendingAvatarSelection(nextAvatarUrl)
  resetPendingBackgroundSelection(nextEquippedBackground)
  setEditDraft((prev) => ({ ...prev, displayName: nextDisplayName, avatar: nextAvatarUrl, bio: normalizedBio }))
}
