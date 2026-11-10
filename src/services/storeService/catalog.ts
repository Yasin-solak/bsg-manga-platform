import { cloneStoreProfileEffectAssets } from '@/data/storeProducts'
import { resolveStoreAssetUrl } from '../assetUrlService'
import { getStoreProfileEffectAssetMap } from '../storeProfileEffectService'
import { supabase } from '../supabase'
import { isAbortError } from '../supabaseError'
import { mapRowToStoreItem } from './shared'
import type { BadgeRow, StoreItem, StoreItemRow } from './types'

import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { toUserFacingErrorMessage } from '../userFacingError'

const storeCatalogLogger = createScopedLogger('storeService.catalog')

const STORE_ITEM_CATALOG_SELECT = `
    id,
    name,
    description,
    identifier,
    type,
    price,
    original_price,
    currency,
    image_key,
    custom_asset_url,
    poster_asset_url,
    theme_name,
    is_active,
    created_at,
    purchase_count
`

const PURCHASABLE_BADGE_SELECT = `
    id,
    name,
    description,
    image_url,
    category,
    subcategory,
    price,
    rarity,
    is_active,
    target_type
`

async function hydrateProfileEffectAssets(items: StoreItem[]) {
    const profileEffectIds = items.filter((item) => item.type === 'profile_effect').map((item) => item.id)
    if (profileEffectIds.length === 0) return items
    const requestContext = createRequestContext('storeService.catalog', 'hydrate-profile-effect-assets', {
        itemCount: profileEffectIds.length,
    })

    const { data: assetMap, error } = await withServiceTimeout(
        () => getStoreProfileEffectAssetMap(profileEffectIds),
        { label: 'Profil efekt assetlerini yukleme' },
    )
    if (error) {
        if (!isAbortError(error)) {
            storeCatalogLogger.warn({
                event: 'hydrate-profile-effect-assets-failed',
                message: toUserFacingErrorMessage(error, 'Profil efekt assetleri yuklenemedi.'),
                context: toRequestContextLogContext(requestContext),
                error,
            })
        }
        return items
    }

    return items.map((item) => {
        if (item.type !== 'profile_effect') return item
        const assets = assetMap.get(item.id)
        if (!assets) return item
        return {
          ...item,
          posterAssetUrl: assets.posterAssetUrl,
          profileEffectAssets: cloneStoreProfileEffectAssets(assets),
        }
    })
}

async function listStoreProductRows(
    event: string,
    label: string,
    query: PromiseLike<{ data: StoreItemRow[] | null; error: unknown }>,
): Promise<{ data: StoreItem[]; error: unknown }> {
    const requestContext = createRequestContext('storeService.catalog', event)
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(query, signal),
        { label },
    )

    if (error) {
        if (!isAbortError(error)) {
            storeCatalogLogger.error({
                event,
                message: toUserFacingErrorMessage(error, 'Magaza urunleri yuklenemedi.'),
                context: toRequestContextLogContext(requestContext),
                error,
            })
            return { data: [], error }
        }
        return { data: [], error: null }
    }

    const mapped = ((data as StoreItemRow[] | null) ?? []).map(mapRowToStoreItem)
    return {
        data: await hydrateProfileEffectAssets(mapped),
        error: null,
    }
}

export async function listStoreProducts(includeInactive = false): Promise<{ data: StoreItem[]; error: unknown }> {
    let query = supabase.from('store_items').select(STORE_ITEM_CATALOG_SELECT).order('created_at', { ascending: false })

    if (!includeInactive) {
        query = query.eq('is_active', true)
    }

    return listStoreProductRows('list-store-products', 'Magaza urunlerini listeleme', query as any)
}

export async function listStoreProductsByIds(itemIds: string[], includeInactive = true): Promise<{ data: StoreItem[]; error: unknown }> {
    if (itemIds.length === 0) return { data: [], error: null }

    let query = supabase
      .from('store_items')
      .select(STORE_ITEM_CATALOG_SELECT)
      .in('id', itemIds)
      .order('created_at', { ascending: false })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const result = await listStoreProductRows('list-store-products-by-ids', 'Secili magaza urunlerini listeleme', query as any)
    if (result.error) return result

    const orderMap = new Map(itemIds.map((id, index) => [id, index]))
    return {
      data: [...result.data].sort((left, right) => (orderMap.get(left.id) ?? 9999) - (orderMap.get(right.id) ?? 9999)),
      error: null,
    }
}

export async function listStoreProductsByIdentifiers(identifiers: string[], includeInactive = true): Promise<{ data: StoreItem[]; error: unknown }> {
    if (identifiers.length === 0) return { data: [], error: null }

    let query = supabase
      .from('store_items')
      .select(STORE_ITEM_CATALOG_SELECT)
      .in('identifier', identifiers)
      .order('created_at', { ascending: false })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const result = await listStoreProductRows('list-store-products-by-identifiers', 'Kimlige gore magaza urunlerini listeleme', query as any)
    if (result.error) return result

    const orderMap = new Map(identifiers.map((identifier, index) => [identifier, index]))
    return {
      data: [...result.data].sort((left, right) => (orderMap.get(left.identifier || '') ?? 9999) - (orderMap.get(right.identifier || '') ?? 9999)),
      error: null,
    }
}

export async function listPurchasableBadgesAsStoreItems(): Promise<{ data: StoreItem[]; error: unknown }> {
    const requestContext = createRequestContext('storeService.catalog', 'list-purchasable-badges')
    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('badges')
                .select(PURCHASABLE_BADGE_SELECT)
                .eq('category', 'purchasable')
                .eq('is_active', true)
                .order('price', { ascending: true }),
            signal,
        ),
        { label: 'Satin alinabilir rozetleri listeleme' },
    )

    if (error) {
        if (!isAbortError(error)) {
            storeCatalogLogger.error({
                event: 'list-purchasable-badges-failed',
                message: toUserFacingErrorMessage(error, 'Satin alinabilir rozetler yuklenemedi.'),
                context: toRequestContextLogContext(requestContext),
                error,
            })
            return { data: [], error }
        }
        return { data: [], error: null }
    }

    const storeItems: StoreItem[] = (data ?? []).map((badge: BadgeRow) => ({
        id: badge.id,
        name: badge.name,
        description: badge.description || '',
        price: badge.price || 0,
        currency: 'Coin',
        type: 'badge',
        image: resolveStoreAssetUrl(badge.image_url) || badge.image_url,
        isActive: badge.is_active,
        isNew: false,
        isPopular: badge.rarity === 'epic' || badge.rarity === 'legendary',
        isOwned: false,
        icon:
            badge.rarity === 'legendary'
                ? '\u{1F451}'
                : badge.rarity === 'epic'
                  ? '\u{1F48E}'
                  : badge.rarity === 'rare'
                    ? '\u2728'
                    : '\u{1F3C5}',
    }))

    return { data: storeItems, error: null }
}

export async function listAllStoreProducts(includeInactive = false): Promise<{ data: StoreItem[]; error: unknown }> {
    const [storeResult, badgeResult] = await Promise.all([
        listStoreProducts(includeInactive),
        listPurchasableBadgesAsStoreItems(),
    ])

    if (storeResult.error && badgeResult.error) {
        return { data: [], error: storeResult.error }
    }

    return {
        data: [...storeResult.data, ...badgeResult.data],
        error: null,
    }
}


