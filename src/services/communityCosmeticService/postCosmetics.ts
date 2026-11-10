import { resolveStoreAssetUrl } from '../assetUrlService'
import { resolvePatternStyle } from '../patternStyleService'
import { loadPublicUserDirectoryLiteByIds } from '../publicUserDirectoryLite'
import {
    collectRef,
    getRowFansubData,
    getRowUserData,
    loadStoreCosmeticLookups,
    normalizeRef,
    resolveBackground,
    resolveStoreRefItem,
    shouldLookupStoreBackgroundRef,
    shouldLookupStoreFrameRef,
    shouldLookupStorePatternRef,
    toFrameType,
} from './shared'
import type { CommunityCardCosmetics, CommunityCosmeticPostRow, CommunityCosmeticUserData } from './types'

async function loadUserCosmeticFallbackMap(rows: CommunityCosmeticPostRow[], signal?: AbortSignal) {
    const userIds = new Set<string>()

    rows.forEach((row) => {
        const fansubData = getRowFansubData(row)
        const isFansubAuthor = Boolean(row.related_fansub_id && fansubData)
        if (isFansubAuthor) return

        const userData = getRowUserData(row)
        const userId = (row.author_id || userData?.id || '').trim()
        const needsFallback = !userData?.id || userData.frame_type == null || userData.background_type == null
        if (userId && needsFallback) userIds.add(userId)
    })

    if (userIds.size === 0) return new Map<string, CommunityCosmeticUserData>()

    const map = new Map<string, CommunityCosmeticUserData>()
    const rowsById = await loadPublicUserDirectoryLiteByIds(Array.from(userIds), signal)
    rowsById.forEach((row) => {
        if (!row.id) return
        map.set(row.id, {
            id: row.id,
            frame_type: row.frame_type,
            background_type: row.background_type,
        })
    })

    return map
}

function resolvePostUserData(
    row: CommunityCosmeticPostRow,
    fallbackMap: Map<string, CommunityCosmeticUserData>,
): CommunityCosmeticUserData | undefined {
    const relationUserData = getRowUserData(row)
    const userId = (row.author_id || relationUserData?.id || '').trim() || null
    const fallbackUserData = userId ? fallbackMap.get(userId) : undefined

    if (!relationUserData && !fallbackUserData) return undefined

    return {
        ...(fallbackUserData || {}),
        ...(relationUserData || {}),
        id: relationUserData?.id || fallbackUserData?.id || userId,
    }
}

