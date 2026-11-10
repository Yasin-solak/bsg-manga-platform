import { resolveStoreAssetUrl } from '../assetUrlService'
import { loadStoreItemsLiteByRefs } from '../storeItemLiteDirectory'
import {
  collectRef,
  normalizeRef,
  resolveBackground,
  resolvePattern,
  resolveStoreRefItem,
  shouldLookupStoreBackgroundRef,
  shouldLookupStoreFrameRef,
  shouldLookupStorePatternRef,
  toFrameType,
} from './shared'
import type { FansubCardCosmetics, FansubCosmeticSource, StoreCosmeticRow } from './types'

export function collectFansubCardStoreRefs(rows: FansubCosmeticSource[]) {
  const storeIdRefs = new Set<string>()
  const storeIdentifierRefs = new Set<string>()

  rows.forEach((row) => {
    const frameRef = normalizeRef(row.active_frame_id)
    if (frameRef) {
      collectRef(storeIdRefs, storeIdentifierRefs, frameRef)
    } else {
      const legacyFrameRef = normalizeRef(row.frame_type)
      if (shouldLookupStoreFrameRef(legacyFrameRef)) {
        collectRef(storeIdRefs, storeIdentifierRefs, legacyFrameRef)
      }
    }

    const backgroundRef = normalizeRef(row.active_background_id)
    if (!row.custom_background_asset_url && shouldLookupStoreBackgroundRef(backgroundRef)) {
      collectRef(storeIdRefs, storeIdentifierRefs, backgroundRef)
    }

    const patternRef = normalizeRef(row.active_pattern_id)
    if (shouldLookupStorePatternRef(patternRef)) {
      collectRef(storeIdRefs, storeIdentifierRefs, patternRef)
    }
  })

  return {
    ids: Array.from(storeIdRefs),
    identifiers: Array.from(storeIdentifierRefs),
  }
}

export function buildFansubCardCosmeticMapFromLookups(
  rows: FansubCosmeticSource[],
  lookups: {
    byId: Map<string, StoreCosmeticRow>
    byTypeIdentifier: Map<string, StoreCosmeticRow>
  },
): Map<string, FansubCardCosmetics> {
  const map = new Map<string, FansubCardCosmetics>()
  if (rows.length === 0) return map

  const byId = lookups.byId
  const byTypeIdentifier = lookups.byTypeIdentifier

  rows.forEach((row) => {
    const cosmetics: FansubCardCosmetics = {}

    const frameRef = normalizeRef(row.active_frame_id)
    const legacyFrameRef = normalizeRef(row.frame_type)
    const frameLookupRef = frameRef || (shouldLookupStoreFrameRef(legacyFrameRef) ? legacyFrameRef : null)
    const frameItem = resolveStoreRefItem(byId, byTypeIdentifier, 'frame', frameLookupRef)
    const resolvedFrameType = toFrameType(frameItem?.identifier || frameItem?.image_key || row.frame_type)
    if (resolvedFrameType) cosmetics.frameType = resolvedFrameType
    const frameCustomOverlaySource = frameItem?.custom_asset_url || frameItem?.image_key
    const frameCustomOverlayUrl = resolveStoreAssetUrl(frameCustomOverlaySource) || frameCustomOverlaySource
    const framePosterOverlayUrl = resolveStoreAssetUrl(frameItem?.poster_asset_url) || frameItem?.poster_asset_url
    if (frameCustomOverlayUrl) cosmetics.frameCustomOverlayUrl = frameCustomOverlayUrl
    if (framePosterOverlayUrl) cosmetics.framePosterOverlayUrl = framePosterOverlayUrl

    const directBackgroundRef = normalizeRef(row.custom_background_asset_url)
    const backgroundRef = normalizeRef(row.active_background_id)
    const backgroundItem = resolveStoreRefItem(byId, byTypeIdentifier, 'background', backgroundRef)
    const backgroundPreviewSource =
      directBackgroundRef
      || backgroundItem?.poster_asset_url
      || backgroundItem?.image_key
      || backgroundItem?.identifier
      || backgroundRef
      || null
    const backgroundSource =
      directBackgroundRef
      || backgroundItem?.custom_asset_url
      || backgroundItem?.poster_asset_url
      || backgroundItem?.image_key
      || backgroundItem?.identifier
      || backgroundRef
      || null
    const resolvedBackground = resolveBackground(backgroundSource)
    const resolvedBackgroundPreview = resolveBackground(backgroundPreviewSource)
    if (resolvedBackground.style) cosmetics.profileBackgroundStyle = resolvedBackground.style
    if (resolvedBackgroundPreview.style) cosmetics.profileBackgroundStyle = resolvedBackgroundPreview.style
    if (resolvedBackground.videoUrl) cosmetics.profileBackgroundVideoUrl = resolvedBackground.videoUrl

    const patternRef = normalizeRef(row.active_pattern_id)
    const patternItem = resolveStoreRefItem(byId, byTypeIdentifier, 'pattern', patternRef)
    const patternSource =
      patternItem?.custom_asset_url
      || patternItem?.image_key
      || patternItem?.identifier
      || patternRef
      || null
    const resolvedPattern = resolvePattern(patternSource)
    if (resolvedPattern) cosmetics.profilePatternStyle = resolvedPattern

    if (row.primary_color) cosmetics.primaryColor = row.primary_color
    if (row.secondary_color) cosmetics.secondaryColor = row.secondary_color

    map.set(row.id, cosmetics)
  })

  return map
}

export async function buildFansubCardCosmeticMap(
  rows: FansubCosmeticSource[],
): Promise<Map<string, FansubCardCosmetics>> {
  if (rows.length === 0) return new Map()

  const refs = collectFansubCardStoreRefs(rows)
  const loaded = await loadStoreItemsLiteByRefs({
    ids: refs.ids,
    identifiers: refs.identifiers,
  })

  return buildFansubCardCosmeticMapFromLookups(rows, {
    byId: loaded.byId as Map<string, StoreCosmeticRow>,
    byTypeIdentifier: loaded.byTypeIdentifier as Map<string, StoreCosmeticRow>,
  })
}
