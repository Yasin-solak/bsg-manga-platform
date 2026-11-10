import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { StoreItem } from '@/data/storeProducts'
import { parseProfileTheme, type ProfileTheme } from '@/lib/profileTheme'
import type { MangaListSummary } from '@/services/mangaListService'
import {
  listMySelectableFansubIdentityTags,
  type MySelectableFansubIdentityTag,
} from '@/services/fansubIdentityTagService'
import { userService } from '@/services/userService'
import { isAbortError } from '@/services/supabaseError'
import { type Badge as BadgeData, type UserBadge } from '@/services/badgeService'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
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
  DEFAULT_NAME_TEXT_FX_SELECTION,
  type NameTextFxSelection,
} from '@/data/userNameStyle'
import type { PrivacyVisibility, UserPrivacySettings, UserProfileViewAccess } from '@/services/userService'
import { toast } from '@/services/toastService'
import { useProfileEditActions } from './useProfileEditActions'
import { loadProfileDecorations } from './profileDataLoaders'
import { resolveUploadedBackgroundsFromOwnedItems } from './profileBackgroundUploads'
import { loadProfilePageSnapshot } from './profilePageLoader'
import { isProfileNotFoundError } from './profilePageUtils'
import { reportProfilePageError } from './profilePageErrors'
import { useProfilePageDerived } from './useProfilePageDerived'
import { useProfileFollowState } from './useProfileFollowState'
import type { EditModalTab, FollowUser, MockUser, OwnedBackground, ProfileEditDraft } from './types'
import { txa } from '@/i18n/activeLocale'

function pickPrivacySettings(access: UserProfileViewAccess | null): UserPrivacySettings | null {
  if (!access) return null

  return {
    profileVisibility: access.profileVisibility,
    statsVisibility: access.statsVisibility,
    socialLinksVisibility: access.socialLinksVisibility,
    activityVisibility: access.activityVisibility,
  }
}

