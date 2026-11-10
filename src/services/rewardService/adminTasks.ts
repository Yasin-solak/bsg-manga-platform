import { supabase } from '../supabase'
import { DbBadgeRow, DbTaskRow, mapTaskRow } from './shared'
import type { RewardBadgeOption } from './types'

type AdminTaskPatch = {
  title?: string
  description?: string
  metricKey?: string
  targetValue?: number
  coinReward?: number
  badgeId?: string | null
  isActive?: boolean
  sortOrder?: number
  taskGroup?: string
  tierLevel?: number
  unlockTaskId?: string | null
}

type AdminTaskInput = {
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  coinReward: number
  badgeId?: string | null
  sortOrder?: number
  taskGroup?: string
  tierLevel?: number
  unlockTaskId?: string | null
}

const ADMIN_TASK_SELECT = 'id, slug, title, description, metric_key, target_value, coin_reward, badge_id, is_active, sort_order, task_group, tier_level, unlock_requires_task_id, created_at, updated_at'

function normalizeTaskPatch(patch: AdminTaskPatch) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (patch.title != null) payload.title = patch.title
  if (patch.description != null) payload.description = patch.description
  if (patch.metricKey != null) payload.metric_key = patch.metricKey
  if (patch.targetValue != null) payload.target_value = Math.max(1, Math.floor(patch.targetValue))
  if (patch.coinReward != null) payload.coin_reward = Math.max(0, Math.floor(patch.coinReward))
  if (patch.badgeId !== undefined) payload.badge_id = patch.badgeId
  if (patch.isActive != null) payload.is_active = patch.isActive
  if (patch.sortOrder != null) payload.sort_order = Math.max(0, Math.floor(patch.sortOrder))
  if (patch.taskGroup != null) payload.task_group = patch.taskGroup.trim() || 'default'
  if (patch.tierLevel != null) payload.tier_level = Math.max(1, Math.min(3, Math.floor(patch.tierLevel)))
  if (patch.unlockTaskId !== undefined) payload.unlock_requires_task_id = patch.unlockTaskId || null

  return payload
}

function normalizeTaskInput(input: AdminTaskInput) {
  return {
    slug: input.slug.trim().toLowerCase().replace(/\s+/g, '-'),
    title: input.title.trim(),
    description: input.description.trim(),
    metric_key: input.metricKey,
    target_value: Math.max(1, Math.floor(input.targetValue)),
    coin_reward: Math.max(0, Math.floor(input.coinReward)),
    badge_id: input.badgeId || null,
    sort_order: Math.max(0, Math.floor(input.sortOrder || 0)),
    task_group: input.taskGroup?.trim() || 'default',
    tier_level: Math.max(1, Math.min(3, Math.floor(input.tierLevel || 1))),
    unlock_requires_task_id: input.unlockTaskId || null,
    is_active: true,
  }
}

async function loadBadgeMap(taskRows: DbTaskRow[]) {
  const badgeIds = Array.from(
    new Set(taskRows.map((row) => row.badge_id).filter((value): value is string => Boolean(value))),
  )
  const badgeMap = new Map<string, DbBadgeRow>()

  if (badgeIds.length === 0) return badgeMap

  const { data: badgeRows, error: badgeError } = await supabase
    .from('badges')
    .select('id, name, image_url')
    .in('id', badgeIds)

  if (badgeError) throw badgeError

  ;((badgeRows || []) as DbBadgeRow[]).forEach((row) => badgeMap.set(row.id, row))
  return badgeMap
}

export async function listAdminUserRewardTasks() {
  const { data, error } = await supabase
    .from('user_reward_tasks')
    .select(ADMIN_TASK_SELECT)
    .order('tier_level', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  const taskRows = (data || []) as DbTaskRow[]
  const badgeMap = await loadBadgeMap(taskRows)
  return taskRows.map((row) => mapTaskRow(row, badgeMap))
}

export async function listRewardBadgeOptions() {
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, image_url, category, target_type, is_active')
    .eq('is_active', true)
    .eq('category', 'achievement')
    .in('target_type', ['user', 'both'])
    .order('name', { ascending: true })

  if (error) throw error

  return ((data || []) as Array<{ id: string; name: string | null; image_url: string | null }>).map((row) => ({
    id: row.id,
    name: row.name?.trim() || 'Rozet',
    imageUrl: row.image_url,
  })) as RewardBadgeOption[]
}

export async function saveAdminUserRewardTask(taskId: string, patch: AdminTaskPatch) {
  const payload = normalizeTaskPatch(patch)

  const { error } = await supabase
    .from('user_reward_tasks')
    .update(payload)
    .eq('id', taskId)

  if (error) throw error
}

export async function createAdminUserRewardTask(input: AdminTaskInput) {
  const payload = normalizeTaskInput(input)

  const { data, error } = await supabase
    .from('user_reward_tasks')
    .insert(payload)
    .select(ADMIN_TASK_SELECT)
    .single<DbTaskRow>()

  if (error) throw error
  return mapTaskRow(data, new Map())
}

export async function deleteAdminUserRewardTask(taskId: string) {
  const { error } = await supabase
    .from('user_reward_tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw error
}

export async function listAdminFansubRewardTasks() {
  const { data, error } = await supabase
    .from('fansub_reward_tasks')
    .select(ADMIN_TASK_SELECT)
    .order('tier_level', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error

  const taskRows = (data || []) as DbTaskRow[]
  const badgeMap = await loadBadgeMap(taskRows)
  return taskRows.map((row) => mapTaskRow(row, badgeMap))
}

export async function createAdminFansubRewardTask(input: AdminTaskInput) {
  const payload = normalizeTaskInput(input)

  const { data, error } = await supabase
    .from('fansub_reward_tasks')
    .insert(payload)
    .select(ADMIN_TASK_SELECT)
    .single<DbTaskRow>()

  if (error) throw error
  return mapTaskRow(data, new Map())
}

export async function saveAdminFansubRewardTask(taskId: string, patch: AdminTaskPatch) {
  const payload = normalizeTaskPatch(patch)

  const { error } = await supabase
    .from('fansub_reward_tasks')
    .update(payload)
    .eq('id', taskId)

  if (error) throw error
}

export async function deleteAdminFansubRewardTask(taskId: string) {
  const { error } = await supabase
    .from('fansub_reward_tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw error
}
