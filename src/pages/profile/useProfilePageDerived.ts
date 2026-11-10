import { useMemo, type CSSProperties } from 'react'
import type { FrameType } from '@components/common/AvatarFrame'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { UserProfileViewAccess } from '@/services/userService'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
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
  buildUserNameStyleProps,
  DEFAULT_NAME_TEXT_FX_SELECTION,
  normalizeUserNameTextStyle,
  resolveNameTextStyleFromOwnedItems,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import { KNOWN_PROFILE_FRAME_TYPES, getProfilePrivacyGateMessage } from './helpers'
import type { MockUser, OwnedBackground } from './types'

type UseProfilePageDerivedArgs = {
  user: MockUser | null
  isOwnProfile: boolean
  profileViewAccess: UserProfileViewAccess | null
  isFollowing: boolean
  equippedFrame: string | null
  resolvedFrames: ResolvedInventoryItem[]
  equippedBackground: OwnedBackground | null
  profileOwnedItems: Record<string, unknown>
  profilePremiumExpiresAt: string | null
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameMotionId: NameTextMotionId
  selectedNameFx: NameTextFxSelection
}

function normalizeProfileStoreRef(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function useProfilePageDerived({
  user,
  isOwnProfile,
  profileViewAccess,
  isFollowing,
  equippedFrame,
  resolvedFrames,
  equippedBackground,
  profileOwnedItems,
  profilePremiumExpiresAt,
  selectedNameFontId,
  selectedNameEffectId,
  selectedNameColorId,
  selectedNameSecondaryColorId,
  selectedNameMotionId,
  selectedNameFx,
}: UseProfilePageDerivedArgs) {
  const rawFrame = equippedFrame ?? user?.frameType ?? 'default'
  const effectiveFrame: FrameType = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as never) ? (rawFrame as FrameType) : 'default'
  const normalizedRawFrame = normalizeProfileStoreRef(rawFrame)
  const resolvedFrameItem = resolvedFrames.find((frame) => normalizeProfileStoreRef(frame.identifier) === normalizedRawFrame)
  const rawCustomFrameUrl = resolvedFrameItem?.customAssetUrl
  const rawPosterFrameUrl = resolvedFrameItem?.posterAssetUrl
  const effectiveCustomFrameUrl = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as never) ? undefined : (resolveStoreAssetUrl(rawCustomFrameUrl) || rawCustomFrameUrl)
  const effectivePosterFrameUrl = KNOWN_PROFILE_FRAME_TYPES.includes(rawFrame as never) ? undefined : (resolveStoreAssetUrl(rawPosterFrameUrl) || rawPosterFrameUrl)
  const effectiveBg = equippedBackground
  const theyFollowUs = user?.followsCurrentUser === true
  const isMutual = isFollowing && theyFollowUs
  const canViewProfile = isOwnProfile || profileViewAccess?.profileVisible !== false
  const canViewProfileStats = isOwnProfile || profileViewAccess?.statsVisible !== false
  const canViewProfileLists = isOwnProfile || profileViewAccess?.activityVisible !== false
  const profilePrivacyGateMessage = getProfilePrivacyGateMessage(profileViewAccess)

  const resolvedSelectedNameFontId = resolveKnownNameTextFontId(selectedNameFontId) || DEFAULT_NAME_TEXT_FONT_ID
  const resolvedSelectedNameEffectId = resolveKnownNameTextEffectId(selectedNameEffectId) || DEFAULT_NAME_TEXT_EFFECT_ID
  const resolvedSelectedNameColorId = resolveKnownNameTextColorId(selectedNameColorId) || DEFAULT_NAME_TEXT_COLOR_ID
  const resolvedSelectedNameSecondaryColorId = resolveKnownNameTextColorId(selectedNameSecondaryColorId) || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID
  const resolvedSelectedNameMotionId = resolveKnownNameTextMotionId(selectedNameMotionId) || DEFAULT_NAME_TEXT_MOTION_ID
  const resolvedSelectedNameFx = selectedNameFx ?? DEFAULT_NAME_TEXT_FX_SELECTION

  const selectedNameStyleProps = buildUserNameStyleProps(normalizeUserNameTextStyle({
    fontId: resolvedSelectedNameFontId,
    effectId: resolvedSelectedNameEffectId,
    colorId: resolvedSelectedNameColorId,
    secondaryColorId: resolvedSelectedNameSecondaryColorId,
    motionId: resolvedSelectedNameMotionId,
    ...resolvedSelectedNameFx,
  }))
  const selectedNameStyleClassName = selectedNameStyleProps.className
  const selectedNameStyleInlineStyle = selectedNameStyleProps.style

  const resolvedProfileNameTextStyle = useMemo(
    () => resolveNameTextStyleFromOwnedItems(profileOwnedItems, profilePremiumExpiresAt),
    [profileOwnedItems, profilePremiumExpiresAt],
  )

  // Profil basligindaki ad profil temasinin uzerinde: renkler temaya cok yakinsa kontrast kalkani.
  const themeSurfaces = user?.hoverTheme ? [user.hoverTheme.mainColor, user.hoverTheme.accentColor] : undefined
  const profileHeaderNameProps = buildUserNameStyleProps(
    resolvedProfileNameTextStyle.hasPremiumAccess ? resolvedProfileNameTextStyle.style : null,
    { guardSurfaces: themeSurfaces },
  )
  const profileHeaderNameClassName = profileHeaderNameProps.className
  const profileHeaderNameInlineStyle = profileHeaderNameProps.style as CSSProperties | undefined

  return {
    rawFrame,
    effectiveFrame,
    effectiveCustomFrameUrl,
    effectivePosterFrameUrl,
    effectiveBg,
    isMutual,
    canViewProfile,
    canViewProfileStats,
    canViewProfileLists,
    profilePrivacyGateMessage,
    resolvedSelectedNameFontId,
    resolvedSelectedNameEffectId,
    resolvedSelectedNameColorId,
    resolvedSelectedNameSecondaryColorId,
    resolvedSelectedNameMotionId,
    resolvedSelectedNameFx,
    selectedNameStyleClassName,
    selectedNameStyleInlineStyle,
    profileHeaderNameClassName,
    profileHeaderNameInlineStyle,
  }
}
