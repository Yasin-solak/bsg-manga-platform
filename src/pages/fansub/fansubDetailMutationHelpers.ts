import { buildFansubActiveNameStyle, readFansubNameStyle, type FansubNameFx } from './fansubNameStyle'
import { parseProfileTheme, type ProfileTheme } from '@/lib/profileTheme'
import type { Dispatch, SetStateAction } from 'react'

import type { FrameType } from '@components/common/AvatarFrame'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import {
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import { updateFansubDisplayedBadges, type FansubBadge } from '@/services/badgeService'
import { equipPurchasedItem, uploadAvatar, uploadProfileBackground, upsertFansub } from '@/services/fansubService'

import { buildFansubBackgroundLabel } from './fansubEditForm'
import { isDonationConfirmationInputValid, resolveBackgroundPreview } from './fansubDetailUtils'
import type { ExtendedFansub, FansubOwnedBackground } from './types'
import { txa } from '@/i18n/activeLocale'

interface ResolveFansubInventorySelectionOptions {
  fansubId: string
  currentActiveProfileEffectId: string | null | undefined
  equippedFrame: string | null
  equippedBackground: FansubOwnedBackground | null
  equippedProfileEffectId: string | null | undefined
  frameItemIdsByType: Record<string, string>
}

interface ResolvedFansubInventorySelection {
  patch: Partial<ExtendedFansub>
  inventoryTasks: Promise<unknown>[]
  frameWarn: boolean
}

interface ApplyFansubEditSuccessOptions {
  patch: Partial<ExtendedFansub>
  upsertedFansubData: Partial<ExtendedFansub>
  nextAvatarUrl: string
  nextEquippedBackground: FansubOwnedBackground | null
  nextBackgroundPreviewUrl?: string
  normalizedDescription: string
  normalizedDiscordInviteUrl?: string
  normalizedSlug: string
  nextActiveNameStyle: ReturnType<typeof buildFansubActiveNameStyle> | ExtendedFansub['activeNameStyle']
  selectedBadgeIds: string[]
  setFansub: Dispatch<SetStateAction<ExtendedFansub | null>>
  setOwnedBadges: Dispatch<SetStateAction<FansubBadge[]>>
}

interface ValidateFansubDonationOptions {
  currentUserId?: string | null
  donationAmount: number
  currentUserCoins: number
  donationConfirmationInput: string
}

interface PersistFansubEditRequestOptions {
  fansub: ExtendedFansub
  avatarUploadFile: File | null
  backgroundUploadFile: File | null
  selectedBackground: FansubOwnedBackground | null
  editAvatar: string
  normalizedDescription: string
  normalizedDiscordInviteUrl?: string
  normalizedSlug: string
  hasNameTextAccess: boolean
  nextHoverTheme: ExtendedFansub['hoverTheme'] | null
  resolvedSelectedNameFontId: NameTextFontId
  resolvedSelectedNameEffectId: NameTextEffectId
  resolvedSelectedNameColorId: NameTextColorId
  resolvedSelectedNameSecondaryColorId: NameTextColorId
  selectedNameFx: FansubNameFx
  selectedBadgeIds: string[]
  inventoryTasks: Promise<unknown>[]
  onUploadProgress?: (label: string, progress: number) => void
}

interface PersistedFansubEditRequestResult {
  nextAvatarUrl: string
  nextBackgroundRef: string | null
  nextBackgroundPreviewUrl?: string
  normalizedDiscordInviteUrl?: string
  nextActiveNameStyle: ReturnType<typeof buildFansubActiveNameStyle> | ExtendedFansub['activeNameStyle']
  upsertedFansubData: Partial<ExtendedFansub>
}

interface ApplyFansubDonationSuccessOptions {
  newFansubBalance: number
  newUserBalance: number
  updateCurrentUser: (patch: { stones: number }) => void
  setFansub: Dispatch<SetStateAction<ExtendedFansub | null>>
  setIsDonateDialogOpen: (value: boolean) => void
}

interface OpenFansubDonateDialogOptions {
  currentUserId?: string | null
  setDonationAmountInput: (value: string) => void
  setDonationNote: (value: string) => void
  setDonationConfirmationInput: (value: string) => void
  setIsDonateDialogOpen: (value: boolean) => void
}

interface ApplyFansubEditUiStateOptions {
  nextAvatarUrl: string
  nextEquippedBackground: FansubOwnedBackground | null
  normalizedDescription: string
  normalizedDiscordInviteUrl?: string
  normalizedSlug: string
  nextHoverTheme: ExtendedFansub['hoverTheme'] | null
  nextActiveNameStyle: {
    version: 1
    fontId: NameTextFontId
    effectId: NameTextEffectId
    colorId: NameTextColorId
    secondaryColorId: NameTextColorId
  } | ExtendedFansub['activeNameStyle']
  resetPendingAvatarSelection: (nextAvatarUrl?: string) => void
  resetPendingBackgroundSelection: (nextBackground?: FansubOwnedBackground | null) => void
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
}

export function resolveFansubInventorySelection({
  fansubId,
  currentActiveProfileEffectId,
  equippedFrame,
  equippedBackground,
  equippedProfileEffectId,
  frameItemIdsByType,
}: ResolveFansubInventorySelectionOptions): ResolvedFansubInventorySelection {
  const patch: Partial<ExtendedFansub> = {}
  const inventoryTasks: Promise<unknown>[] = []
  let frameWarn = false

  if (equippedFrame) {
    const frameItemId = frameItemIdsByType[equippedFrame]
    if (frameItemId) {
      inventoryTasks.push(equipPurchasedItem(fansubId, frameItemId, 'frame'))
      patch.activeFrameId = frameItemId
      patch.frameType = equippedFrame as FrameType
    } else {
      frameWarn = true
    }
  }

  if (equippedBackground?.id && equippedBackground.origin !== 'upload') {
    inventoryTasks.push(equipPurchasedItem(fansubId, equippedBackground.id, 'background'))
  }

  if (
    equippedProfileEffectId !== undefined &&
    equippedProfileEffectId &&
    equippedProfileEffectId !== currentActiveProfileEffectId
  ) {
    inventoryTasks.push(equipPurchasedItem(fansubId, equippedProfileEffectId, 'profile_effect'))
    patch.activeProfileEffectId = equippedProfileEffectId
  }

  return {
    patch,
    inventoryTasks,
    frameWarn,
  }
}

export function applyFansubEditSuccess({
  patch,
  upsertedFansubData,
  nextAvatarUrl,
  nextEquippedBackground,
  nextBackgroundPreviewUrl,
  normalizedDescription,
  normalizedDiscordInviteUrl,
  normalizedSlug,
  nextActiveNameStyle,
  selectedBadgeIds,
  setFansub,
  setOwnedBadges,
}: ApplyFansubEditSuccessOptions) {
  setFansub((previous) => {
    if (!previous) return previous
    const nextOwnedBackgrounds = nextEquippedBackground?.origin === 'upload'
      ? [
          nextEquippedBackground,
          ...(previous.ownedBackgrounds || []).filter((background) => background.id !== nextEquippedBackground.id),
        ]
      : previous.ownedBackgrounds

    return {
      ...previous,
      ...upsertedFansubData,
      ...patch,
      activeNameStyle: nextActiveNameStyle,
      avatar: nextAvatarUrl,
      customBackgroundPreviewUrl: nextBackgroundPreviewUrl,
      description: normalizedDescription || undefined,
      discordInviteUrl: normalizedDiscordInviteUrl,
      slug: normalizedSlug,
      ownedBackgrounds: nextOwnedBackgrounds,
    }
  })

  setOwnedBadges((previous) =>
    previous.map((badge) => {
      const displayOrder = selectedBadgeIds.indexOf(badge.badge_id)
      return {
        ...badge,
        display_order: displayOrder === -1 ? badge.display_order : displayOrder,
        is_displayed: displayOrder !== -1,
      }
    }),
  )
}

export function validateFansubDonationSubmission({
  currentUserId,
  donationAmount,
  currentUserCoins,
  donationConfirmationInput,
}: ValidateFansubDonationOptions): string | null {
  if (!currentUserId) return txa('Bağış yapmak için giriş yapmalısın.')
  if (donationAmount <= 0) return txa('Bağış tutarı sıfırdan büyük olmalıdır.')
  if (donationAmount > 100000) return txa('Tek seferde en fazla 100000 coin bağış yapabilirsiniz.')
  if (currentUserCoins < donationAmount) return txa('Yetersiz coin bakiyesi.')
  if (!isDonationConfirmationInputValid(donationConfirmationInput)) return txa('Bağış onayı için sadece ONAYLIYORUM yazmalısın.')
  return null
}

export async function persistFansubEditRequest({
  fansub,
  avatarUploadFile,
  backgroundUploadFile,
  selectedBackground,
  editAvatar,
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
  onUploadProgress,
}: PersistFansubEditRequestOptions): Promise<PersistedFansubEditRequestResult> {
  const uploadLabels = [
    avatarUploadFile ? txa('Avatar yükleniyor') : null,
    backgroundUploadFile ? txa('Arka plan yükleniyor') : null,
  ].filter(Boolean) as string[]
  const createUploadProgressHandler = (stepIndex: number, label: string) => (fileProgress: number) => {
    if (!onUploadProgress || uploadLabels.length === 0) return
    const segmentSize = 100 / uploadLabels.length
    const segmentStart = segmentSize * stepIndex
    const normalizedFileProgress = Math.max(0, Math.min(100, fileProgress))
    const overallProgress = Math.round(segmentStart + (segmentSize * normalizedFileProgress) / 100)
    onUploadProgress(label, overallProgress)
  }

  const nextAvatarUrl = avatarUploadFile
    ? await uploadAvatar(
        avatarUploadFile,
        fansub.id,
        createUploadProgressHandler(uploadLabels.findIndex((item) => item === 'Avatar yukleniyor'), txa('Avatar yükleniyor')),
      )
    : (editAvatar || fansub.avatar)
  let nextBackgroundRef = selectedBackground?.origin === 'upload'
    ? (selectedBackground.assetRef || null)
    : null
  let nextBackgroundPreviewUrl = selectedBackground?.origin === 'upload'
    ? fansub.customBackgroundPreviewUrl
    : undefined

  // Name style v2 (including motion / fill / effect color); without permission the saved style is kept.
  const nextActiveNameStyle = hasNameTextAccess
    ? buildFansubActiveNameStyle({
        fontId: resolvedSelectedNameFontId,
        effectId: resolvedSelectedNameEffectId,
        colorId: resolvedSelectedNameColorId,
        secondaryColorId: resolvedSelectedNameSecondaryColorId,
      }, selectedNameFx)
    : fansub.activeNameStyle

  if (backgroundUploadFile) {
    const backgroundStepIndex = avatarUploadFile ? 1 : 0
    nextBackgroundRef = await uploadProfileBackground(
      backgroundUploadFile,
      fansub.id,
      selectedBackground?.slotIndex ?? 0,
      createUploadProgressHandler(backgroundStepIndex, txa('Arka plan yükleniyor')),
    )
    nextBackgroundPreviewUrl = buildVersionedAssetUrl(nextBackgroundRef, Date.now())
  }

  const backgroundPatch: Partial<ExtendedFansub> = selectedBackground
    ? (selectedBackground.origin === 'upload'
        ? {
            activeBackgroundId: undefined,
            customBackgroundAssetUrl: nextBackgroundRef ?? undefined,
          }
        : {
            activeBackgroundId: selectedBackground.id,
            customBackgroundAssetUrl: undefined,
          })
    : {}

  onUploadProgress?.(txa('Kayıt güncelleniyor'), 100)
  const [upsertResult] = await Promise.all([
    upsertFansub({
      activeNameStyle: nextActiveNameStyle,
      avatar: nextAvatarUrl,
      ...backgroundPatch,
      description: normalizedDescription || undefined,
      discordInviteUrl: normalizedDiscordInviteUrl,
      id: fansub.id,
      name: fansub.name,
      slug: normalizedSlug,
      primaryColor: fansub.primaryColor,
      secondaryColor: fansub.secondaryColor,
      hoverTheme: nextHoverTheme ?? undefined,
    }),
    updateFansubDisplayedBadges(fansub.id, selectedBadgeIds),
    ...inventoryTasks,
  ])

  return {
    nextAvatarUrl,
    nextBackgroundRef,
    nextBackgroundPreviewUrl,
    normalizedDiscordInviteUrl,
    nextActiveNameStyle,
    upsertedFansubData: upsertResult.data,
  }
}

export function applyFansubDonationSuccess({
  newFansubBalance,
  newUserBalance,
  updateCurrentUser,
  setFansub,
  setIsDonateDialogOpen,
}: ApplyFansubDonationSuccessOptions) {
  setFansub((previous) => (previous ? { ...previous, coinBalance: newFansubBalance } : previous))
  updateCurrentUser({ stones: newUserBalance })
  setIsDonateDialogOpen(false)
}

export function openFansubDonateDialog({
  currentUserId,
  setDonationAmountInput,
  setDonationNote,
  setDonationConfirmationInput,
  setIsDonateDialogOpen,
}: OpenFansubDonateDialogOptions) {
  if (!currentUserId) return false
  setDonationAmountInput('100')
  setDonationNote('')
  setDonationConfirmationInput('')
  setIsDonateDialogOpen(true)
  return true
}

export function applyFansubEditUiState({
  nextAvatarUrl,
  nextEquippedBackground,
  normalizedDescription,
  normalizedDiscordInviteUrl,
  normalizedSlug,
  nextActiveNameStyle,
  nextHoverTheme,
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
}: ApplyFansubEditUiStateOptions) {
  setEditDraft({
    avatar: nextAvatarUrl,
    description: normalizedDescription,
    discordInviteUrl: normalizedDiscordInviteUrl || '',
    slug: normalizedSlug,
    hoverTheme: parseProfileTheme(nextHoverTheme),
  })
  const nameState = readFansubNameStyle(nextActiveNameStyle)
  setSelectedNameFontId(nameState.fontId)
  setSelectedNameEffectId(nameState.effectId)
  setSelectedNameColorId(nameState.colorId)
  setSelectedNameSecondaryColorId(nameState.secondaryColorId)
  setSelectedNameFx(nameState.fx)
  setSelectedNameColorSlot('primary')
  resetPendingAvatarSelection(nextAvatarUrl)
  resetPendingBackgroundSelection(nextEquippedBackground)
  setEquippedFrame(null)
  setEquippedBackground(nextEquippedBackground)
  setEquippedProfileEffectId(undefined)
  setIsEditOpen(false)
}

function buildVersionedAssetUrl(assetRef: string, cacheKey: number | string) {
  const resolvedAssetUrl = resolveStoreAssetUrl(assetRef) || assetRef
  if (/^(data:|blob:)/i.test(resolvedAssetUrl)) return resolvedAssetUrl
  try {
    const url = new URL(resolvedAssetUrl, window.location.origin)
    url.searchParams.set('v', String(cacheKey))
    return url.toString()
  } catch {
    const separator = resolvedAssetUrl.includes('?') ? '&' : '?'
    return `${resolvedAssetUrl}${separator}v=${encodeURIComponent(String(cacheKey))}`
  }
}

export function buildUploadedFansubBackgroundSelection(
  backgroundRef: string,
  fileName: string,
  mimeType?: string | null,
  cacheKey?: number | string,
): FansubOwnedBackground {
  const mediaType: FansubOwnedBackground['mediaType'] =
    resolveAssetMediaType(backgroundRef) || (mimeType?.startsWith('video/') ? 'video' : 'image')
  const versionedAssetUrl = cacheKey ? buildVersionedAssetUrl(backgroundRef, cacheKey) : undefined
  const preview = versionedAssetUrl
    ? resolveBackgroundPreview(versionedAssetUrl)
    : resolveBackgroundPreview(backgroundRef)
  return {
    id: backgroundRef,
    assetRef: backgroundRef,
    background: preview.style,
    label: buildFansubBackgroundLabel(fileName),
    mediaType: mediaType || 'image',
    origin: 'upload',
    posterBackground: preview.style,
    slotIndex: 0,
    videoUrl: preview.videoUrl,
  }
}