export function useProfilePageController() {
  const { username } = useParams<{ username: string }>()
  const { currentUser, updateCurrentUser } = useAuth()

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editModalTab, setEditModalTab] = useState<EditModalTab>('profil')
  const [editDraft, setEditDraft] = useState<ProfileEditDraft>({ displayName: '', bio: '', avatar: '', discord: '', instagram: '', x: '' })
  const [equippedFrame, setEquippedFrame] = useState<string | null>(null)
  const [equippedBackground, setEquippedBackground] = useState<OwnedBackground | null>(null)
  const [followersModalOpen, setFollowersModalOpen] = useState(false)
  const [followingModalOpen, setFollowingModalOpen] = useState(false)
  const [followersList, setFollowersList] = useState<FollowUser[]>([])
  const [followingList, setFollowingList] = useState<FollowUser[]>([])
  const [followersListLoading, setFollowersListLoading] = useState(false)
  const [followingListLoading, setFollowingListLoading] = useState(false)
  const [followersListLoaded, setFollowersListLoaded] = useState(false)
  const [followingListLoaded, setFollowingListLoaded] = useState(false)
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [avatarUploadFile, setAvatarUploadFile] = useState<File | null>(null)
  const [avatarSelectionLabel, setAvatarSelectionLabel] = useState<string | null>(null)
  const [backgroundUploadFile, setBackgroundUploadFile] = useState<File | null>(null)
  const [backgroundSelectionLabel, setBackgroundSelectionLabel] = useState<string | null>(null)
  const [ownedBadges, setOwnedBadges] = useState<(UserBadge & { badge?: BadgeData })[]>([])
  const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([])
  const [resolvedFrames, setResolvedFrames] = useState<ResolvedInventoryItem[]>([])
  const [ownedProfileEffects, setOwnedProfileEffects] = useState<StoreItem[]>([])
  const [profileOwnedItems, setProfileOwnedItems] = useState<Record<string, unknown>>({})
  const [profilePremiumExpiresAt, setProfilePremiumExpiresAt] = useState<string | null>(null)
  const [hasNameTextAccess, setHasNameTextAccess] = useState(false)
  const [selectedNameFontId, setSelectedNameFontId] = useState<NameTextFontId>(DEFAULT_NAME_TEXT_FONT_ID)
  const [selectedNameEffectId, setSelectedNameEffectId] = useState<NameTextEffectId>(DEFAULT_NAME_TEXT_EFFECT_ID)
  const [selectedNameColorId, setSelectedNameColorId] = useState<NameTextColorId>(DEFAULT_NAME_TEXT_COLOR_ID)
  const [selectedNameSecondaryColorId, setSelectedNameSecondaryColorId] = useState<NameTextColorId>(DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
  const [selectedNameMotionId, setSelectedNameMotionId] = useState<NameTextMotionId>(DEFAULT_NAME_TEXT_MOTION_ID)
  const [selectedNameFx, setSelectedNameFx] = useState<NameTextFxSelection>(DEFAULT_NAME_TEXT_FX_SELECTION)
  const [selectedNameColorSlot, setSelectedNameColorSlot] = useState<'primary' | 'secondary'>('primary')
  const [selectedHoverTheme, setSelectedHoverTheme] = useState<ProfileTheme | null>(null)
  const [equippedProfileEffect, setEquippedProfileEffect] = useState<StoreItem | null>(null)
  const [editResourcesHydrated, setEditResourcesHydrated] = useState(false)
  const [isEditResourcesLoading, setIsEditResourcesLoading] = useState(false)
  const [selectableFansubIdentityTags, setSelectableFansubIdentityTags] = useState<MySelectableFansubIdentityTag[]>([])
  const [selectedFansubIdentityTagId, setSelectedFansubIdentityTagId] = useState<string | null>(null)
  const [isFansubIdentityTagsLoading, setIsFansubIdentityTagsLoading] = useState(false)
  const [user, setUser] = useState<MockUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [profileViewAccess, setProfileViewAccess] = useState<UserProfileViewAccess | null>(null)
  const [profileVisibilityDraft, setProfileVisibilityDraft] = useState<PrivacyVisibility>('public')
  const [privacySettingsDraft, setPrivacySettingsDraft] = useState<UserPrivacySettings | null>(null)
  const [profileLists, setProfileLists] = useState<MangaListSummary[]>([])
  const [profileListsLoading, setProfileListsLoading] = useState(false)
  const [profileVisibilityRefreshKey, setProfileVisibilityRefreshKey] = useState(0)
  const lastLoadedUsernameRef = useRef<string | null>(null)
  const pendingAvatarObjectUrlRef = useRef<string | null>(null)
  const pendingBackgroundObjectUrlRef = useRef<string | null>(null)
  const pendingBackgroundFallbackRef = useRef<OwnedBackground | null>(null)
  const editSessionFrameRef = useRef<string | null>(null)
  const editSessionBackgroundRef = useRef<OwnedBackground | null>(null)
  const editSessionProfileEffectRef = useRef<StoreItem | null>(null)

  const isOwnProfile = Boolean(currentUser && user && currentUser.id === user.id)

  const { isFollowing, isRequested, relationship, followBusy, reloadRelationship, handleFollow } = useProfileFollowState({
    currentUserId: currentUser?.id,
    profileUserId: user?.id,
    onVisibilityRefresh: () => setProfileVisibilityRefreshKey((prev) => prev + 1),
  })
  const canViewProfileStatsGate = isOwnProfile || Boolean(profileViewAccess?.statsVisible)
  const updateProfileVisibilityDraft = (value: PrivacyVisibility) => {
    setProfileVisibilityDraft(value)
    setPrivacySettingsDraft((prev) => {
      const baseSettings = prev ?? pickPrivacySettings(profileViewAccess)
      return baseSettings ? { ...baseSettings, profileVisibility: value } : prev
    })
  }
  const updatePrivacySettingDraft = (key: keyof UserPrivacySettings, value: PrivacyVisibility) => {
    setPrivacySettingsDraft((prev) => {
      const baseSettings = prev ?? pickPrivacySettings(profileViewAccess)
      return baseSettings ? { ...baseSettings, [key]: value } : prev
    })
    if (key === 'profileVisibility') {
      setProfileVisibilityDraft(value)
    }
  }

  const {
    openEdit: openEditBase,
    closeEdit,
    saveEdit,
    handleAvatarFile,
    handleBackgroundFile,
    selectEquippedBackground,
    resetBackground,
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
  } = useProfileEditActions({
    currentUser,
    updateCurrentUser,
    user,
    isEditSaving,
    editDraft,
    avatarUploadFile,
    backgroundUploadFile,
    selectedFansubIdentityTagId,
    selectedFansubIdentityTag: selectableFansubIdentityTags.find((item) => item.id === selectedFansubIdentityTagId) ?? null,
    privacySettings: pickPrivacySettings(profileViewAccess),
    selectedProfileVisibility: profileVisibilityDraft,
    selectedPrivacySettings: privacySettingsDraft ?? pickPrivacySettings(profileViewAccess),
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
    onPrivacySettingsSaved: (nextSettings) => {
      setProfileVisibilityDraft(nextSettings.profileVisibility)
      setPrivacySettingsDraft(nextSettings)
      setProfileViewAccess((prev) => (
        prev
          ? { ...prev, ...nextSettings }
          : prev
      ))
    },
  })

  useEffect(() => () => {
    const previewUrl = pendingAvatarObjectUrlRef.current
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
  }, [])

  useEffect(() => () => {
    const previewUrl = pendingBackgroundObjectUrlRef.current
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      if (!username) return

      const routeChanged = lastLoadedUsernameRef.current !== username
      if (routeChanged) setLoading(true)

      setProfileListsLoading(true)
      setFollowersModalOpen(false)
      setFollowingModalOpen(false)
      setFollowersList([])
      setFollowingList([])
      setFollowersListLoaded(false)
      setFollowingListLoaded(false)
      setLoadError(null)
      setNotFound(false)
      setProfileViewAccess(null)
      setPrivacySettingsDraft(null)
      setEquippedBackground(null)
      setEquippedFrame(null)
      setEquippedProfileEffect(null)
      setEditResourcesHydrated(false)
      setIsEditResourcesLoading(false)
      setOwnedProfileEffects([])
      setSelectableFansubIdentityTags([])
      setSelectedFansubIdentityTagId(null)
      setIsFansubIdentityTagsLoading(false)
      pendingBackgroundFallbackRef.current = null

      try {
        const snapshot = await loadProfilePageSnapshot({
          currentUserId: currentUser?.id ?? null,
          username,
        })
        if (cancelled) return

        setProfileViewAccess(snapshot.profileViewAccess)
        setProfileVisibilityDraft(snapshot.profileViewAccess.profileVisibility)
        setPrivacySettingsDraft(pickPrivacySettings(snapshot.profileViewAccess))
        setProfileOwnedItems(snapshot.profileOwnedItems)
        setProfilePremiumExpiresAt(snapshot.profilePremiumExpiresAt)
        setHasNameTextAccess(snapshot.hasNameTextAccess)
        setSelectedNameFontId(snapshot.selectedNameFontId)
        setSelectedNameEffectId(snapshot.selectedNameEffectId)
        setSelectedNameColorId(snapshot.selectedNameColorId)
        setSelectedNameSecondaryColorId(snapshot.selectedNameSecondaryColorId)
        setSelectedNameMotionId(snapshot.selectedNameMotionId)
        setSelectedNameFx(snapshot.selectedNameFx)
        setSelectedNameColorSlot('primary')
        setSelectedHoverTheme(parseProfileTheme(snapshot.profileOwnedItems?.active_hover_theme))
        setUser(snapshot.user)
        setProfileLists(snapshot.profileLists)
        setOwnedBadges(snapshot.ownedBadges)
        setSelectedBadgeIds(snapshot.selectedBadgeIds)
        setResolvedFrames(snapshot.resolvedFrames)
        setOwnedProfileEffects(snapshot.ownedProfileEffects)
        setEquippedBackground(snapshot.equippedBackground)
        setEquippedProfileEffect(snapshot.equippedProfileEffect)
        setEditResourcesHydrated(snapshot.editResourcesHydrated)
        setSelectedFansubIdentityTagId(snapshot.user.activeFansubIdentityTag?.id ?? null)
        pendingBackgroundFallbackRef.current = snapshot.equippedBackground
        lastLoadedUsernameRef.current = username
      } catch (error) {
        if (cancelled || isAbortError(error)) return

        setUser(null)
        setProfileOwnedItems({})
        setProfilePremiumExpiresAt(null)
        setHasNameTextAccess(false)
        setSelectedNameFontId(DEFAULT_NAME_TEXT_FONT_ID)
        setSelectedNameEffectId(DEFAULT_NAME_TEXT_EFFECT_ID)
        setSelectedNameColorId(DEFAULT_NAME_TEXT_COLOR_ID)
        setSelectedNameSecondaryColorId(DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
        setSelectedNameMotionId(DEFAULT_NAME_TEXT_MOTION_ID)
        setSelectedNameFx(DEFAULT_NAME_TEXT_FX_SELECTION)
        setSelectedNameColorSlot('primary')
        setSelectedHoverTheme(null)
        setProfileLists([])
        setEditResourcesHydrated(false)
        setIsEditResourcesLoading(false)
        setSelectableFansubIdentityTags([])
        setSelectedFansubIdentityTagId(null)
        setProfileVisibilityDraft('public')
        setPrivacySettingsDraft(null)
        setIsFansubIdentityTagsLoading(false)
        pendingBackgroundFallbackRef.current = null

        if (isProfileNotFoundError(error)) {
          setNotFound(true)
          setLoadError(txa('Profil bulunamadı.'))
        } else {
          const reportedError = reportProfilePageError(
            'load-profile',
            error,
            txa('Profil yüklenirken bir hata oluştu.'),
            { username, currentUserId: currentUser?.id || null },
          )
          setLoadError(reportedError.userMessage)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setProfileListsLoading(false)
        }
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [username, currentUser?.id, profileVisibilityRefreshKey])

  useEffect(() => {
    if (!followersModalOpen || !canViewProfileStatsGate || !user?.id || followersListLoaded) return

    let cancelled = false
    const controller = new AbortController()
    setFollowersListLoading(true)

    void userService.getUserFollowers(user.id, controller.signal)
      .then((rows) => {
        if (cancelled) return
        setFollowersList(rows)
        setFollowersListLoaded(true)
      })
      .catch((error) => {
        if (cancelled || isAbortError(error)) return
        reportProfilePageError('load-followers-list', error, txa('Takipçi listesi yüklenemedi.'), {
          username: user.username,
          profileId: user.id || null,
        })
        setFollowersList([])
      })
      .finally(() => {
        if (!cancelled) setFollowersListLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      setFollowersListLoading(false)
    }
  }, [followersModalOpen, canViewProfileStatsGate, user?.id, user?.username, followersListLoaded])

  useEffect(() => {
    if (!followingModalOpen || !canViewProfileStatsGate || !user?.id || followingListLoaded) return

    let cancelled = false
    const controller = new AbortController()
    setFollowingListLoading(true)

    void userService.getUserFollowing(user.id, controller.signal)
      .then((rows) => {
        if (cancelled) return
        setFollowingList(rows)
        setFollowingListLoaded(true)
      })
      .catch((error) => {
        if (cancelled || isAbortError(error)) return
        reportProfilePageError('load-following-list', error, txa('Takip edilen listesi yüklenemedi.'), {
          username: user.username,
          profileId: user.id || null,
        })
        setFollowingList([])
      })
      .finally(() => {
        if (!cancelled) setFollowingListLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      setFollowingListLoading(false)
    }
  }, [followingModalOpen, canViewProfileStatsGate, user?.id, user?.username, followingListLoaded])

  const openEdit = async () => {
    if (!user || isEditResourcesLoading || isFansubIdentityTagsLoading) return
    const currentPrivacySettings = pickPrivacySettings(profileViewAccess)
    setProfileVisibilityDraft(currentPrivacySettings?.profileVisibility ?? 'public')
    setPrivacySettingsDraft(currentPrivacySettings)

    if (!editResourcesHydrated) {
      setIsEditResourcesLoading(true)
      try {
        const decorations = await loadProfileDecorations(user.id || '', profileOwnedItems)
        const uploadedBackgrounds = resolveUploadedBackgroundsFromOwnedItems(profileOwnedItems)
        const mergedBackgrounds = [
          ...uploadedBackgrounds,
          ...decorations.backgroundItems.filter(
            (backgroundItem) => !uploadedBackgrounds.some((uploadedBackground) => uploadedBackground.id === backgroundItem.id),
          ),
        ]

        setOwnedBadges(decorations.ownedBadges)
        setSelectedBadgeIds(decorations.selectedBadgeIds)
        setResolvedFrames(decorations.resolvedFrames)
        setOwnedProfileEffects(decorations.profileEffectItems)
        setEquippedProfileEffect((currentEffect) => {
          if (!currentEffect?.id) return null
          return decorations.profileEffectItems.find((effect) => effect.id === currentEffect.id) || currentEffect
        })
        setEquippedBackground((currentBackground) => {
          if (!currentBackground?.id) return currentBackground
          return mergedBackgrounds.find((backgroundItem) => backgroundItem.id === currentBackground.id) || currentBackground
        })
        setUser((prev) => (prev ? { ...prev, ownedBackgrounds: mergedBackgrounds } : prev))
        setEditResourcesHydrated(true)
      } catch (error) {
        reportProfilePageError('load-edit-decorations', error, txa('Profil düzenleme envanteri yüklenemedi.'), {
          username: user.username,
          profileId: user.id || null,
        })
        toast.error(txa('Profil düzenleme envanteri şu anda yüklenemedi.'))
        return
      } finally {
        setIsEditResourcesLoading(false)
      }
    }

    setIsFansubIdentityTagsLoading(true)
    try {
      const nextSelectableTags = await listMySelectableFansubIdentityTags()
      setSelectableFansubIdentityTags(nextSelectableTags)
      const fallbackSelectedTagId = user.activeFansubIdentityTag?.id ?? null
      const nextSelectedTagId = nextSelectableTags.find((item) => item.isSelected)?.id
        ?? (fallbackSelectedTagId && nextSelectableTags.some((item) => item.id === fallbackSelectedTagId) ? fallbackSelectedTagId : null)
      setSelectedFansubIdentityTagId(nextSelectedTagId)
    } catch (error) {
      reportProfilePageError('load-fansub-identity-tags', error, txa('Fansub etiketleri yüklenemedi.'), {
        username: user.username,
        profileId: user.id || null,
      })
      toast.warning(txa('Fansub etiketleri bu açılışta yüklenemedi.'))
      setSelectableFansubIdentityTags([])
      setSelectedFansubIdentityTagId(user.activeFansubIdentityTag?.id ?? null)
    } finally {
      setIsFansubIdentityTagsLoading(false)
    }

    openEditBase()
  }

  const {
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
  } = useProfilePageDerived({
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
  })

  return {
    username,
    currentUser,
    user,
    loading,
    loadError,
    notFound,
    isOwnProfile,
    canViewProfile,
    canViewProfileStats,
    canViewProfileLists,
    profilePrivacyGateMessage,
    profileViewAccess,
    profileVisibilityDraft,
    privacySettingsDraft,
    updateProfileVisibilityDraft,
    updatePrivacySettingDraft,
    isFollowing,
    isRequested,
    relationship,
    followBusy,
    reloadRelationship,
    isMutual,
    followersModalOpen,
    followersList,
    followersListLoading,
    followingModalOpen,
    followingList,
    followingListLoading,
    setFollowersModalOpen,
    setFollowingModalOpen,
    openEdit,
    closeEdit,
    saveEdit,
    handleFollow,
    avatarSelectionLabel,
    backgroundSelectionLabel,
    editDraft,
    updateEditDraft: (patch: Partial<ProfileEditDraft>) => setEditDraft((prev) => ({ ...prev, ...patch })),
    editModalTab,
    setEditModalTab,
    equippedBackground,
    setEquippedBackground: selectEquippedBackground,
    equippedFrame,
    setEquippedFrame,
    equippedProfileEffect,
    setEquippedProfileEffect,
    hasPendingAvatarUpload: Boolean(avatarUploadFile),
    hasPendingBackgroundUpload: Boolean(backgroundUploadFile),
    hasNameTextAccess,
    handleAvatarFile,
    handleBackgroundFile,
    resetBackground,
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
    ownedBadges,
    ownedProfileEffects,
    resolvedFrames,
    selectableFansubIdentityTags,
    selectedFansubIdentityTagId,
    setSelectedFansubIdentityTagId,
    isFansubIdentityTagsLoading,
    isEditOpen,
    isEditResourcesLoading,
    isEditSaving,
    selectedBadgeIds,
    setSelectedBadgeIds,
    selectedNameColorId: resolvedSelectedNameColorId,
    selectedNameColorSlot,
    setSelectedNameColorId,
    setSelectedNameColorSlot,
    selectedNameEffectId: resolvedSelectedNameEffectId,
    setSelectedNameEffectId,
    selectedNameFontId: resolvedSelectedNameFontId,
    setSelectedNameFontId,
    selectedNameSecondaryColorId: resolvedSelectedNameSecondaryColorId,
    setSelectedNameSecondaryColorId,
    selectedNameMotionId: resolvedSelectedNameMotionId,
    selectedNameFx: resolvedSelectedNameFx,
    setSelectedNameMotionId,
    setSelectedNameFx,
    selectedHoverTheme,
    setSelectedHoverTheme,
    selectedNameStyleClassName,
    selectedNameStyleInlineStyle,
    effectiveBg,
    effectiveCustomFrameUrl,
    effectivePosterFrameUrl,
    effectiveFrame,
    profileHeaderNameClassName,
    profileHeaderNameInlineStyle,
    profileLists,
    profileListsLoading,
  }
}