export async function buildCommunityCardCosmeticMap(
    rows: CommunityCosmeticPostRow[],
    signal?: AbortSignal,
): Promise<Map<string, CommunityCardCosmetics>> {
    const map = new Map<string, CommunityCardCosmetics>()
    if (rows.length === 0) return map

    const userFallbackMap = await loadUserCosmeticFallbackMap(rows, signal)

    const storeIdRefs = new Set<string>()
    const storeIdentifierRefs = new Set<string>()

    rows.forEach((row) => {
        const fansubData = getRowFansubData(row)
        const isFansubAuthor = Boolean(row.related_fansub_id && fansubData)
        if (isFansubAuthor) {
            collectRef(storeIdRefs, storeIdentifierRefs, fansubData?.active_frame_id || null)
            const activeBackgroundRef = normalizeRef(fansubData?.active_background_id)
            if (shouldLookupStoreBackgroundRef(activeBackgroundRef)) {
                collectRef(storeIdRefs, storeIdentifierRefs, activeBackgroundRef)
            }

            const activePatternRef = normalizeRef(fansubData?.active_pattern_id)
            if (shouldLookupStorePatternRef(activePatternRef)) {
                collectRef(storeIdRefs, storeIdentifierRefs, activePatternRef)
            }
            return
        }

        const userData = resolvePostUserData(row, userFallbackMap)
        const activeFrameRef = normalizeRef(userData?.frame_type || row.frame_type)
        if (shouldLookupStoreFrameRef(activeFrameRef)) {
            collectRef(storeIdRefs, storeIdentifierRefs, activeFrameRef)
        }

        const activeBgRef = normalizeRef(userData?.background_type)
        if (shouldLookupStoreBackgroundRef(activeBgRef)) {
            collectRef(storeIdRefs, storeIdentifierRefs, activeBgRef)
        }
    })

    const { byId, byTypeIdentifier } = await loadStoreCosmeticLookups(storeIdRefs, storeIdentifierRefs, signal)

    rows.forEach((row) => {
        const fansubData = getRowFansubData(row)
        const isFansubAuthor = Boolean(row.related_fansub_id && fansubData)
        const cosmetics: CommunityCardCosmetics = {}

        if (isFansubAuthor) {
            const frameItem = resolveStoreRefItem(byId, byTypeIdentifier, 'frame', fansubData?.active_frame_id || null)
            const resolvedFrameType = toFrameType(
                frameItem?.identifier || frameItem?.image_key || fansubData?.frame_type || row.frame_type,
            )
            if (resolvedFrameType) cosmetics.frameType = resolvedFrameType
            const frameOverlayUrl = resolveStoreAssetUrl(frameItem?.custom_asset_url) || frameItem?.custom_asset_url
            const framePosterUrl = resolveStoreAssetUrl(frameItem?.poster_asset_url) || frameItem?.poster_asset_url
            if (frameOverlayUrl) cosmetics.frameOverlayUrl = frameOverlayUrl
            if (framePosterUrl) cosmetics.framePosterUrl = framePosterUrl

            const backgroundItem = resolveStoreRefItem(
                byId,
                byTypeIdentifier,
                'background',
                fansubData?.active_background_id || null,
            )
            const backgroundSource =
                backgroundItem?.custom_asset_url || backgroundItem?.image_key || backgroundItem?.identifier || null
            const resolvedBackground = resolveBackground(backgroundSource)
            if (resolvedBackground.style) cosmetics.backgroundStyle = resolvedBackground.style
            if (resolvedBackground.videoUrl) cosmetics.backgroundVideoUrl = resolvedBackground.videoUrl

            const patternItem = resolveStoreRefItem(
                byId,
                byTypeIdentifier,
                'pattern',
                fansubData?.active_pattern_id || null,
            )
            const patternSource =
                patternItem?.custom_asset_url || patternItem?.image_key || patternItem?.identifier || null
            const resolvedPattern = resolvePatternStyle(patternSource)
            if (resolvedPattern) cosmetics.patternStyle = resolvedPattern

            const primaryColor = fansubData?.primary_color || row.primary_color || undefined
            const secondaryColor = fansubData?.secondary_color || row.secondary_color || undefined
            if (primaryColor) cosmetics.primaryColor = primaryColor
            if (secondaryColor) cosmetics.secondaryColor = secondaryColor
        } else {
            const userData = resolvePostUserData(row, userFallbackMap)
            const activeFrameRef = normalizeRef(userData?.frame_type || row.frame_type)
            const frameItem = resolveStoreRefItem(byId, byTypeIdentifier, 'frame', activeFrameRef)
            const resolvedFrameType = toFrameType(frameItem?.identifier || frameItem?.image_key || activeFrameRef)
            if (resolvedFrameType) cosmetics.frameType = resolvedFrameType
            const frameOverlayUrl = resolveStoreAssetUrl(frameItem?.custom_asset_url) || frameItem?.custom_asset_url
            const framePosterUrl = resolveStoreAssetUrl(frameItem?.poster_asset_url) || frameItem?.poster_asset_url
            if (frameOverlayUrl) cosmetics.frameOverlayUrl = frameOverlayUrl
            if (framePosterUrl) cosmetics.framePosterUrl = framePosterUrl

            const activeBgRef = normalizeRef(userData?.background_type)
            const backgroundItem = resolveStoreRefItem(byId, byTypeIdentifier, 'background', activeBgRef)
            const backgroundSource =
                backgroundItem?.custom_asset_url ||
                backgroundItem?.image_key ||
                backgroundItem?.identifier ||
                activeBgRef
            const resolvedBackground = resolveBackground(backgroundSource)
            if (resolvedBackground.style) cosmetics.backgroundStyle = resolvedBackground.style
            if (resolvedBackground.videoUrl) cosmetics.backgroundVideoUrl = resolvedBackground.videoUrl

            if (row.primary_color) cosmetics.primaryColor = row.primary_color
            if (row.secondary_color) cosmetics.secondaryColor = row.secondary_color
        }

        map.set(row.id, cosmetics)
    })

    return map
}
