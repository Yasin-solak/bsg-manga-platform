import { parseProfileTheme } from '@/lib/profileTheme'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import type { StoreItem } from '@/data/storeProducts'
import type { FansubBadge } from '@/services/badgeService'
import {
  getMyFansubBoostSupporterState,
  getPublicFansubBoostSnapshot,
  listActiveFansubBoostPlans,
  listPublicFansubBoostSupportersPreview,
  type FansubBoostPlan,
  type FansubBoostSnapshot,
  type FansubBoostSupporterPreview,
  type FansubBoostSupporterState,
  type PurchaseFansubBoostResult,
} from '@/services/fansubBoostService'
import {
  listFansubDonationActivity,
  type FansubDonationActivityItem,
} from '@/services/fansubService'
import { listPublicFansubPinnedNotices, type FansubPinnedNotice } from '@/services/fansubNoticeService'
import { isFeatureEnabled } from '@/services/featureFlagService'
import { resolveMyAccountStones } from '@/services/selfAccountEconomyService'
import { resolveFansubBackgroundAccess } from '@/lib/fansubBoostCapabilityGovernance'
import { toast } from '@/services/toastService'
import {
  buildFansubBackgroundLabel,
  validateFansubAvatarFile,
  validateFansubBackgroundFile,
} from './fansubEditForm'
import { loadFansubDetailSnapshot, loadFansubEditResources } from './fansubDetailLoader'
import {
  isDonationConfirmationInputValid,
  resolveBackgroundPreview,
  type FansubChapterRow,
} from './fansubDetailUtils'
import { reportFansubDetailError, warnFansubDetailIssue } from './fansubDetailErrors'
import { useFansubInteractionState } from './useFansubInteractionState'
import { useFansubDetailDerived } from './useFansubDetailDerived'
import { DEFAULT_FANSUB_NAME_FX, readFansubNameStyle, type FansubNameFx } from './fansubNameStyle'
import { useFansubDetailMutations } from './useFansubDetailMutations'
import type {
  ExtendedFansub,
  FansubEditDraft,
  FansubEditModalTab,
  FansubMangaShelfItem,
  FansubOwnedBackground,
  OwnedFrameInfo,
} from './types'
import { txa } from '@/i18n/activeLocale'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function useFansubDetailController() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentUser, isAdmin: isSiteAdmin, updateCurrentUser } = useAuth()
  const currentUserId = currentUser?.id ?? null
  const normalizedRouteFansubId = id?.trim() && UUID_PATTERN.test(id.trim()) ? id.trim() : null

  const [fansub, setFansub] = useState<ExtendedFansub | null>(null)
  const [fansubMangas, setFansubMangas] = useState<FansubMangaShelfItem[]>([])
  const [pendingOwnedMangaIds, setPendingOwnedMangaIds] = useState<string[]>([])
  const [chapters, setChapters] = useState<FansubChapterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editModalTab, setEditModalTab] = useState<FansubEditModalTab>('profil')
  const [editDraft, setEditDraft] = useState<FansubEditDraft>({ avatar: '', description: '', discordInviteUrl: '', slug: '', hoverTheme: null })
  const [equippedFrame, setEquippedFrame] = useState<string | null>(null)
  const [equippedBackground, setEquippedBackground] = useState<FansubOwnedBackground | null>(null)
  const [failedVideoUrls, setFailedVideoUrls] = useState<Set<string>>(new Set())
  const [frameItemIdsByType, setFrameItemIdsByType] = useState<Record<string, string>>({})
  const [ownedFrameInfos, setOwnedFrameInfos] = useState<OwnedFrameInfo[]>([])
  const [ownedProfileEffects, setOwnedProfileEffects] = useState<StoreItem[]>([])
  const [equippedProfileEffectId, setEquippedProfileEffectId] = useState<string | null | undefined>(undefined)
  const [ownedBadges, setOwnedBadges] = useState<FansubBadge[]>([])
  const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([])
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [isEditResourcesLoading, setIsEditResourcesLoading] = useState(false)
  const [editResourcesHydrated, setEditResourcesHydrated] = useState(false)
  const [avatarUploadFile, setAvatarUploadFile] = useState<File | null>(null)
  const [avatarSelectionLabel, setAvatarSelectionLabel] = useState<string | null>(null)
  const [backgroundUploadFile, setBackgroundUploadFile] = useState<File | null>(null)
  const [backgroundSelectionLabel, setBackgroundSelectionLabel] = useState<string | null>(null)
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null)
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number | null>(null)
  const [hasNameTextAccess, setHasNameTextAccess] = useState(false)
  const [selectedNameFontId, setSelectedNameFontId] = useState<NameTextFontId>(DEFAULT_NAME_TEXT_FONT_ID)
  const [selectedNameEffectId, setSelectedNameEffectId] = useState<NameTextEffectId>(DEFAULT_NAME_TEXT_EFFECT_ID)
  const [selectedNameColorId, setSelectedNameColorId] = useState<NameTextColorId>(DEFAULT_NAME_TEXT_COLOR_ID)
  const [selectedNameSecondaryColorId, setSelectedNameSecondaryColorId] = useState<NameTextColorId>(DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID)
  const [selectedNameColorSlot, setSelectedNameColorSlot] = useState<'primary' | 'secondary'>('primary')
  const [selectedNameFx, setSelectedNameFx] = useState<FansubNameFx>(DEFAULT_FANSUB_NAME_FX)
  const [isDonateDialogOpen, setIsDonateDialogOpen] = useState(false)
  const [donationAmountInput, setDonationAmountInput] = useState('100')
  const [donationNote, setDonationNote] = useState('')
  const [donationConfirmationInput, setDonationConfirmationInput] = useState('')
  const [isDonationSaving, setIsDonationSaving] = useState(false)

  // Boost state: loads in parallel, independent of the main page load
  const [isBoostEnabled, setIsBoostEnabled] = useState(false)
  const [boostPlans, setBoostPlans] = useState<FansubBoostPlan[]>([])
  const [boostSnapshot, setBoostSnapshot] = useState<FansubBoostSnapshot | null>(null)
  const [supporterState, setSupporterState] = useState<FansubBoostSupporterState | null>(null)
  const [supporterPreview, setSupporterPreview] = useState<FansubBoostSupporterPreview[]>([])
  const [recentDonationPreview, setRecentDonationPreview] = useState<FansubDonationActivityItem[]>([])
  const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false)
  const [pinnedNotices, setPinnedNotices] = useState<FansubPinnedNotice[]>([])

  const donationAmount = Math.floor(Number(donationAmountInput))
  const normalizedDonationAmount = Number.isFinite(donationAmount) ? donationAmount : 0
  const currentUserCoins = currentUser
    ? resolveMyAccountStones({
        userId: currentUser.id,
        fallbackStones: currentUser.stones ?? 0,
      })
    : 0
  const isDonationConfirmationValid = fansub
    ? isDonationConfirmationInputValid(donationConfirmationInput)
    : false
  const resolvedFansubId = fansub?.id || normalizedRouteFansubId
  const backgroundAccess = resolveFansubBackgroundAccess(boostSnapshot?.capabilities)

  const hasLoadedOnceRef = useRef(false)
  const lastLoadedFansubIdRef = useRef<string | null>(null)
  const pendingAvatarObjectUrlRef = useRef<string | null>(null)
  const pendingBackgroundObjectUrlRef = useRef<string | null>(null)
  const pendingBackgroundFallbackRef = useRef<FansubOwnedBackground | null>(null)

  const revokePendingAvatarPreview = () => {
    const previewUrl = pendingAvatarObjectUrlRef.current
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    pendingAvatarObjectUrlRef.current = null
  }

  const revokePendingBackgroundPreview = () => {
    const previewUrl = pendingBackgroundObjectUrlRef.current
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    pendingBackgroundObjectUrlRef.current = null
  }

  const resetPendingAvatarSelection = (nextAvatarUrl?: string) => {
    revokePendingAvatarPreview()
    setAvatarUploadFile(null)
    setAvatarSelectionLabel(null)
    setEditDraft((prev) => ({
      ...prev,
      avatar: nextAvatarUrl ?? fansub?.avatar ?? prev.avatar,
    }))
  }

  const resetPendingBackgroundSelection = (nextBackground?: FansubOwnedBackground | null) => {
    revokePendingBackgroundPreview()
    setBackgroundUploadFile(null)
    setBackgroundSelectionLabel(null)
    const resolvedBackground = nextBackground !== undefined ? nextBackground : pendingBackgroundFallbackRef.current
    setEquippedBackground(resolvedBackground ?? null)
    pendingBackgroundFallbackRef.current = resolvedBackground ?? null
  }

  const updateEditDraft = (patch: Partial<FansubEditDraft>) => {
    setEditDraft((prev) => ({ ...prev, ...patch }))
  }

  const goBackToFansubs = () => navigate('/fansublar')

  const refreshRecentDonationPreview = useCallback(async (targetFansubId?: string) => {
    if (!targetFansubId) {
      setRecentDonationPreview([])
      return
    }

    try {
      const donations = await listFansubDonationActivity(targetFansubId, {
        limit: 18,
        recentDays: 30,
      })
      setRecentDonationPreview(donations)
    } catch {
      setRecentDonationPreview([])
    }
  }, [])

  const {
    isFollowing,
    isFansubAdmin,
    setIsFansubAdmin,
    handleFollow,
  } = useFansubInteractionState({
    fansubId: resolvedFansubId,
    currentUserId,
    setFansub,
  })

  useEffect(() => () => {
    revokePendingAvatarPreview()
    revokePendingBackgroundPreview()
  }, [])

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      if (!id) return

      try {
        const hardLoad = !hasLoadedOnceRef.current || lastLoadedFansubIdRef.current !== id
        if (hardLoad) setLoading(true)
        setLoadError(null)
        setNotFound(false)
        setEquippedBackground(null)
        setEquippedFrame(null)
        setFailedVideoUrls(new Set())
        setEquippedProfileEffectId(undefined)
        setEditResourcesHydrated(false)
        setIsEditResourcesLoading(false)
        setFrameItemIdsByType({})
        setOwnedFrameInfos([])
        setOwnedProfileEffects([])
        setIsBoostEnabled(false)
        setBoostPlans([])
        setBoostSnapshot(null)
        setSupporterState(null)
        setSupporterPreview([])
        setRecentDonationPreview([])
        setIsBoostDialogOpen(false)
        setPinnedNotices([])

        const snapshot = await loadFansubDetailSnapshot({
          currentUserId,
          fansubRef: id,
          isSiteAdmin,
        })
        if (!isMounted) return

        if (snapshot.isNotFoundError) {
          setFansub(null)
          setIsFansubAdmin(false)
          setNotFound(true)
          setLoadError(txa('Fansub bulunamadı.'))
          return
        }

        setIsFansubAdmin(snapshot.isFansubAdmin)
        setHasNameTextAccess(snapshot.hasNameTextAccess)
        setSelectedNameFontId(snapshot.selectedNameFontId)
        setSelectedNameEffectId(snapshot.selectedNameEffectId)
        setSelectedNameColorId(snapshot.selectedNameColorId)
        setSelectedNameSecondaryColorId(snapshot.selectedNameSecondaryColorId)
        setSelectedNameFx(snapshot.selectedNameFx)
        setSelectedNameColorSlot('primary')
        setFansub(snapshot.fansub)
        setFansubMangas(snapshot.fansubMangas)
        setPendingOwnedMangaIds(snapshot.pendingOwnedMangaIds)
        setChapters(snapshot.chapters)
        setOwnedBadges(snapshot.ownedBadges)
        setSelectedBadgeIds(snapshot.selectedBadgeIds)
        hasLoadedOnceRef.current = true
        lastLoadedFansubIdRef.current = id

        if (snapshot.badgeLoadError) {
          warnFansubDetailIssue(
            'load-fansub-badges',
            'fansub rozetleri yuklenemedi.',
            snapshot.badgeLoadError,
            { fansubId: id, currentUserId: currentUserId || null },
          )
        }

        // Load boost data in parallel without blocking
        void (async () => {
          try {
            const boostEnabled = await isFeatureEnabled('boost.system')
            if (!isMounted) return
            setIsBoostEnabled(boostEnabled)
            if (!boostEnabled) {
              setBoostSnapshot(null)
              setSupporterState(null)
              setSupporterPreview([])
              setRecentDonationPreview([])
              setPinnedNotices([])
              return
            }

            const boostFansubId = snapshot.fansub.id
            const results = await Promise.allSettled([
              listActiveFansubBoostPlans(),
              getPublicFansubBoostSnapshot(boostFansubId),
              listPublicFansubBoostSupportersPreview(boostFansubId, 6),
              listFansubDonationActivity(boostFansubId, { limit: 18, recentDays: 30 }),
              ...(currentUserId ? [getMyFansubBoostSupporterState(boostFansubId)] : []),
            ])
            if (!isMounted) return

            if (results[0]?.status === 'fulfilled') setBoostPlans(results[0].value)
            if (results[1]?.status === 'fulfilled') {
              const nextBoostSnapshot = results[1].value
              setBoostSnapshot(nextBoostSnapshot)
              setHasNameTextAccess(nextBoostSnapshot?.capabilities?.hasFullNameStyle === true)
              if (nextBoostSnapshot?.capabilities?.canManagePinnedNotice === true) {
                void listPublicFansubPinnedNotices(boostFansubId)
                  .then((notices) => {
                    if (!isMounted) return
                    setPinnedNotices(notices)
                  })
                  .catch(() => {
                    if (!isMounted) return
                    setPinnedNotices([])
                  })
              } else {
                setPinnedNotices([])
              }
            } else {
              setHasNameTextAccess(false)
              setPinnedNotices([])
            }
            if (results[2]?.status === 'fulfilled') setSupporterPreview(results[2].value)
            if (results[3]?.status === 'fulfilled') {
              setRecentDonationPreview(results[3].value)
            } else {
              setRecentDonationPreview([])
            }
            if (currentUserId && results[4]?.status === 'fulfilled') {
              setSupporterState(results[4].value as FansubBoostSupporterState | null)
            } else if (!currentUserId) {
              setSupporterState(null)
            }
          } catch {
            // Boost hatasi ana sayfayi kirmaz — sessiz gec
          }
        })()
      } catch (error) {
        if (!isMounted) return
        const reportedError = reportFansubDetailError(
          'load-fansub-detail',
          error,
          txa('Fansub detayları yüklenirken bir hata oluştu.'),
          { fansubId: id, currentUserId: currentUserId || null },
        )
        setLoadError(reportedError.userMessage)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void load()
    return () => {
      isMounted = false
    }
  }, [id, currentUserId, isSiteAdmin])

  useEffect(() => {
    const currentRef = (id || '').trim()
    const canonicalSlug = (fansub?.slug || '').trim()
    if (!currentRef || !canonicalSlug) return
    if (!UUID_PATTERN.test(currentRef)) return
    if (currentRef === canonicalSlug) return
    navigate(`/fansub/${encodeURIComponent(canonicalSlug)}`, { replace: true })
  }, [fansub?.slug, id, navigate])

  const {
    members,
    canSeePending,
    rawFrame,
    effectiveFrame,
    effectiveCustomFrameUrl,
    effectivePosterFrameUrl,
    effectiveBg,
    effectiveProfileEffectId,
    activeProfileEffectAssets,
    sortedMangas,
    chapterPreviews,
    resolvedSelectedNameFontId,
    resolvedSelectedNameEffectId,
    resolvedSelectedNameColorId,
    resolvedSelectedNameSecondaryColorId,
    selectedNameStyleClassName,
    selectedNameStyleInlineStyle,
    fansubHeaderNameClassName,
    fansubHeaderNameInlineStyle,
  } = useFansubDetailDerived({
    fansub,
    isSiteAdmin,
    isFansubAdmin,
    pendingOwnedMangaIds,
    equippedFrame,
    ownedFrameInfos,
    equippedBackground,
    equippedProfileEffectId,
    ownedProfileEffects,
    boostCapabilities: boostSnapshot?.capabilities,
    boostCapabilityResolutionState: boostSnapshot ? 'resolved' : 'unknown',
    chapters,
    fansubMangas,
    selectedNameFontId,
    selectedNameEffectId,
    selectedNameColorId,
    selectedNameSecondaryColorId,
    selectedNameFx,
  })

  const markVideoFailed = (url?: string) => {
    if (!url) return
    setFailedVideoUrls((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }

  const openEdit = async () => {
    if (!fansub) return
    if (isEditResourcesLoading) return

    if (!editResourcesHydrated) {
      try {
        setIsEditResourcesLoading(true)
        const resources = await loadFansubEditResources(
          fansub.id,
          fansub.activeProfileEffectId,
          hasNameTextAccess,
        )
        setFrameItemIdsByType(resources.frameItemIdsByType)
        setOwnedFrameInfos(resources.ownedFrameInfos)
        setOwnedProfileEffects(resources.ownedProfileEffects)
        setHasNameTextAccess(resources.hasNameTextAccess)
        setFansub((prev) => (
          prev
            ? {
                ...prev,
                ownedBackgrounds: resources.ownedBackgrounds,
                ownedFrames: resources.ownedFrames,
              }
            : prev
        ))
        setEditResourcesHydrated(true)
      } catch (error) {
        const reportedError = reportFansubDetailError(
          'load-fansub-edit-resources',
          error,
          txa('Fansub düzenleme verileri hazırlanırken bir hata oluştu.'),
          { fansubId: fansub.id, currentUserId: currentUserId || null },
        )
        toast.error(reportedError.userMessage)
        return
      } finally {
        setIsEditResourcesLoading(false)
      }
    }

    pendingBackgroundFallbackRef.current = effectiveBg
    resetPendingAvatarSelection(fansub.avatar)
    revokePendingBackgroundPreview()
    setBackgroundUploadFile(null)
    setBackgroundSelectionLabel(null)
    setUploadProgressLabel(null)
    setUploadProgressPercent(null)
    setEquippedBackground(null)
    setEditDraft({
      avatar: fansub.avatar,
      description: fansub.description ?? '',
      discordInviteUrl: fansub.discordInviteUrl ?? '',
      slug: fansub.slug ?? '',
      hoverTheme: parseProfileTheme(fansub.hoverTheme),
    })
    const nameState = readFansubNameStyle(fansub.activeNameStyle)
    setSelectedNameFontId(nameState.fontId)
    setSelectedNameEffectId(nameState.effectId)
    setSelectedNameColorId(nameState.colorId)
    setSelectedNameSecondaryColorId(nameState.secondaryColorId)
    setSelectedNameFx(nameState.fx)
    setSelectedNameColorSlot('primary')
    setEditModalTab('profil')
    setIsEditOpen(true)
  }

  const closeEdit = () => {
    if (isEditSaving) return
    resetPendingAvatarSelection(fansub?.avatar)
    resetPendingBackgroundSelection(null)
    setUploadProgressLabel(null)
    setUploadProgressPercent(null)
    setEquippedFrame(null)
    setEquippedProfileEffectId(undefined)
    setIsEditOpen(false)
  }

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      validateFansubAvatarFile(file)
      revokePendingAvatarPreview()
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
      validateFansubBackgroundFile(file)
      const isVideoUpload = file.type.startsWith('video/')
      if (isVideoUpload && !backgroundAccess.canUseVideoBackground) {
        throw new Error(txa('Video arka plan bu yerleşimde kapalı.'))
      }
      if (!isVideoUpload && !backgroundAccess.canUseStaticBackground) {
        throw new Error(txa('Statik arka plan bu yerleşimde kapalı.'))
      }
      const fallbackBackground = pendingBackgroundFallbackRef.current ?? effectiveBg
      resetPendingBackgroundSelection()
      pendingBackgroundFallbackRef.current = fallbackBackground ?? null
      const previewUrl = URL.createObjectURL(file)
      const preview = resolveBackgroundPreview(previewUrl)
      const nextBackground: FansubOwnedBackground = {
        id: previewUrl,
        background: preview.style,
        label: buildFansubBackgroundLabel(file.name),
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
        origin: 'upload',
        posterBackground: preview.style,
        slotIndex: 0,
        videoUrl: preview.videoUrl,
      }
      pendingBackgroundObjectUrlRef.current = previewUrl
      setBackgroundUploadFile(file)
      setBackgroundSelectionLabel(file.name)
      setEquippedBackground(nextBackground)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : txa('Arka plan seçilemedi.'))
    }

    event.target.value = ''
  }

  const selectEquippedBackground = (background: FansubOwnedBackground) => {
    resetPendingBackgroundSelection(background)
  }

  const resetBackgroundSelection = () => {
    resetPendingBackgroundSelection(null)
  }

  const { saveEdit, openDonateDialog, handleDonateSubmit } = useFansubDetailMutations({
    fansub,
    currentUser,
    currentUserCoins,
    isEditSaving,
    avatarUploadFile,
    backgroundUploadFile,
    editDraft,
    frameItemIdsByType,
    equippedFrame,
    equippedBackground,
    equippedProfileEffectId,
    hasNameTextAccess,
    hasVanityUrlAccess: boostSnapshot?.capabilities?.hasVanityUrl === true,
    hasHoverThemeAccess: boostSnapshot?.capabilities?.canUseHoverTheme === true,
    resolvedSelectedNameFontId,
    resolvedSelectedNameEffectId,
    resolvedSelectedNameColorId,
    resolvedSelectedNameSecondaryColorId,
    selectedNameFx,
    selectedBadgeIds,
    donationAmount: normalizedDonationAmount,
    donationNote,
    donationConfirmationInput,
    updateCurrentUser,
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
    setFansub,
    setOwnedBadges,
    setEditDraft,
    setSelectedNameFontId,
    setSelectedNameEffectId,
    setSelectedNameColorId,
    setSelectedNameSecondaryColorId,
    setSelectedNameColorSlot,
    setSelectedNameFx,
    setEquippedFrame,
    setEquippedBackground,
    setEquippedProfileEffectId,
    setIsEditOpen,
    setIsEditSaving,
    setUploadProgressLabel,
    setUploadProgressPercent,
    setDonationAmountInput,
    setDonationNote,
    setDonationConfirmationInput,
    setIsDonateDialogOpen,
    setIsDonationSaving,
    onDonationSuccess: refreshRecentDonationPreview,
  })

  // Boost purchase success handler: local state merge + reload supporter preview
  const handleBoostPurchaseSuccess = useCallback((result: PurchaseFansubBoostResult) => {
    const refreshFansubId = result.snapshot?.fansubId || fansub?.id || resolvedFansubId
    if (result.snapshot) setBoostSnapshot(result.snapshot)
    if (result.supporterState) setSupporterState(result.supporterState)
    if (result.snapshot?.capabilities?.canManagePinnedNotice === true && refreshFansubId) {
      void listPublicFansubPinnedNotices(refreshFansubId)
        .then((notices) => setPinnedNotices(notices))
        .catch(() => setPinnedNotices([]))
    } else {
      setPinnedNotices([])
    }
    // The supporterPreview from the purchase result depends on tier level, so it can
    // always fall short. Reloading gets the current list,
    // so supporters show even at tier 0.
    if (result.supporterPreview && result.supporterPreview.length > 0) {
      setSupporterPreview(result.supporterPreview)
    }
    // Reload the supporter preview list from the backend (tier independent)
    if (refreshFansubId) {
      void listPublicFansubBoostSupportersPreview(refreshFansubId, 6)
        .then((freshPreview) => setSupporterPreview(freshPreview))
        .catch(() => { /* supporter preview yenileme hatasi sessizce gecilir */ })
    }
    updateCurrentUser({ stones: result.newUserStones })
    toast.success(txa('{v1} ile takviye verildi! ⚡', { v1: result.planName }))
    setIsBoostDialogOpen(false)
  }, [fansub?.id, resolvedFansubId, updateCurrentUser])

  return {
    id,
    fansub,
    loading,
    loadError,
    notFound,
    isFansubAdmin,
    isFollowing,
    members,
    canSeePending,
    chapterPreviews,
    sortedMangas,
    ownedBadges,
    effectiveBg,
    effectiveCustomFrameUrl,
    effectivePosterFrameUrl,
    effectiveFrame,
    activeProfileEffectAssets,
    fansubHeaderNameClassName,
    fansubHeaderNameInlineStyle,
    openEdit,
    handleFollow,
    openDonateDialog,
    isEditOpen,
    avatarSelectionLabel,
    avatarUploadFile,
    backgroundSelectionLabel,
    backgroundUploadFile,
    uploadProgressLabel,
    uploadProgressPercent,
    effectiveProfileEffectId,
    editDraft,
    editModalTab,
    failedVideoUrls,
    hasNameTextAccess,
    handleAvatarFile,
    handleBackgroundFile,
    markVideoFailed,
    closeEdit,
    saveEdit,
    isEditSaving,
    isEditResourcesLoading,
    ownedProfileEffects,
    ownedFrameInfos,
    rawFrame,
    selectedBadgeIds,
    resolvedSelectedNameColorId,
    resolvedSelectedNameEffectId,
    resolvedSelectedNameFontId,
    resolvedSelectedNameSecondaryColorId,
    selectedNameColorSlot,
    selectedNameFx,
    selectedNameStyleClassName,
    selectedNameStyleInlineStyle,
    hasVanityUrlAccess: boostSnapshot?.capabilities?.hasVanityUrl === true,
    hasHoverThemeAccess: boostSnapshot?.capabilities?.canUseHoverTheme === true,
    setEditModalTab,
    setEquippedBackground: selectEquippedBackground,
    setEquippedFrame,
    setEquippedProfileEffectId,
    setSelectedBadgeIds,
    setSelectedNameColorId,
    setSelectedNameColorSlot,
    setSelectedNameEffectId,
    setSelectedNameFontId,
    setSelectedNameSecondaryColorId,
    setSelectedNameFx,
    updateEditDraft,
    resetAvatarSelection: () => resetPendingAvatarSelection(fansub?.avatar),
    resetBackgroundSelection,
    isDonateDialogOpen,
    isDonationSaving,
    currentUserCoins,
    donationAmountInput,
    donationNote,
    donationConfirmationInput,
    isDonationConfirmationValid,
    normalizedDonationAmount,
    setDonationAmountInput,
    setDonationNote,
    setDonationConfirmationInput,
    setIsDonateDialogOpen,
    handleDonateSubmit,
    goBackToFansubs,
    // Boost
    isBoostEnabled,
    boostPlans,
    boostSnapshot,
    supporterState,
    supporterPreview,
    recentDonationPreview,
    pinnedNotices,
    isBoostDialogOpen,
    setIsBoostDialogOpen,
    handleBoostPurchaseSuccess,
  }
}
