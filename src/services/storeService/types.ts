import type { StoreItem, StoreItemType, StoreProfileEffectAssets } from '@/data/storeProducts'

export type Currency = StoreItem['currency']

export interface StoreItemRow {
    id: string
    name: string
    description: string | null
    identifier: string
    type: StoreItemType
    price: number
    original_price: number | null
    currency: Currency
    image_key: string | null
    custom_asset_url: string | null
    poster_asset_url: string | null
    theme_name: string | null
    is_active: boolean
    created_at: string
    purchase_count: number
}

export interface StoreProfileEffectAssetRow {
    item_id: string
    poster_asset_url: string
    profile_intro_asset_url: string
    profile_loop_asset_url: string
    hover_intro_asset_url: string
    hover_loop_asset_url: string
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface StoreProfileEffectAssetRecord extends StoreProfileEffectAssets {
    itemId: string
    createdAt: string
    updatedAt: string
}

export interface BadgeRow {
    id: string
    name: string
    description: string | null
    image_url: string
    category: string
    subcategory: string | null
    price: number | null
    rarity: string
    is_active: boolean
    target_type: string
}

export type { StoreItem, StoreItemType }
