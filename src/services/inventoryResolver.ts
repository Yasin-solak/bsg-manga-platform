import { resolveStoreAssetUrl } from './assetUrlService'
import {
    loadStoreItemsLiteByIdentifiers,
    toStoreItemLiteTypeIdentifierKey,
} from './storeItemLiteDirectory'

export interface ResolvedInventoryItem {
    identifier: string
    name: string
    customAssetUrl?: string
    posterAssetUrl?: string
    type: 'frame' | 'background' | 'pattern' | 'badge' | 'premium'
}

export async function resolveInventoryItems(
    identifiers: string[],
    type: 'frame' | 'background' | 'pattern' | 'badge' | 'premium',
): Promise<ResolvedInventoryItem[]> {
    if (!identifiers || identifiers.length === 0) return []

    const rows = await loadStoreItemsLiteByIdentifiers(identifiers)
    const dbMap = new Map<string, { name: string; customAssetUrl?: string; posterAssetUrl?: string }>()

    identifiers.forEach((identifier) => {
        const row = rows.get(toStoreItemLiteTypeIdentifierKey(type, identifier))
        if (!row) return

        dbMap.set(row.identifier, {
            name: row.name || row.identifier,
            customAssetUrl: resolveStoreAssetUrl(row.custom_asset_url || row.image_key) || undefined,
            posterAssetUrl: resolveStoreAssetUrl(row.poster_asset_url) || undefined,
        })
    })

    return identifiers.map((id) => {
        const dbItem = dbMap.get(id)
        return {
            identifier: id,
            name: dbItem?.name || id,
            customAssetUrl: dbItem?.customAssetUrl,
            posterAssetUrl: dbItem?.posterAssetUrl,
            type,
        }
    })
}

export async function resolveOwnedFrames(identifiers: string[]): Promise<ResolvedInventoryItem[]> {
    return resolveInventoryItems(identifiers, 'frame')
}

export async function resolveOwnedBackgrounds(identifiers: string[]): Promise<ResolvedInventoryItem[]> {
    return resolveInventoryItems(identifiers, 'background')
}

export async function resolveOwnedPatterns(identifiers: string[]): Promise<ResolvedInventoryItem[]> {
    return resolveInventoryItems(identifiers, 'pattern')
}
