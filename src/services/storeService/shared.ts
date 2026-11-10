import { sanitizeStoreItemThemeName } from '@/data/storeProducts'

import { resolveStoreAssetUrl } from '../assetUrlService'
import type { StoreItem, StoreItemRow } from './types'

export function mapRowToStoreItem(row: StoreItemRow): StoreItem {
    const purchaseCount = row.purchase_count ?? 0
    const resolvedImage = resolveStoreAssetUrl(row.image_key) || row.image_key || undefined

    return {
        id: row.id,
        identifier: row.identifier,
        name: row.name,
        description: row.description || '',
        price: row.price,
        originalPrice: row.original_price || undefined,
        currency: row.currency,
        type: row.type,
        frameType: row.type === 'frame' ? (row.identifier as any) : undefined,
        image: resolvedImage || (row.type !== 'frame' ? row.identifier : undefined),
        customAssetUrl: resolveStoreAssetUrl(row.custom_asset_url) || undefined,
        posterAssetUrl: resolveStoreAssetUrl(row.poster_asset_url) || undefined,
        themeName: sanitizeStoreItemThemeName(row.theme_name),
        isActive: row.is_active,
        isNew: Date.now() - new Date(row.created_at).getTime() < 7 * 24 * 60 * 60 * 1000,
        isPopular: purchaseCount > 10,
        isOwned: false,
        purchaseCount,
    }
}
