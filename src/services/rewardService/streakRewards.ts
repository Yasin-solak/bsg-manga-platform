import { supabase } from '../supabase'
import type {
  AdminReadingStreakRewardClaim,
  AdminReadingStreakRewardDashboard,
  AdminReadingStreakRewardRule,
  ClaimReadingStreakRewardsResult,
  ReadingStreakRecentReward,
  ReadingStreakRewardPreview,
  ReadingStreakRewardRecurrence,
  ReadingStreakRewardTriggerType,
  ReadingStreakSummary,
  ReadingStreakWeekDay,
} from './types'

type AdminRuleInput = {
  id?: string | null
  slug: string
  title: string
  description: string
  triggerType: ReadingStreakRewardTriggerType
  targetValue: number
  coinReward: number
  isActive: boolean
  sortOrder: number
}

const TRIGGER_TYPES: ReadingStreakRewardTriggerType[] = [
  'daily_read',
  'streak_milestone',
  'weekly_active_days',
]

const RECURRENCES: ReadingStreakRewardRecurrence[] = ['daily', 'weekly', 'once']

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeTriggerType(value: unknown): ReadingStreakRewardTriggerType {
  return TRIGGER_TYPES.includes(value as ReadingStreakRewardTriggerType)
    ? (value as ReadingStreakRewardTriggerType)
    : 'streak_milestone'
}

