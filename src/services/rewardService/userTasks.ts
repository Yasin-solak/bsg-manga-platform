import { isFeatureEnabled } from '../featureFlagService'
import { supabase } from '../supabase'
import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { DbUserTaskProgressRow, RpcClaimResult } from './shared'
import type {
  ClaimUserRewardTaskResult,
  UserRewardTaskProgress,
} from './types'

const USER_TASKS_FEATURE_KEY = 'rewards.user_tasks'

function getE2EUserRewardTasks(): UserRewardTaskProgress[] {
  return [
    {
      taskId: 'e2e-task-reader-1',
      slug: 'e2e-1000-chapters',
      title: '1000 Bolum Arsivi',
      description: 'Okuma gecmisinde 1000 bolum barajini gecti.',
      metricKey: 'chapters_read',
      targetValue: 1000,
      progressValue: 1284,
      isCompleted: true,
      isClaimed: true,
      isClaimable: false,
      coinReward: 450,
      badgeId: 'reader-gold',
      badgeName: 'Altin Okur',
      badgeImageUrl: '/badges/reader_gold.png',
      claimedAt: new Date(Date.UTC(2026, 4, 2)).toISOString(),
      sortOrder: 1,
      taskGroup: 'Okuma',
      tierLevel: 4,
      isLocked: false,
      unlockTaskId: null,
      unlockTaskTitle: null,
    },
    {
      taskId: 'e2e-task-comment-1',
      slug: 'e2e-comment-signal',
      title: 'Yorum Izi',
      description: 'Toplulukta duzenli yorum ve geri bildirim biriktirdi.',
      metricKey: 'comments',
      targetValue: 250,
      progressValue: 318,
      isCompleted: true,
      isClaimed: true,
      isClaimable: false,
      coinReward: 260,
      badgeId: 'comment-hero',
      badgeName: 'Yorum Kahramani',
      badgeImageUrl: '/badges/achievement_comment_hero.png',
      claimedAt: new Date(Date.UTC(2026, 4, 4)).toISOString(),
      sortOrder: 2,
      taskGroup: 'Topluluk',
      tierLevel: 3,
      isLocked: false,
      unlockTaskId: null,
      unlockTaskTitle: null,
    },
  ]
}

async function ensureUserTasksEnabled() {
  const isUserTasksFeatureEnabled = await isFeatureEnabled(USER_TASKS_FEATURE_KEY, false)
  if (!isUserTasksFeatureEnabled) {
    throw new Error('Kullanici gorev sistemi su anda aktif degil.')
  }
}

export async function listUserRewardTasks() {
  if (isE2EModeEnabled()) return getE2EUserRewardTasks()

  await ensureUserTasksEnabled()

  const { data, error } = await supabase.rpc('list_user_reward_tasks')
  if (error) throw error

  return ((data || []) as DbUserTaskProgressRow[]).map((row) => ({
    taskId: row.task_id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    metricKey: row.metric_key,
    targetValue: Number(row.target_value || 0),
    progressValue: Number(row.progress_value || 0),
    isCompleted: row.is_completed === true,
    isClaimed: row.is_claimed === true,
    isClaimable: row.is_claimable === true,
    coinReward: Number(row.coin_reward || 0),
    badgeId: row.badge_id,
    badgeName: row.badge_name,
    badgeImageUrl: row.badge_image_url,
    claimedAt: row.claimed_at,
    sortOrder: Number(row.sort_order || 0),
    taskGroup: row.task_group?.trim() || 'default',
    tierLevel: Number(row.tier_level || 1),
    isLocked: row.is_locked === true,
    unlockTaskId: row.unlock_task_id || null,
    unlockTaskTitle: row.unlock_task_title || null,
  })) as UserRewardTaskProgress[]
}

export async function claimUserRewardTask(taskId: string) {
  await ensureUserTasksEnabled()

  const { data, error } = await supabase.rpc('claim_user_reward_task', {
    p_task_id: taskId,
  })
  if (error) throw error

  const row = (data || {}) as RpcClaimResult
  return {
    success: row.success !== false,
    taskId: row.task_id || taskId,
    taskSlug: row.task_slug || '',
    taskTitle: row.task_title || '',
    coinReward: Number(row.coin_reward || 0),
    newBalance: Number(row.new_balance || 0),
    badgeId: row.badge_id || null,
    badgeName: row.badge_name || null,
    badgeAwarded: row.badge_awarded === true,
    claimedAt: row.claimed_at || new Date().toISOString(),
  } as ClaimUserRewardTaskResult
}
