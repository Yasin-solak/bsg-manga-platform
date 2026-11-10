import { supabase } from '@/services/supabase'
import { buildStoreProfileEffectAssetPayload, mapRowToStoreProfileEffectAsset } from './shared'
import type { StoreProfileEffectAssetRecord, StoreProfileEffectAssetRow, UpsertStoreProfileEffectAssetsInput } from './types'

const STORE_PROFILE_EFFECT_ASSET_SELECT = 'item_id, poster_asset_url, modal_backdrop_asset_url, card_intro_asset_url, card_loop_asset_url, profile_asset_url, profile_intro_asset_url, profile_loop_asset_url, hover_asset_url, hover_intro_asset_url, hover_loop_asset_url, media_meta, effect_manifest, is_active, created_at, updated_at'

export async function upsertStoreProfileEffectAssets(input: UpsertStoreProfileEffectAssetsInput): Promise<{ data: StoreProfileEffectAssetRecord | null; error: unknown }> {
  let payload
  try {
    payload = buildStoreProfileEffectAssetPayload(input)
  } catch (error) {
    return { data: null, error }
  }

  const { data, error } = await supabase
    .from('store_profile_effect_assets')
    .upsert(payload, { onConflict: 'item_id' })
    .select(STORE_PROFILE_EFFECT_ASSET_SELECT)
    .single()

  if (error) {
    console.error('[storeProfileEffectService] upsertStoreProfileEffectAssets error', error)
    return { data: null, error }
  }

  return {
    data: data ? mapRowToStoreProfileEffectAsset(data as StoreProfileEffectAssetRow) : null,
    error: null,
  }
}
