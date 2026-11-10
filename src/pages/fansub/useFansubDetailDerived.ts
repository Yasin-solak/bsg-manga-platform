import { useMemo } from 'react'
import type { FrameType } from '@components/common/AvatarFrame'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  resolveKnownNameTextColorId,
  resolveKnownNameTextEffectId,
  resolveKnownNameTextFontId,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { resolveVisibleFansubBackground, resolveVisibleFansubNameStyle, type FansubBoostCapabilityResolutionState } from '@/lib/fansubBoostCapabilityGovernance'
import type {
  ExtendedFansub,
  FansubChapterPreview,
  FansubMangaShelfItem,
  FansubOwnedBackground,
  OwnedFrameInfo,
} from './types'
import {
  buildChapterPreviews,
  FRAME_TYPES,
  resolveBackgroundPreview,
  toFrameType,
  type FansubChapterRow,
} from './fansubDetailUtils'
import { buildFansubNameDisplayStyle } from './fansubHeroStandards'
import { buildFansubNameProps, toFansubNameSelection, type FansubNameFx } from './fansubNameStyle'
import { normalizeUserNameTextStyle } from '@/data/userNameStyle'
import type { StoreItem } from '@/data/storeProducts'
import { txa } from '@/i18n/activeLocale'

type UseFansubDetailDerivedArgs = {
  fansub: ExtendedFansub | null
  boostCapabilities?: {
    canUploadStaticBackground?: boolean
    canUploadVideoBackground?: boolean
    hasFullNameStyle?: boolean
  } | null
  boostCapabilityResolutionState?: FansubBoostCapabilityResolutionState
  isSiteAdmin: boolean
  isFansubAdmin: boolean
  pendingOwnedMangaIds: string[]
  equippedFrame: string | null
  ownedFrameInfos: OwnedFrameInfo[]
  equippedBackground: FansubOwnedBackground | null
  equippedProfileEffectId: string | null | undefined
  ownedProfileEffects: StoreItem[]
  chapters: FansubChapterRow[]
  fansubMangas: FansubMangaShelfItem[]
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameFx: FansubNameFx
}

