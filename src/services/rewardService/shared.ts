import type {
  AdminUserRewardTask,
  FansubMonthlyRewardPreviewRow,
  FansubRewardRankRule,
  FansubRewardViewTier,
} from './types'

export type DbRankRuleRow = {
  id: string
  rank_position: number | null
  coin_reward: number | null
  is_active: boolean | null
  created_at: string
  updated_at: string
}

export type DbViewTierRow = {
  id: string
  label: string | null
  min_views: number | null
  coin_reward: number | null
  is_active: boolean | null
  created_at: string
  updated_at: string
}

export type DbPreviewRow = {
  fansub_id: string
  fansub_name: string | null
  total_views: number | null
  rank_position: number | null
  rank_coin_reward: number | null
  tier_coin_reward: number | null
  total_coin_reward: number | null
  tier_labels: string[] | null
}

export type DbRunRow = {
  id: string
  month_start: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  run_by: string | null
  total_fansubs: number | null
  total_coin: number | null
  created_at: string
  updated_at: string
}

export type DbTaskRow = {
  id: string
  slug: string
  title: string
  description: string | null
  metric_key: string
  target_value: number | null
  coin_reward: number | null
  badge_id: string | null
  is_active: boolean | null
  sort_order: number | null
  task_group?: string | null
  tier_level?: number | null
  unlock_requires_task_id?: string | null
  created_at: string
  updated_at: string
}

export type DbBadgeRow = {
  id: string
  name: string | null
  image_url: string | null
}

export type DbUserTaskProgressRow = {
  task_id: string
  slug: string
  title: string
  description: string | null
  metric_key: string
  target_value: number | null
  progress_value: number | null
  is_completed: boolean | null
  is_claimed: boolean | null
  is_claimable: boolean | null
  coin_reward: number | null
  badge_id: string | null
  badge_name: string | null
  badge_image_url: string | null
  claimed_at: string | null
  sort_order: number | null
  task_group: string | null
  tier_level: number | null
  is_locked: boolean | null
  unlock_task_id: string | null
  unlock_task_title: string | null
}

export type DbDailyTopMangaRow = {
  id: string
  title: string | null
  cover_image_url: string | null
  last_chapter_number: number | null
  rating: number | null
  total_views: number | null
  recent_views: number | null
}

export type RpcRunResult = {
  success?: boolean
  already_completed?: boolean
  run_id?: string
  month_start?: string
  month_label?: string
  total_fansubs?: number
  total_coin?: number
}

export type RpcClaimResult = {
  success?: boolean
  task_id?: string
  task_slug?: string
  task_title?: string
  coin_reward?: number
  new_balance?: number
  badge_id?: string | null
  badge_name?: string | null
  badge_awarded?: boolean
  claimed_at?: string
}

export function parseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function normalizeMonthStart(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return null
}

export function mapRankRuleRow(row: DbRankRuleRow): FansubRewardRankRule {
  return {
    id: row.id,
    rankPosition: Number(row.rank_position || 0),
    coinReward: Number(row.coin_reward || 0),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapViewTierRow(row: DbViewTierRow): FansubRewardViewTier {
  return {
    id: row.id,
    label: row.label?.trim() || 'Tier',
    minViews: Number(row.min_views || 0),
    coinReward: Number(row.coin_reward || 0),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapPreviewRow(row: DbPreviewRow): FansubMonthlyRewardPreviewRow {
  return {
    fansubId: row.fansub_id,
    fansubName: row.fansub_name?.trim() || 'Bilinmeyen Fansub',
    totalViews: Number(row.total_views || 0),
    rankPosition: row.rank_position != null ? Number(row.rank_position) : null,
    rankCoinReward: Number(row.rank_coin_reward || 0),
    tierCoinReward: Number(row.tier_coin_reward || 0),
    totalCoinReward: Number(row.total_coin_reward || 0),
    tierLabels: Array.isArray(row.tier_labels) ? row.tier_labels : [],
  }
}

export function mapTaskRow(row: DbTaskRow, badgeMap: Map<string, DbBadgeRow>): AdminUserRewardTask {
  const badge = row.badge_id ? badgeMap.get(row.badge_id) : undefined
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    metricKey: row.metric_key,
    targetValue: Number(row.target_value || 0),
    coinReward: Number(row.coin_reward || 0),
    badgeId: row.badge_id,
    badgeName: badge?.name || null,
    badgeImageUrl: badge?.image_url || null,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    taskGroup: row.task_group?.trim() || 'default',
    tierLevel: Number(row.tier_level || 1),
    unlockTaskId: row.unlock_requires_task_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
