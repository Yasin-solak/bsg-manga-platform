import { supabase } from '@/services/supabase'
import { mapRowToStoreProfileEffectAsset } from './shared'
import type { StoreProfileEffectAssetRecord, StoreProfileEffectAssetRow } from './types'

const STORE_PROFILE_EFFECT_ASSET_SELECT = 'item_id, poster_asset_url, modal_backdrop_asset_url, card_intro_asset_url, card_loop_asset_url, profile_asset_url, profile_intro_asset_url, profile_loop_asset_url, hover_asset_url, hover_intro_asset_url, hover_loop_asset_url, media_meta, effect_manifest, is_active, created_at, updated_at'
const STORE_PROFILE_EFFECT_ASSET_LEGACY_SELECT = 'item_id, poster_asset_url, card_intro_asset_url, card_loop_asset_url, profile_asset_url, profile_intro_asset_url, profile_loop_asset_url, hover_asset_url, hover_intro_asset_url, hover_loop_asset_url, media_meta, is_active, created_at, updated_at'

function isSchemaCacheColumnError(error: unknown) {
  const serialized = (typeof error === 'string' ? error : JSON.stringify(error) ?? '').toLocaleLowerCase('tr')
  return serialized.includes('schema cache')
    || serialized.includes('modal_backdrop_asset_url')
    || serialized.includes('effect_manifest')
    || serialized.includes('pgrst204')
}

function fetchStoreProfileEffectRows(selectColumns: string, itemIds?: string[]) {
  let query = supabase
    .from('store_profile_effect_assets')
    .select(selectColumns)
    .order('created_at', { ascending: false })

  if (itemIds && itemIds.length > 0) {
    query = query.in('item_id', itemIds)
  }

  return query
}

function normalizeLegacyRow(row: Partial<StoreProfileEffectAssetRow>): StoreProfileEffectAssetRow {
  return {
    item_id: row.item_id ?? '',
    poster_asset_url: row.poster_asset_url ?? '',
    modal_backdrop_asset_url: row.modal_backdrop_asset_url ?? null,
    card_intro_asset_url: row.card_intro_asset_url ?? null,
    card_loop_asset_url: row.card_loop_asset_url ?? '',
    profile_asset_url: row.profile_asset_url ?? '',
    profile_intro_asset_url: row.profile_intro_asset_url ?? null,
    profile_loop_asset_url: row.profile_loop_asset_url ?? '',
    hover_asset_url: row.hover_asset_url ?? '',
    hover_intro_asset_url: row.hover_intro_asset_url ?? null,
    hover_loop_asset_url: row.hover_loop_asset_url ?? '',
    media_meta: row.media_meta ?? null,
    effect_manifest: row.effect_manifest ?? null,
    is_active: row.is_active ?? true,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  }
}

export async function listStoreProfileEffectAssets(itemIds?: string[]): Promise<{ data: StoreProfileEffectAssetRecord[]; error: unknown }> {
  const { data, error } = await fetchStoreProfileEffectRows(STORE_PROFILE_EFFECT_ASSET_SELECT, itemIds)

  if (error) {
    if (isSchemaCacheColumnError(error)) {
      const legacyResult = await fetchStoreProfileEffectRows(STORE_PROFILE_EFFECT_ASSET_LEGACY_SELECT, itemIds)
      if (!legacyResult.error) {
        return {
          data: ((legacyResult.data as unknown as Partial<StoreProfileEffectAssetRow>[] | null) ?? [])
            .map(normalizeLegacyRow)
            .map(mapRowToStoreProfileEffectAsset),
          error: null,
        }
      }
    }

    console.error('[storeProfileEffectService] listStoreProfileEffectAssets error', error)
    return { data: [], error }
  }

  return {
    data: ((data as unknown as StoreProfileEffectAssetRow[] | null) ?? []).map(mapRowToStoreProfileEffectAsset),
    error: null,
  }
}

export async function getStoreProfileEffectAssetMap(itemIds?: string[]) {
  const result = await listStoreProfileEffectAssets(itemIds)
  return {
    data: new Map(result.data.map((asset) => [asset.itemId, asset])),
    error: result.error,
  }
}