export function useFansubDetailDerived({
  fansub,
  boostCapabilities,
  boostCapabilityResolutionState = 'unknown',
  isSiteAdmin,
  isFansubAdmin,
  pendingOwnedMangaIds,
  equippedFrame,
  ownedFrameInfos,
  equippedBackground,
  equippedProfileEffectId,
  ownedProfileEffects,
  chapters,
  fansubMangas,
  selectedNameFontId,
  selectedNameEffectId,
  selectedNameColorId,
  selectedNameSecondaryColorId,
  selectedNameFx,
}: UseFansubDetailDerivedArgs) {
  const members = fansub?.members ?? []
  const canSeePending = isSiteAdmin || isFansubAdmin
  const pendingSet = useMemo(() => new Set(pendingOwnedMangaIds), [pendingOwnedMangaIds])

  const rawFrame = useMemo(() => {
    if (equippedFrame) return equippedFrame
    return fansub?.frameType || 'default'
  }, [fansub, equippedFrame])

  const effectiveFrame: FrameType = useMemo(
    () => toFrameType(rawFrame as string) || 'default',
    [rawFrame],
  )

  const effectiveCustomFrameUrl = useMemo(() => {
    const frameIdentifier = rawFrame as string
    const selectedFrameInfo = ownedFrameInfos.find((frame) => frame.identifier === frameIdentifier)
    const selectedCustomFrameUrl = selectedFrameInfo?.customAssetUrl

    if (selectedCustomFrameUrl) {
      return resolveStoreAssetUrl(selectedCustomFrameUrl) || selectedCustomFrameUrl
    }
    if (frameIdentifier === fansub?.frameType && fansub?.frameCustomOverlayUrl) return fansub.frameCustomOverlayUrl
    if (FRAME_TYPES.has(frameIdentifier as FrameType)) return undefined
    return undefined
  }, [rawFrame, ownedFrameInfos, fansub])

  const effectivePosterFrameUrl = useMemo(() => {
    const frameIdentifier = rawFrame as string
    const selectedFrameInfo = ownedFrameInfos.find((frame) => frame.identifier === frameIdentifier)
    const selectedPosterFrameUrl = selectedFrameInfo?.posterAssetUrl

    if (selectedPosterFrameUrl) {
      return resolveStoreAssetUrl(selectedPosterFrameUrl) || selectedPosterFrameUrl
    }
    if (frameIdentifier === fansub?.frameType && fansub?.framePosterOverlayUrl) return fansub.framePosterOverlayUrl
    if (FRAME_TYPES.has(frameIdentifier as FrameType)) return undefined
    return undefined
  }, [rawFrame, ownedFrameInfos, fansub])

  const effectiveBg = useMemo<FansubOwnedBackground | null>(() => {
    const resolveBackground = (background: FansubOwnedBackground | null) =>
      resolveVisibleFansubBackground(background, boostCapabilities, boostCapabilityResolutionState)

    if (equippedBackground) return resolveBackground(equippedBackground)
    if (fansub?.customBackgroundAssetUrl) {
      const backgroundPreviewSource = fansub.customBackgroundPreviewUrl || fansub.customBackgroundAssetUrl
      const preview = resolveBackgroundPreview(backgroundPreviewSource)
      const mediaType: FansubOwnedBackground['mediaType'] =
        resolveAssetMediaType(fansub.customBackgroundAssetUrl) || (preview.videoUrl ? 'video' : 'image')
      return resolveBackground({
        id: fansub.customBackgroundAssetUrl,
        assetRef: fansub.customBackgroundAssetUrl,
        background: preview.style,
        label: txa('Yüklenen arka plan'),
        mediaType,
        origin: 'upload' as const,
        posterBackground: preview.style,
        slotIndex: 0,
        videoUrl: preview.videoUrl,
      })
    }
    if (fansub?.profileBackgroundStyle || fansub?.profileBackgroundVideoUrl) {
      return resolveBackground({
        id: fansub.activeBackgroundId || 'fansub-active-background',
        label: txa('Seçili arka plan'),
        background: fansub.profileBackgroundStyle || '',
        mediaType: fansub.profileBackgroundVideoUrl ? 'video' : 'image',
        origin: 'store',
        posterBackground: fansub.profileBackgroundStyle || '',
        videoUrl: fansub.profileBackgroundVideoUrl,
      })
    }
    if (fansub?.activeBackgroundId) {
      const owned = fansub.ownedBackgrounds?.find((background) => background.id === fansub.activeBackgroundId)
      if (owned) return resolveBackground(owned)
    }
    return null
  }, [boostCapabilities, boostCapabilityResolutionState, fansub, equippedBackground])

  const effectiveProfileEffectId = useMemo(() => {
    if (equippedProfileEffectId !== undefined) return equippedProfileEffectId
    return fansub?.activeProfileEffectId ?? null
  }, [equippedProfileEffectId, fansub?.activeProfileEffectId])

  const activeProfileEffectAssets = useMemo(() => {
    // A fansub profile effect renders by the active/equipped inventory record, not boost.
    if (effectiveProfileEffectId) {
      const selectedEffect = ownedProfileEffects.find((effect) => effect.id === effectiveProfileEffectId)
      if (selectedEffect?.profileEffectAssets) return selectedEffect.profileEffectAssets
    }
    if (fansub?.activeProfileEffectAssets) return fansub.activeProfileEffectAssets
    return null
  }, [effectiveProfileEffectId, fansub?.activeProfileEffectAssets, ownedProfileEffects])

  const mangaStatsById = useMemo(() => {
    const stats = new Map<string, { approved: number; latestReleaseAt?: string | null; pending: number }>()

    chapters.forEach((chapter) => {
      const existing = stats.get(chapter.manga_id) || { approved: 0, pending: 0 }
      const isPending = chapter.is_approved === false
      const nextReleaseAt = chapter.publish_at || chapter.created_at
      if (isPending) {
        existing.pending += 1
      } else {
        existing.approved += 1
      }

      if (!existing.latestReleaseAt || new Date(nextReleaseAt).getTime() > new Date(existing.latestReleaseAt).getTime()) {
        existing.latestReleaseAt = nextReleaseAt
      }

      stats.set(chapter.manga_id, existing)
    })

    return stats
  }, [chapters])

  const sortedMangas = useMemo(() => {
    return [...fansubMangas]
      .map((manga) => {
        const stats = mangaStatsById.get(manga.id)
        return {
          ...manga,
          approvedChapterCount: stats?.approved || 0,
          isPendingOwned: pendingSet.has(manga.id),
          latestReleaseAt: stats?.latestReleaseAt,
          pendingChapterCount: canSeePending ? (stats?.pending || 0) : 0,
        }
      })
      .sort((a, b) => {
        const totalA = a.approvedChapterCount + a.pendingChapterCount
        const totalB = b.approvedChapterCount + b.pendingChapterCount
        if (totalA !== totalB) return totalB - totalA
        if (a.isPendingOwned !== b.isPendingOwned) return a.isPendingOwned ? -1 : 1
        return a.title.localeCompare(b.title, 'tr')
      })
  }, [canSeePending, fansubMangas, mangaStatsById, pendingSet])

  const chapterPreviews: FansubChapterPreview[] = useMemo(() => buildChapterPreviews(chapters), [chapters])

  const resolvedSelectedNameFontId = resolveKnownNameTextFontId(selectedNameFontId) || DEFAULT_NAME_TEXT_FONT_ID
  const resolvedSelectedNameEffectId = resolveKnownNameTextEffectId(selectedNameEffectId) || DEFAULT_NAME_TEXT_EFFECT_ID
  const resolvedSelectedNameColorId = resolveKnownNameTextColorId(selectedNameColorId) || DEFAULT_NAME_TEXT_COLOR_ID
  const resolvedSelectedNameSecondaryColorId = resolveKnownNameTextColorId(selectedNameSecondaryColorId) || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID

  // Name style v2 (same rendering as user name style): editor preview and title.
  const selectedNameProps = buildFansubNameProps(toFansubNameSelection({
    fontId: resolvedSelectedNameFontId,
    effectId: resolvedSelectedNameEffectId,
    colorId: resolvedSelectedNameColorId,
    secondaryColorId: resolvedSelectedNameSecondaryColorId,
  }, selectedNameFx))
  const selectedNameStyleClassName = selectedNameProps.className
  const selectedNameStyleInlineStyle = selectedNameProps.style

  const activeFansubNameStyle = resolveVisibleFansubNameStyle(
    fansub?.activeNameStyle,
    boostCapabilities,
    boostCapabilityResolutionState,
  )
  const hasActiveFansubNameStyle = Boolean(activeFansubNameStyle && Object.keys(activeFansubNameStyle).length)
  const headerNameProps = buildFansubNameProps(hasActiveFansubNameStyle ? normalizeUserNameTextStyle(activeFansubNameStyle) : null)
  const fansubHeaderNameClassName = headerNameProps.className
  const fansubHeaderNameInlineStyle = buildFansubNameDisplayStyle(headerNameProps.style)

  return {
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
  }
}