function normalizeRecurrence(value: unknown): ReadingStreakRewardRecurrence {
  return RECURRENCES.includes(value as ReadingStreakRewardRecurrence)
    ? (value as ReadingStreakRewardRecurrence)
    : 'once'
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function arrayFromJson(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function mapRewardPreview(row: unknown): ReadingStreakRewardPreview {
  const payload = (row || {}) as Record<string, unknown>
  return {
    ruleId: toString(payload.ruleId || payload.rule_id),
    slug: toString(payload.slug),
    title: toString(payload.title, 'Okuma odulu'),
    description: toString(payload.description),
    triggerType: normalizeTriggerType(payload.triggerType || payload.trigger_type),
    targetValue: Math.max(1, toNumber(payload.targetValue || payload.target_value, 1)),
    progressValue: Math.max(0, toNumber(payload.progressValue || payload.progress_value)),
    coinReward: Math.max(0, toNumber(payload.coinReward || payload.coin_reward)),
    recurrence: normalizeRecurrence(payload.recurrence),
    isClaimable: payload.isClaimable === true || payload.is_claimable === true,
  }
}

function mapRecentReward(row: unknown): ReadingStreakRecentReward {
  const payload = (row || {}) as Record<string, unknown>
  return {
    claimId: toString(payload.claimId || payload.claim_id),
    ruleId: toString(payload.ruleId || payload.rule_id),
    title: toString(payload.title, 'Okuma odulu'),
    triggerType: normalizeTriggerType(payload.triggerType || payload.trigger_type),
    creditedCoin: Math.max(0, toNumber(payload.creditedCoin || payload.credited_coin)),
    streakDays: Math.max(0, toNumber(payload.streakDays || payload.streak_days)),
    activeDaysThisWeek: Math.max(0, toNumber(payload.activeDaysThisWeek || payload.active_days_this_week)),
    claimedAt: toString(payload.claimedAt || payload.claimed_at, new Date().toISOString()),
  }
}

function mapWeekDay(row: unknown): ReadingStreakWeekDay {
  const payload = (row || {}) as Record<string, unknown>
  return {
    date: toString(payload.date),
    label: toString(payload.label, 'Gun'),
    isRead: payload.isRead === true || payload.is_read === true,
    isToday: payload.isToday === true || payload.is_today === true,
  }
}

function mapReadingStreakSummary(data: unknown): ReadingStreakSummary {
  const payload = (data || {}) as Record<string, unknown>
  return {
    currentStreak: Math.max(0, toNumber(payload.current_streak || payload.currentStreak)),
    hasReadToday: payload.has_read_today === true || payload.hasReadToday === true,
    activeDaysThisWeek: Math.max(0, toNumber(payload.active_days_this_week || payload.activeDaysThisWeek)),
    lastReadAt: toString(payload.last_read_at || payload.lastReadAt) || null,
    weekDays: arrayFromJson(payload.week_days || payload.weekDays).map(mapWeekDay),
    claimableRewards: arrayFromJson(payload.claimable_rewards || payload.claimableRewards).map(mapRewardPreview),
    nextReward: payload.next_reward || payload.nextReward
      ? mapRewardPreview(payload.next_reward || payload.nextReward)
      : null,
    recentRewards: arrayFromJson(payload.recent_rewards || payload.recentRewards).map(mapRecentReward),
    earnedTodayCoin: Math.max(0, toNumber(payload.earned_today_coin || payload.earnedTodayCoin)),
    totalClaimedCoin: Math.max(0, toNumber(payload.total_claimed_coin || payload.totalClaimedCoin)),
  }
}

function mapAdminRule(row: Record<string, unknown>): AdminReadingStreakRewardRule {
  return {
    id: toString(row.id),
    slug: toString(row.slug),
    title: toString(row.title, 'Okuma odulu'),
    description: toString(row.description),
    triggerType: normalizeTriggerType(row.trigger_type || row.triggerType),
    targetValue: Math.max(1, toNumber(row.target_value || row.targetValue, 1)),
    coinReward: Math.max(0, toNumber(row.coin_reward || row.coinReward)),
    recurrence: normalizeRecurrence(row.recurrence),
    isActive: row.is_active !== false && row.isActive !== false,
    sortOrder: Math.max(0, toNumber(row.sort_order || row.sortOrder)),
    createdAt: toString(row.created_at || row.createdAt),
    updatedAt: toString(row.updated_at || row.updatedAt),
  }
}

function mapAdminClaim(row: Record<string, unknown>): AdminReadingStreakRewardClaim {
  return {
    id: toString(row.id),
    userId: toString(row.user_id || row.userId),
    username: toString(row.username, 'Kullanici'),
    avatarUrl: toString(row.avatar_url || row.avatarUrl) || null,
    ruleId: toString(row.rule_id || row.ruleId),
    ruleTitle: toString(row.rule_title || row.ruleTitle, 'Okuma odulu'),
    ruleSlug: toString(row.rule_slug || row.ruleSlug),
    triggerType: normalizeTriggerType(row.trigger_type || row.triggerType),
    periodStart: toString(row.period_start || row.periodStart) || null,
    progressValue: Math.max(0, toNumber(row.progress_value || row.progressValue)),
    streakDays: Math.max(0, toNumber(row.streak_days || row.streakDays)),
    activeDaysThisWeek: Math.max(0, toNumber(row.active_days_this_week || row.activeDaysThisWeek)),
    creditedCoin: Math.max(0, toNumber(row.credited_coin || row.creditedCoin)),
    claimedAt: toString(row.claimed_at || row.claimedAt),
  }
}

function mapDashboard(data: unknown): AdminReadingStreakRewardDashboard {
  const payload = (data || {}) as Record<string, unknown>
  return {
    totalRules: Math.max(0, toNumber(payload.total_rules || payload.totalRules)),
    activeRules: Math.max(0, toNumber(payload.active_rules || payload.activeRules)),
    claims30d: Math.max(0, toNumber(payload.claims_30d || payload.claims30d)),
    totalCoin30d: Math.max(0, toNumber(payload.total_coin_30d || payload.totalCoin30d)),
    readersToday: Math.max(0, toNumber(payload.readers_today || payload.readersToday)),
    longestClaimStreak: Math.max(0, toNumber(payload.longest_claim_streak || payload.longestClaimStreak)),
  }
}

export async function getReadingStreakSummary() {
  const { data, error } = await supabase.rpc('get_current_user_reading_streak_summary')
  if (error) throw error
  return mapReadingStreakSummary(data)
}

export async function claimCurrentReadingStreakRewards() {
  const { data, error } = await supabase.rpc('claim_current_user_reading_streak_rewards')
  if (error) throw error

  const payload = (data || {}) as Record<string, unknown>
  return {
    success: payload.success !== false,
    claimed: arrayFromJson(payload.claimed).map(mapRecentReward),
    totalCoin: Math.max(0, toNumber(payload.total_coin || payload.totalCoin)),
    newBalance: Math.max(0, toNumber(payload.new_balance || payload.newBalance)),
    summary: payload.summary ? mapReadingStreakSummary(payload.summary) : null,
  } as ClaimReadingStreakRewardsResult
}

export async function listAdminReadingStreakRewardRules() {
  const { data, error } = await supabase.rpc('admin_list_reading_streak_reward_rules')
  if (error) throw error
  return ((data || []) as Record<string, unknown>[]).map(mapAdminRule)
}

export async function saveAdminReadingStreakRewardRule(input: AdminRuleInput) {
  const slug = normalizeSlug(input.slug || input.title)
  const { data, error } = await supabase.rpc('admin_upsert_reading_streak_reward_rule', {
    p_id: input.id || null,
    p_slug: slug,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_trigger_type: input.triggerType,
    p_target_value: Math.max(1, Math.floor(input.targetValue || 1)),
    p_coin_reward: Math.max(0, Math.floor(input.coinReward || 0)),
    p_is_active: input.isActive,
    p_sort_order: Math.max(0, Math.floor(input.sortOrder || 0)),
  })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return mapAdminRule((row || {}) as Record<string, unknown>)
}

export async function createAdminReadingStreakRewardRule(input: Omit<AdminRuleInput, 'id'>) {
  return saveAdminReadingStreakRewardRule({ ...input, id: null })
}

export async function listAdminReadingStreakRewardClaims(limit = 50) {
  const { data, error } = await supabase.rpc('admin_list_reading_streak_reward_claims', {
    p_limit: Math.max(1, Math.min(200, Math.floor(limit || 50))),
  })
  if (error) throw error
  return ((data || []) as Record<string, unknown>[]).map(mapAdminClaim)
}

export async function getAdminReadingStreakRewardDashboard() {
  const { data, error } = await supabase.rpc('admin_get_reading_streak_reward_dashboard')
  if (error) throw error
  return mapDashboard(data)
}
