import type { FansubNameFx } from './fansubNameStyle'
import type { ProfileTheme } from '@/lib/profileTheme'
import { useCallback, type Dispatch, type SetStateAction } from 'react'

import {
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import type { FansubBadge } from '@/services/badgeService'
import { donateToFansub } from '@/services/fansubService'
import { toast } from '@/services/toastService'

import {
  normalizeFansubDiscordInviteUrl,
  normalizeFansubVanitySlug,
  sanitizeFansubDescription,
} from './fansubEditForm'
import { buildFansubVanityUrlLockedMessage, isFansubVanityUrlChangeLocked } from '@/lib/fansubVanityUrl'
import { reportFansubDetailError } from './fansubDetailErrors'
import {
  applyFansubEditSuccess,
  applyFansubEditUiState,
  applyFansubDonationSuccess,
  buildUploadedFansubBackgroundSelection,
  openFansubDonateDialog,
  persistFansubEditRequest,
  resolveFansubInventorySelection,
  validateFansubDonationSubmission,
} from './fansubDetailMutationHelpers'
import type { ExtendedFansub, FansubOwnedBackground } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface UseFansubDetailMutationsOptions {
  fansub: ExtendedFansub | null
  currentUser: { id?: string | null; stones?: number } | null
  currentUserCoins: number
  isEditSaving: boolean
  avatarUploadFile: File | null
  backgroundUploadFile: File | null
  editDraft: {
    avatar: string
    description: string
    discordInviteUrl: string
    slug: string
    hoverTheme: ProfileTheme | null
  }
  frameItemIdsByType: Record<string, string>
  equippedFrame: string | null
  equippedBackground: FansubOwnedBackground | null
  equippedProfileEffectId: string | null | undefined
  hasNameTextAccess: boolean
  hasVanityUrlAccess: boolean
  hasHoverThemeAccess: boolean
  resolvedSelectedNameFontId: NameTextFontId
  resolvedSelectedNameEffectId: NameTextEffectId
  resolvedSelectedNameColorId: NameTextColorId
  resolvedSelectedNameSecondaryColorId: NameTextColorId
  selectedNameFx: FansubNameFx
  selectedBadgeIds: string[]
  donationAmount: number
  donationNote: string
  donationConfirmationInput: string
  updateCurrentUser: (patch: { stones: number }) => void
  resetPendingAvatarSelection: (nextAvatarUrl?: string) => void
  resetPendingBackgroundSelection: (nextBackground?: FansubOwnedBackground | null) => void
  setFansub: Dispatch<SetStateAction<ExtendedFansub | null>>
  setOwnedBadges: Dispatch<SetStateAction<FansubBadge[]>>
  setEditDraft: Dispatch<
    SetStateAction<{
      avatar: string
      description: string
      discordInviteUrl: string
      slug: string
      hoverTheme: ProfileTheme | null
    }>
  >
  setSelectedNameFontId: (value: NameTextFontId) => void
  setSelectedNameEffectId: (value: NameTextEffectId) => void
  setSelectedNameColorId: (value: NameTextColorId) => void
  setSelectedNameSecondaryColorId: (value: NameTextColorId) => void
  setSelectedNameColorSlot: (value: 'primary' | 'secondary') => void
  setSelectedNameFx: (value: FansubNameFx) => void
  setEquippedFrame: (value: string | null) => void
  setEquippedBackground: (value: FansubOwnedBackground | null) => void
  setEquippedProfileEffectId: (value: string | null | undefined) => void
  setIsEditOpen: (value: boolean) => void
  setIsEditSaving: (value: boolean) => void
  setUploadProgressLabel: (value: string | null) => void
  setUploadProgressPercent: (value: number | null) => void
  setDonationAmountInput: (value: string) => void
  setDonationNote: (value: string) => void
  setDonationConfirmationInput: (value: string) => void
  setIsDonateDialogOpen: (value: boolean) => void
  setIsDonationSaving: (value: boolean) => void
  onDonationSuccess?: (fansubId: string) => void | Promise<void>
}

export function useFansubDetailMutations({
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
  hasVanityUrlAccess,
  hasHoverThemeAccess,
  resolvedSelectedNameFontId,
  resolvedSelectedNameEffectId,
  resolvedSelectedNameColorId,
  resolvedSelectedNameSecondaryColorId,
  selectedNameFx,
  selectedBadgeIds,
  donationAmount,
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
  onDonationSuccess,
}: UseFansubDetailMutationsOptions) {
  const openDonateDialog = useCallback(() => {
    const opened = openFansubDonateDialog({
      currentUserId: currentUser?.id,
      setDonationAmountInput,
      setDonationNote,
      setDonationConfirmationInput,
      setIsDonateDialogOpen,
    })
    if (!opened) {
      toast.info(txa('Bağış yapmak için giriş yapmalısın.'))
    }
  }, [currentUser?.id, setDonationAmountInput, setDonationConfirmationInput, setDonationNote, setIsDonateDialogOpen])

  const saveEdit = useCallback(async () => {
    if (!fansub || isEditSaving) return

    const normalizedDescription = sanitizeFansubDescription(editDraft.description)
    const normalizedDiscordInviteUrl = normalizeFansubDiscordInviteUrl(editDraft.discordInviteUrl)
    const normalizedSlug = normalizeFansubVanitySlug(
      hasVanityUrlAccess ? editDraft.slug : fansub.slug || '',
      fansub.slug,
    )
    // Without boost permission the current theme is kept; the RPC side also validates by capability.
    const nextHoverTheme = hasHoverThemeAccess ? (editDraft.hoverTheme ?? null) : (fansub.hoverTheme ?? null)

    if (hasVanityUrlAccess && isFansubVanityUrlChangeLocked(fansub.slug, normalizedSlug, fansub.vanitySlugChangedAt)) {
      toast.warning(buildFansubVanityUrlLockedMessage(fansub.vanitySlugChangedAt))
      return
    }

    const { patch, inventoryTasks, frameWarn } = resolveFansubInventorySelection({
      fansubId: fansub.id,
      currentActiveProfileEffectId: fansub.activeProfileEffectId,
      equippedFrame,
      equippedBackground,
      equippedProfileEffectId,
      frameItemIdsByType,
    })

    try {
      setIsEditSaving(true)
      setUploadProgressLabel(null)
      setUploadProgressPercent(null)
      const {
        nextAvatarUrl,
        nextBackgroundRef,
        nextBackgroundPreviewUrl,
        normalizedDiscordInviteUrl: persistedDiscordInviteUrl,
        nextActiveNameStyle,
        upsertedFansubData,
      } = await persistFansubEditRequest({
        fansub,
        avatarUploadFile,
        backgroundUploadFile,
        selectedBackground: equippedBackground,
        editAvatar: editDraft.avatar,
        normalizedDescription,
        normalizedDiscordInviteUrl,
        normalizedSlug,
        hasNameTextAccess,
        nextHoverTheme,
        resolvedSelectedNameFontId,
        resolvedSelectedNameEffectId,
        resolvedSelectedNameColorId,
        resolvedSelectedNameSecondaryColorId,
        selectedNameFx,
        selectedBadgeIds,
        inventoryTasks,
        onUploadProgress: (label, progress) => {
          setUploadProgressLabel(label)
          setUploadProgressPercent(progress)
        },
      })

      const nextEquippedBackground = backgroundUploadFile && nextBackgroundRef
        ? buildUploadedFansubBackgroundSelection(
            nextBackgroundRef,
            backgroundUploadFile.name,
            backgroundUploadFile.type,
            Date.now(),
          )
        : equippedBackground?.origin === 'upload' && nextBackgroundRef
          ? {
              ...equippedBackground,
              assetRef: nextBackgroundRef,
              id: nextBackgroundRef,
            }
          : equippedBackground

      applyFansubEditSuccess({
        patch,
        upsertedFansubData,
        nextAvatarUrl,
        nextEquippedBackground,
        nextBackgroundPreviewUrl,
        normalizedDescription,
        normalizedDiscordInviteUrl: persistedDiscordInviteUrl,
        normalizedSlug,
        nextActiveNameStyle,
        selectedBadgeIds,
        setFansub,
        setOwnedBadges,
      })
      applyFansubEditUiState({
        nextAvatarUrl,
        nextEquippedBackground,
        normalizedDescription,
        nextHoverTheme,
        normalizedDiscordInviteUrl: persistedDiscordInviteUrl,
        normalizedSlug,
        nextActiveNameStyle,
        resetPendingAvatarSelection,
        resetPendingBackgroundSelection,
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
      })
      toast.success(txa('Fansub güncellendi.'))
      if (frameWarn) toast.warning(txa('Çerçeve envanter kaydı bulunamadı.'))
    } catch (error) {
      const reportedError = reportFansubDetailError(
        'save-fansub-edit',
        error,
        txa('Fansub kaydedilirken bir hata oluştu.'),
        { fansubId: fansub.id },
      )
      toast.error(reportedError.userMessage)
    } finally {
      setIsEditSaving(false)
      setUploadProgressLabel(null)
      setUploadProgressPercent(null)
    }
  }, [
    avatarUploadFile,
    backgroundUploadFile,
    editDraft.avatar,
    editDraft.description,
    editDraft.discordInviteUrl,
    editDraft.slug,
    editDraft.hoverTheme,
    equippedBackground,
    equippedFrame,
    equippedProfileEffectId,
    fansub,
    frameItemIdsByType,
    hasVanityUrlAccess,
    hasNameTextAccess,
    hasHoverThemeAccess,
    isEditSaving,
    resetPendingAvatarSelection,
    resetPendingBackgroundSelection,
    selectedBadgeIds,
    setEditDraft,
    setEquippedBackground,
    setEquippedFrame,
    setEquippedProfileEffectId,
    setFansub,
    setIsEditOpen,
    setIsEditSaving,
    setOwnedBadges,
    setSelectedNameColorId,
    setSelectedNameColorSlot,
    setSelectedNameEffectId,
    setSelectedNameFontId,
    setSelectedNameSecondaryColorId,
    setUploadProgressLabel,
    setUploadProgressPercent,
  ])

  const handleDonateSubmit = useCallback(async () => {
    if (!fansub) return

    const donationValidationError = validateFansubDonationSubmission({
      currentUserId: currentUser?.id,
      donationAmount,
      currentUserCoins,
      donationConfirmationInput,
    })
    if (donationValidationError) {
      toast.warning(donationValidationError)
      return
    }

    try {
      setIsDonationSaving(true)
      const result = await donateToFansub(
        fansub.id,
        donationAmount,
        donationNote,
        donationConfirmationInput,
      )

      applyFansubDonationSuccess({
        newFansubBalance: result.newFansubBalance,
        newUserBalance: result.newUserBalance,
        updateCurrentUser,
        setFansub,
        setIsDonateDialogOpen,
      })
      void onDonationSuccess?.(fansub.id)

      toast.success(txa('{v1} coin bağış yapıldı.', { v1: result.amount.toLocaleString(intlLocale()) }))
    } catch (error) {
      const reportedError = reportFansubDetailError(
        'submit-fansub-donation',
        error,
        txa('Bağış işlemi başarısız oldu.'),
        { fansubId: fansub.id, currentUserId: currentUser?.id || null, amount: donationAmount },
      )
      toast.error(reportedError.userMessage)
    } finally {
      setIsDonationSaving(false)
    }
  }, [
    currentUser?.id,
    currentUserCoins,
    donationAmount,
    donationConfirmationInput,
    donationNote,
    fansub,
    setFansub,
    setIsDonateDialogOpen,
    setIsDonationSaving,
    onDonationSuccess,
    updateCurrentUser,
  ])

  return {
    openDonateDialog,
    saveEdit,
    handleDonateSubmit,
  }
}
