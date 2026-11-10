import type {
  DbAdminFansubInventoryRow,
  DbAdminFansubMemberHistoryRow,
  DbAdminFansubRow,
  DbAdminFansubTransactionRow,
} from './shared.db'
import { getSingleRelation } from './shared.utils'
import type {
  AdminFansubInventoryItem,
  AdminFansubMemberHistoryRecord,
  AdminFansubTransactionRecord,
  AdminFansubTransactionType,
  AdminManagedFansub,
} from './types'
import { mapDbStoreItemRelation, mapDbUserRelation } from './shared.mappers.relations'

export function mapDbAdminFansub(row: DbAdminFansubRow): AdminManagedFansub {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    avatarUrl: row.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${row.slug || row.name}`,
    description: row.description || '',
    isActive: row.is_active !== false,
    mangaCount: row.manga_count || 0,
    followerCount: row.follower_count || 0,
    coinBalance: row.coin_balance || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDbAdminFansubMemberHistoryRow(row: DbAdminFansubMemberHistoryRow): AdminFansubMemberHistoryRecord {
  const userRow = getSingleRelation(row.user)
  const endedByRow = getSingleRelation(row.ended_by_user)

  return {
    id: row.id,
    fansubId: row.fansub_id,
    userId: row.user_id ?? undefined,
    role: row.role,
    teamTag: row.team_tag ?? undefined,
    joinedAt: row.joined_at,
    leftAt: row.left_at ?? undefined,
    leftReason: row.left_reason,
    endedByUserId: row.ended_by_user_id ?? undefined,
    user: userRow
      ? {
        id: userRow.id,
        username: userRow.username,
        avatarUrl: userRow.avatar_url ?? undefined,
      }
      : undefined,
    endedByUser: endedByRow
      ? {
        id: endedByRow.id,
        username: endedByRow.username,
      }
      : undefined,
  }
}

export function mapDbAdminFansubInventoryRow(row: DbAdminFansubInventoryRow): AdminFansubInventoryItem {
  return {
    id: row.id,
    fansubId: row.fansub_id,
    storeItemId: row.store_item_id,
    acquiredAt: row.acquired_at,
    acquiredByUserId: row.acquired_by ?? undefined,
    storeItem: mapDbStoreItemRelation(row.store_item),
    acquiredByUser: mapDbUserRelation(row.acquired_by_user),
  }
}

export function mapDbAdminFansubTransactionRow(row: DbAdminFansubTransactionRow): AdminFansubTransactionRecord {
  return {
    id: row.id,
    fansubId: row.fansub_id,
    amount: row.amount || 0,
    type: (row.type || 'system') as AdminFansubTransactionType,
    description: row.description || '-',
    relatedItemId: row.related_item_id ?? undefined,
    createdByUserId: row.created_by ?? undefined,
    createdAt: row.created_at,
    relatedItem: mapDbStoreItemRelation(row.related_item),
    createdByUser: mapDbUserRelation(row.created_by_user),
  }
}
