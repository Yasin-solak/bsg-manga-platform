import { resolveStoreAssetUrl } from '../assetUrlService'
import { loadPublicUserDirectoryLiteByIds } from '../publicUserDirectoryLite'
import {
    collectRef,
    loadStoreCosmeticLookups,
    normalizeRef,
    resolveBackground,
    resolveStoreRefItem,
    shouldLookupStoreBackgroundRef,
    shouldLookupStoreFrameRef,
    toFrameType,
} from './shared'
import type { CommunityCardCosmetics } from './types'

type CommentAuthorRow = {
    id: string
    frame_type: string | null
    background_type: string | null
}

export async function buildCommentAuthorCosmeticMapFromRows(
    rows: CommentAuthorRow[],
    signal?: AbortSignal,
): Promise<Map<string, CommunityCardCosmetics>> {
    const map = new Map<string, CommunityCardCosmetics>()
    const typedRows = Array.from(
        new Map(
            rows
                .filter((row) => row?.id)
                .map((row) => [row.id, row] as const),
        ).values(),
    )
    if (typedRows.length === 0) return map

    const storeIdRefs = new Set<string>()
    const storeIdentifierRefs = new Set<string>()

    typedRows.forEach((row) => {
        const activeFrameRef = normalizeRef(row.frame_type)
        if (shouldLookupStoreFrameRef(activeFrameRef)) {
            collectRef(storeIdRefs, storeIdentifierRefs, activeFrameRef)
        }

        const activeBgRef = normalizeRef(row.background_type)
        if (shouldLookupStoreBackgroundRef(activeBgRef)) {
            collectRef(storeIdRefs, storeIdentifierRefs, activeBgRef)
        }
    })

    const { byId, byTypeIdentifier } = await loadStoreCosmeticLookups(storeIdRefs, storeIdentifierRefs, signal)

    typedRows.forEach((row) => {
        const cosmetics: CommunityCardCosmetics = {}

        const activeFrameRef = normalizeRef(row.frame_type)
        const frameItem = resolveStoreRefItem(byId, byTypeIdentifier, 'frame', activeFrameRef)
        const resolvedFrameType = toFrameType(frameItem?.identifier || frameItem?.image_key || activeFrameRef)
        if (resolvedFrameType) cosmetics.frameType = resolvedFrameType
        const frameOverlayUrl = resolveStoreAssetUrl(frameItem?.custom_asset_url) || frameItem?.custom_asset_url
        const framePosterUrl = resolveStoreAssetUrl(frameItem?.poster_asset_url) || frameItem?.poster_asset_url
        if (frameOverlayUrl) cosmetics.frameOverlayUrl = frameOverlayUrl
        if (framePosterUrl) cosmetics.framePosterUrl = framePosterUrl

        const activeBgRef = normalizeRef(row.background_type)
        const backgroundItem = resolveStoreRefItem(byId, byTypeIdentifier, 'background', activeBgRef)
        const backgroundSource =
            backgroundItem?.custom_asset_url || backgroundItem?.image_key || backgroundItem?.identifier || activeBgRef
        const resolvedBackground = resolveBackground(backgroundSource)
        if (resolvedBackground.style) cosmetics.backgroundStyle = resolvedBackground.style
        if (resolvedBackground.videoUrl) cosmetics.backgroundVideoUrl = resolvedBackground.videoUrl

        map.set(row.id, cosmetics)
    })

    return map
}

export async function buildCommentAuthorCosmeticMap(
    userIds: string[],
    signal?: AbortSignal,
): Promise<Map<string, CommunityCardCosmetics>> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
    if (uniqueIds.length === 0) return new Map()

    const rowsById = await loadPublicUserDirectoryLiteByIds(uniqueIds, signal)
    return buildCommentAuthorCosmeticMapFromRows(Array.from(rowsById.values()) as CommentAuthorRow[], signal)
}
