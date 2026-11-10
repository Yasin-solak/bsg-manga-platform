import { resolveStoreAssetUrl } from '../assetUrlService'
import { resolvePatternStyle } from '../patternStyleService'
import {
    collectRef,
    loadStoreCosmeticLookups,
    normalizeRef,
    resolveBackground,
    resolveStoreRefItem,
    shouldLookupStoreBackgroundRef,
    shouldLookupStoreFrameRef,
    shouldLookupStorePatternRef,
    toFrameType,
} from './shared'
import type { CommunityCardCosmetics, CommunityCosmeticFansubRow } from './types'

export async function buildFansubCosmeticMap(
    rows: CommunityCosmeticFansubRow[],
    signal?: AbortSignal,
): Promise<Map<string, CommunityCardCosmetics>> {
    const map = new Map<string, CommunityCardCosmetics>()
    if (rows.length === 0) return map

    const storeIdRefs = new Set<string>()
    const storeIdentifierRefs = new Set<string>()

    rows.forEach((row) => {
        const frameRef = normalizeRef(row.active_frame_id)
        if (shouldLookupStoreFrameRef(frameRef)) {
            collectRef(storeIdRefs, storeIdentifierRefs, frameRef)
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

    const { byId, byTypeIdentifier } = await loadStoreCosmeticLookups(storeIdRefs, storeIdentifierRefs, signal)

    rows.forEach((row) => {
        const cosmetics: CommunityCardCosmetics = {}

        const frameRef = normalizeRef(row.active_frame_id)
        const frameItem = resolveStoreRefItem(byId, byTypeIdentifier, 'frame', frameRef)
        const resolvedFrameType = toFrameType(frameItem?.identifier || frameItem?.image_key || row.frame_type)
        if (resolvedFrameType) cosmetics.frameType = resolvedFrameType
        const frameOverlayUrl = resolveStoreAssetUrl(frameItem?.custom_asset_url) || frameItem?.custom_asset_url
        const framePosterUrl = resolveStoreAssetUrl(frameItem?.poster_asset_url) || frameItem?.poster_asset_url
        if (frameOverlayUrl) cosmetics.frameOverlayUrl = frameOverlayUrl
        if (framePosterUrl) cosmetics.framePosterUrl = framePosterUrl

        const directBackgroundRef = normalizeRef(row.custom_background_asset_url)
        const backgroundRef = normalizeRef(row.active_background_id)
        const backgroundItem = resolveStoreRefItem(byId, byTypeIdentifier, 'background', backgroundRef)
        const backgroundSource =
            directBackgroundRef
            || backgroundItem?.custom_asset_url
            || backgroundItem?.image_key
            || backgroundItem?.identifier
            || backgroundRef
        const resolvedBackground = resolveBackground(backgroundSource)
        if (resolvedBackground.style) cosmetics.backgroundStyle = resolvedBackground.style
        if (resolvedBackground.videoUrl) cosmetics.backgroundVideoUrl = resolvedBackground.videoUrl

        const patternRef = normalizeRef(row.active_pattern_id)
        const patternItem = resolveStoreRefItem(byId, byTypeIdentifier, 'pattern', patternRef)
        const patternSource =
            patternItem?.custom_asset_url || patternItem?.image_key || patternItem?.identifier || patternRef
        const resolvedPattern = resolvePatternStyle(patternSource)
        if (resolvedPattern) cosmetics.patternStyle = resolvedPattern

        if (row.primary_color) cosmetics.primaryColor = row.primary_color
        if (row.secondary_color) cosmetics.secondaryColor = row.secondary_color

        map.set(row.id, cosmetics)
    })

    return map
}
