import { cloneStoreProfileEffectAssets } from '@/data/storeProducts'
import { DEFAULT_FANSUB_NAME_FX, readFansubNameStyle, type FansubNameFx } from './fansubNameStyle'
import type { StoreItem } from '@/data/storeProducts'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
} from '@/data/nameTextEffects'
import {
  checkFansubAdmin,
  type FansubChapterMangaLookupRow,
  getFansubByIdentifier,
  getFansubMembers,
  listFansubChapters,
  listFansubInventory,
  listMangasForFansub,
} from '@/services/fansubService'
import { getFansubBadges, type FansubBadge } from '@/services/badgeService'
import { getStoreProfileEffectAssetMap } from '@/services/storeProfileEffectService'
import { resolveAssetMediaType } from '@/services/assetUrlService'
import {
  isFansubNotFoundError,
  resolveBackgroundPreview,
  toFrameType,
  type FansubChapterRow,
} from './fansubDetailUtils'
import type {
  ExtendedFansub,
  FansubEditResources,
  FansubMangaShelfItem,
  FansubOwnedBackground,
  OwnedFrameInfo,
} from './types'
import { txa } from '@/i18n/activeLocale'

interface LoadFansubDetailSnapshotOptions {
  currentUserId: string | null
  fansubRef: string
  isSiteAdmin: boolean
}

export interface FansubDetailSnapshot {
  fansub: ExtendedFansub
  fansubMangas: FansubMangaShelfItem[]
  pendingOwnedMangaIds: string[]
  chapters: FansubChapterRow[]
  ownedBadges: FansubBadge[]
  selectedBadgeIds: string[]
  hasNameTextAccess: boolean
  selectedNameFontId: NameTextFontId
  selectedNameEffectId: NameTextEffectId
  selectedNameColorId: NameTextColorId
  selectedNameSecondaryColorId: NameTextColorId
  selectedNameFx: FansubNameFx
  isFansubAdmin: boolean
  badgeLoadError: unknown | null
  isNotFoundError: boolean
}

function buildMinimalFansubProfileEffectItem(
  effectId: string,
  effectName: string,
  assets?: NonNullable<Awaited<ReturnType<typeof getStoreProfileEffectAssetMap>>['data']> extends Map<string, infer TValue> ? TValue : never,
): StoreItem {
  return {
    id: effectId,
    identifier: effectId,
    name: effectName || txa('Profil efekti'),
    description: '',
    price: 0,
    currency: 'Coin',
    type: 'profile_effect',
    posterAssetUrl: assets?.posterAssetUrl,
    profileEffectAssets: assets
      ? cloneStoreProfileEffectAssets(assets)
      : undefined,
  }
}

export async function loadFansubEditResources(
  fansubId: string,
  activeProfileEffectId: string | null | undefined,
  hasNameTextAccess = false,
): Promise<FansubEditResources> {
  const inventoryEntries = await listFansubInventory(fansubId)
  const ownedFrameSet = new Set<string>()
  const frameInfoMap = new Map<string, OwnedFrameInfo>()
  const ownedBackgroundMap = new Map<string, FansubOwnedBackground>()
  const profileEffectNames = new Map<string, string>()
  const frameItemIdsByType: Record<string, string> = {}

  inventoryEntries.forEach((entry) => {
    if (entry.type === 'frame') {
      const rawId = entry.identifier || entry.image || ''
      const resolved = toFrameType(rawId)
      if (resolved) {
        ownedFrameSet.add(resolved)
        if (!frameItemIdsByType[resolved]) frameItemIdsByType[resolved] = entry.storeItemId
        frameInfoMap.set(resolved, {
          identifier: resolved,
          isKnown: true,
          name: entry.name || resolved,
          posterAssetUrl: entry.posterAssetUrl,
          storeItemId: entry.storeItemId,
        })
      } else if (rawId || entry.customAssetUrl) {
        const customIdentifier = rawId || entry.storeItemId
        ownedFrameSet.add(customIdentifier)
        if (!frameItemIdsByType[customIdentifier]) frameItemIdsByType[customIdentifier] = entry.storeItemId
        frameInfoMap.set(customIdentifier, {
          customAssetUrl: entry.customAssetUrl,
          identifier: customIdentifier,
          isKnown: false,
          name: entry.name || txa('Özel çerçeve'),
          posterAssetUrl: entry.posterAssetUrl,
          storeItemId: entry.storeItemId,
        })
      }
    }

    if (entry.type === 'background') {
      const liveSource = entry.customAssetUrl || entry.image || entry.identifier
      if (!liveSource) return
      const previewSource = entry.posterAssetUrl || entry.image || entry.identifier || liveSource
      const resolved = resolveBackgroundPreview(liveSource)
      const fallbackResolved = resolveBackgroundPreview(previewSource)
      ownedBackgroundMap.set(entry.storeItemId, {
        assetRef: liveSource,
        background: fallbackResolved.style,
        id: entry.storeItemId,
        label: entry.name || txa('Arka plan'),
        mediaType: resolveAssetMediaType(liveSource) || (resolved.videoUrl ? 'video' : 'image'),
        origin: 'store',
        posterBackground: fallbackResolved.style,
        videoUrl: resolved.videoUrl,
      })
    }

    if (entry.type === 'profile_effect') {
      profileEffectNames.set(entry.storeItemId, entry.name || txa('Profil efekti'))
    }
  })

  const profileEffectIds = Array.from(new Set(
    [...profileEffectNames.keys(), ...(activeProfileEffectId ? [activeProfileEffectId] : [])],
  ))
  const profileEffectAssetMapResult = profileEffectIds.length > 0
    ? await getStoreProfileEffectAssetMap(profileEffectIds)
    : { data: new Map(), error: null }

  return {
    frameItemIdsByType,
    hasNameTextAccess,
    ownedBackgrounds: Array.from(ownedBackgroundMap.values()),
    ownedFrameInfos: Array.from(frameInfoMap.values()),
    ownedFrames: Array.from(ownedFrameSet),
    ownedProfileEffects: Array.from(profileEffectNames.entries()).map(([effectId, effectName]) => (
      buildMinimalFansubProfileEffectItem(effectId, effectName, profileEffectAssetMapResult.data.get(effectId))
    )),
  }
}

