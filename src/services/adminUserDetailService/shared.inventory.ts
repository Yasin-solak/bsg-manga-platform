import { supabase } from '../supabase'
import type {
  AdminInventoryItemType,
  AdminUserInventoryItem,
} from '../adminUserTypes'
import type {
  DbStoreItemMiniRow,
  OwnedItemsPayload,
} from './shared.db'
import { isUuid } from './shared.utils'

function normalizeInventoryRef(value: string) {
  return value.trim()
}

function fallbackInventoryName(ref: string) {
  return ref.replace(/[-_]+/g, ' ').trim() || ref
}

export async function listStoreItemsForOwnedRefs(owned: OwnedItemsPayload) {
  const allRefs = Array.from(new Set([
    ...owned.frames,
    ...owned.backgrounds,
    ...owned.patterns,
    ...owned.badges,
    ...owned.premium,
  ].map(normalizeInventoryRef).filter(Boolean)))

  if (allRefs.length === 0) return [] as DbStoreItemMiniRow[]

  const idRefs = allRefs.filter(isUuid)
  const identifierRefs = allRefs.filter((ref) => !isUuid(ref))

  const [byIdResult, byIdentifierResult] = await Promise.all([
    idRefs.length > 0
      ? supabase.from('store_items').select('id, type, name, identifier').in('id', idRefs)
      : Promise.resolve({ data: [], error: null }),
    identifierRefs.length > 0
      ? supabase.from('store_items').select('id, type, name, identifier').in('identifier', identifierRefs)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (byIdResult.error) throw byIdResult.error
  if (byIdentifierResult.error) throw byIdentifierResult.error

  const dedup = new Map<string, DbStoreItemMiniRow>()
  ;[
    ...((byIdResult.data || []) as DbStoreItemMiniRow[]),
    ...((byIdentifierResult.data || []) as DbStoreItemMiniRow[]),
  ].forEach((row) => dedup.set(row.id, row))
  return Array.from(dedup.values())
}

function resolveInventoryItem(
  ref: string,
  expectedType: AdminInventoryItemType,
  byId: Map<string, DbStoreItemMiniRow>,
  byTypedIdentifier: Map<string, DbStoreItemMiniRow>,
): AdminUserInventoryItem {
  const normalized = normalizeInventoryRef(ref)
  if (!normalized) return { type: expectedType, ref: '', name: '-' }

  let item: DbStoreItemMiniRow | undefined
  if (isUuid(normalized)) {
    const maybeItem = byId.get(normalized)
    if (maybeItem && maybeItem.type === expectedType) item = maybeItem
  } else {
    item = byTypedIdentifier.get(`${expectedType}:${normalized.toLowerCase()}`)
  }

  if (item) {
    return {
      type: item.type,
      ref: normalized,
      name: item.name,
      storeItemId: item.id,
      identifier: item.identifier,
    }
  }

  return { type: expectedType, ref: normalized, name: fallbackInventoryName(normalized) }
}

export function mapInventoryList(
  refs: string[],
  expectedType: AdminInventoryItemType,
  byId: Map<string, DbStoreItemMiniRow>,
  byTypedIdentifier: Map<string, DbStoreItemMiniRow>,
) {
  return refs.map((ref) => resolveInventoryItem(ref, expectedType, byId, byTypedIdentifier))
}
