/**
 * quests: unified quest engine service (Phase 1)
 *
 * Reads and claims user and fansub quests with one RPC pair (list_quests / claim_quest).
 * The old userTasks/fansubTasks services stay alongside until the UI moves;
 * this module is the new engine's client gateway.
 */

import { isFeatureEnabled } from '../featureFlagService'
import { supabase } from '../supabase'
import type { ClaimQuestResult, Quest, QuestAudience, QuestKind, QuestRewardKind } from './types'
import { txa } from '@/i18n/activeLocale'

const USER_TASKS_FEATURE_KEY = 'rewards.user_tasks'
const FANSUB_TASKS_FEATURE_KEY = 'rewards.fansub_tasks'

interface QuestRow {
  quest_id: string
  slug: string
  title: string
  description: string | null
  audience: string
  kind: string
  metric_key: string
  target_value: number | string
  progress_value: number | string
  is_completed: boolean
  is_claimed: boolean
  is_claimable: boolean
  is_locked: boolean
  reward_kind: string
  coin_reward: number | string
  badge_id: string | null
  badge_name: string | null
  badge_image_url: string | null
  reward_item_id: string | null
  reward_item_name: string | null
  reward_item_type: string | null
  reward_item_image: string | null
  boost_credit: number | string
  gate_metric_key: string | null
  gate_min_value: number | string | null
  gate_progress_value: number | string | null
  gate_met: boolean
  task_group: string | null
  tier_level: number | string
  unlock_quest_id: string | null
  unlock_quest_title: string | null
  period_key: string
  claimed_at: string | null
  sort_order: number | string
  starts_at: string | null
  ends_at: string | null
}

interface ClaimQuestRow {
  success?: boolean
  quest_id?: string
  quest_slug?: string
  quest_title?: string
  kind?: string
  audience?: string
  period_key?: string
  coin_reward?: number | string
  new_balance?: number | string
  badge_id?: string | null
  badge_name?: string | null
  badge_awarded?: boolean
  reward_item_id?: string | null
  item_granted?: boolean
  claimed_at?: string
}

function questFeatureKey(audience: QuestAudience) {
  return audience === 'fansub' ? FANSUB_TASKS_FEATURE_KEY : USER_TASKS_FEATURE_KEY
}

async function ensureQuestsEnabled(audience: QuestAudience) {
  const enabled = await isFeatureEnabled(questFeatureKey(audience), false)
  if (!enabled) {
    throw new Error(
      audience === 'fansub'
        ? 'Fansub gorev sistemi su anda aktif degil.'
        : 'Kullanici gorev sistemi su anda aktif degil.',
    )
  }
}

function nullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapQuestRow(row: QuestRow): Quest {
  return {
    questId: row.quest_id,
    slug: row.slug,
    title: txa(row.title),
    description: txa(row.description || ''),
    audience: (row.audience as QuestAudience) || 'user',
    kind: (row.kind as QuestKind) || 'achievement',
    metricKey: row.metric_key,
    targetValue: Number(row.target_value || 0),
    progressValue: Number(row.progress_value || 0),
    isCompleted: row.is_completed === true,
    isClaimed: row.is_claimed === true,
    isClaimable: row.is_claimable === true,
    isLocked: row.is_locked === true,
    rewardKind: (row.reward_kind as QuestRewardKind) || 'coin',
    coinReward: Number(row.coin_reward || 0),
    badgeId: row.badge_id,
    badgeName: row.badge_name,
    badgeImageUrl: row.badge_image_url,
    rewardItemId: row.reward_item_id,
    rewardItemName: row.reward_item_name,
    rewardItemType: row.reward_item_type,
    rewardItemImage: row.reward_item_image,
    boostCredit: Number(row.boost_credit || 0),
    gateMetricKey: row.gate_metric_key,
    gateMinValue: nullableNumber(row.gate_min_value),
    gateProgressValue: nullableNumber(row.gate_progress_value),
    gateMet: row.gate_met === true,
    taskGroup: row.task_group?.trim() || 'default',
    tierLevel: Number(row.tier_level || 1),
    unlockQuestId: row.unlock_quest_id || null,
    unlockQuestTitle: row.unlock_quest_title ? txa(row.unlock_quest_title) : null,
    periodKey: row.period_key || 'lifetime',
    claimedAt: row.claimed_at || null,
    sortOrder: Number(row.sort_order || 0),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
  }
}

/** Lists all quests of a subject (user or fansub) with progress. */
export async function listQuests(audience: QuestAudience, subjectId?: string): Promise<Quest[]> {
  await ensureQuestsEnabled(audience)

  const { data, error } = await supabase.rpc('list_quests', {
    p_audience: audience,
    p_subject_id: subjectId ?? null,
  })
  if (error) throw error

  return ((data || []) as QuestRow[]).map(mapQuestRow)
}

/** Claims the reward of a completed quest (additive: coin + badge + cosmetic). */
export async function claimQuest(
  questId: string,
  audience: QuestAudience,
  subjectId?: string,
): Promise<ClaimQuestResult> {
  await ensureQuestsEnabled(audience)

  const { data, error } = await supabase.rpc('claim_quest', {
    p_quest_id: questId,
    p_subject_id: subjectId ?? null,
  })
  if (error) throw error

  const row = (data || {}) as ClaimQuestRow
  return {
    success: row.success !== false,
    questId: row.quest_id || questId,
    questSlug: row.quest_slug || '',
    questTitle: txa(row.quest_title || ''),
    kind: (row.kind as QuestKind) || 'achievement',
    audience: (row.audience as QuestAudience) || audience,
    periodKey: row.period_key || 'lifetime',
    coinReward: Number(row.coin_reward || 0),
    newBalance: Number(row.new_balance || 0),
    badgeId: row.badge_id || null,
    badgeName: row.badge_name || null,
    badgeAwarded: row.badge_awarded === true,
    rewardItemId: row.reward_item_id || null,
    itemGranted: row.item_granted === true,
    claimedAt: row.claimed_at || new Date().toISOString(),
  }
}
