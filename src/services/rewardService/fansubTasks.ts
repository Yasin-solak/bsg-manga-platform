/**
 * fansubTasks: fansub quest system service
 *
 * Lets fansub admins see quest progress and
 * claim rewards for completed quests.
 */

import { isFeatureEnabled } from '../featureFlagService'
import { supabase } from '../supabase'
import type { DbUserTaskProgressRow, RpcClaimResult } from './shared'
import type { UserRewardTaskProgress, ClaimUserRewardTaskResult } from './types'

const FANSUB_TASKS_FEATURE_KEY = 'rewards.fansub_tasks'

async function ensureFansubTasksEnabled() {
    const enabled = await isFeatureEnabled(FANSUB_TASKS_FEATURE_KEY, false)
    if (!enabled) {
        throw new Error('Fansub gorev sistemi su anda aktif degil.')
    }
}

/** Lists all quests of a fansub with progress */
export async function listFansubRewardTasks(fansubId: string) {
    await ensureFansubTasksEnabled()

    const { data, error } = await supabase.rpc('list_fansub_reward_tasks', {
        p_fansub_id: fansubId,
    })
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

/** Claim a fansub quest reward */
export async function claimFansubRewardTask(fansubId: string, taskId: string) {
    await ensureFansubTasksEnabled()

    const { data, error } = await supabase.rpc('claim_fansub_reward_task', {
        p_fansub_id: fansubId,
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