export async function loadFansubDetailSnapshot({
  currentUserId,
  fansubRef,
  isSiteAdmin,
}: LoadFansubDetailSnapshotOptions): Promise<FansubDetailSnapshot> {
  try {
    const fansubData = await getFansubByIdentifier(fansubRef)
    const fansubId = fansubData.id
    const adminCheckPromise = currentUserId
      ? checkFansubAdmin(fansubId, currentUserId).catch(() => false)
      : Promise.resolve(false)

    const [membersData, isAdmin] = await Promise.all([
      getFansubMembers(fansubId),
      adminCheckPromise,
    ])

    const canSeePending = isSiteAdmin || isAdmin
    const chaptersData = await listFansubChapters(fansubId, { includePending: canSeePending })
    const mangasRes = await listMangasForFansub(fansubId, {
      includePending: canSeePending,
      chapterRows: chaptersData as FansubChapterMangaLookupRow[],
    })
    const profileEffectAssetMapResult = fansubData.activeProfileEffectId
      ? await getStoreProfileEffectAssetMap([fansubData.activeProfileEffectId])
      : { data: new Map(), error: null }
    // Name style can be v1 or v2; normalized and split into editor state.
    const nameState = readFansubNameStyle(fansubData.activeNameStyle)

    let ownedBadges: FansubBadge[] = []
    let selectedBadgeIds: string[] = []
    let badgeLoadError: unknown | null = null

    try {
      ownedBadges = await getFansubBadges(fansubId)
      selectedBadgeIds = ownedBadges
        .filter((badge) => badge.is_displayed)
        .sort((a, b) => a.display_order - b.display_order)
        .map((badge) => badge.badge_id)
    } catch (error) {
      badgeLoadError = error
    }

    return {
      badgeLoadError,
      chapters: ((chaptersData as unknown) as FansubChapterRow[]) || [],
      fansub: {
        ...fansubData,
        activeProfileEffectAssets: fansubData.activeProfileEffectId
          ? profileEffectAssetMapResult.data.get(fansubData.activeProfileEffectId) || undefined
          : undefined,
        members: membersData,
      },
      fansubMangas: mangasRes.data as FansubMangaShelfItem[],
      hasNameTextAccess: Boolean(fansubData.activeNameStyle),
      isFansubAdmin: isAdmin,
      isNotFoundError: false,
      ownedBadges,
      pendingOwnedMangaIds: mangasRes.pendingOwnedMangaIds || [],
      selectedBadgeIds,
      selectedNameColorId: nameState.colorId,
      selectedNameEffectId: nameState.effectId,
      selectedNameFontId: nameState.fontId,
      selectedNameSecondaryColorId: nameState.secondaryColorId,
      selectedNameFx: nameState.fx,
    }
  } catch (error) {
    if (isFansubNotFoundError(error)) {
      return {
        badgeLoadError: null,
        chapters: [],
        fansub: null as unknown as ExtendedFansub,
        fansubMangas: [],
        hasNameTextAccess: false,
        isFansubAdmin: false,
        isNotFoundError: true,
        ownedBadges: [],
        pendingOwnedMangaIds: [],
        selectedBadgeIds: [],
        selectedNameColorId: DEFAULT_NAME_TEXT_COLOR_ID,
        selectedNameEffectId: DEFAULT_NAME_TEXT_EFFECT_ID,
        selectedNameFontId: DEFAULT_NAME_TEXT_FONT_ID,
        selectedNameSecondaryColorId: DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
        selectedNameFx: DEFAULT_FANSUB_NAME_FX,
      }
    }
    throw error
  }
}
