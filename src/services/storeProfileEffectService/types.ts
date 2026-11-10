import type { StoreProfileEffectAssets, StoreProfileEffectMediaMeta } from '@/data/storeProducts'

export interface StoreProfileEffectAssetRow {
  item_id: string
  poster_asset_url: string
  modal_backdrop_asset_url: string | null
  card_intro_asset_url: string | null
  card_loop_asset_url: string
  profile_asset_url: string
  profile_intro_asset_url: string | null
  profile_loop_asset_url: string
  hover_asset_url: string
  hover_intro_asset_url: string | null
  hover_loop_asset_url: string
  media_meta: StoreProfileEffectMediaMeta | null
  effect_manifest: unknown
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StoreProfileEffectAssetRecord extends StoreProfileEffectAssets {
  itemId: string
  createdAt: string
  updatedAt: string
}

export interface UpsertStoreProfileEffectAssetsInput extends StoreProfileEffectAssets {
  itemId: string
}
