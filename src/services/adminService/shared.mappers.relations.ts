import { resolveStoreAssetUrl } from '../assetUrlService'
import type {
  DbAdminStoreItemRelation,
  DbAdminUserRelation,
} from './shared.db'
import { getSingleRelation } from './shared.utils'

export function mapDbStoreItemRelation(value: DbAdminStoreItemRelation | DbAdminStoreItemRelation[] | null | undefined) {
  const row = getSingleRelation(value)
  if (!row) return undefined

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    identifier: row.identifier,
    imageUrl: resolveStoreAssetUrl(row.custom_asset_url || row.image_key) || undefined,
    isActive: row.is_active !== false,
  }
}

export function mapDbUserRelation(value: DbAdminUserRelation | DbAdminUserRelation[] | null | undefined) {
  const row = getSingleRelation(value)
  if (!row) return undefined

  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url || undefined,
  }
}
