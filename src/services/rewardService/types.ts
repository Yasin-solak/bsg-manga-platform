export interface FansubRewardRankRule {
  id: string
  rankPosition: number
  coinReward: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface FansubRewardViewTier {
  id: string
  label: string
  minViews: number
  coinReward: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface FansubMonthlyRewardPreviewRow {
  fansubId: string
  fansubName: string
  totalViews: number
  rankPosition: number | null
  rankCoinReward: number
  tierCoinReward: number
  totalCoinReward: number
  tierLabels: string[]
}

export interface FansubTierDailyManga {
  id: string
  title: string
  coverImageUrl: string | null
  lastChapterNumber: number | null
  rating: number | null
  totalViews: number
  dailyViews: number
}

export interface FansubMonthlyRewardRunRow {
  id: string
  monthStart: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startedAt: string | null
  completedAt: string | null
  runBy: string | null
  runByUsername: string | null
  totalFansubs: number
  totalCoin: number
  createdAt: string
  updatedAt: string
}

export interface FansubMonthlyRewardRunResult {
  success: boolean
  alreadyCompleted: boolean
  runId: string
  monthStart: string
  monthLabel?: string
  totalFansubs: number
  totalCoin: number
}

export interface UserRewardTaskProgress {
  taskId: string
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  progressValue: number
  isCompleted: boolean
  isClaimed: boolean
  isClaimable: boolean
  coinReward: number
  badgeId: string | null
  badgeName: string | null
  badgeImageUrl: string | null
  claimedAt: string | null
  sortOrder: number
  taskGroup: string
  tierLevel: number
  isLocked: boolean
  unlockTaskId: string | null
  unlockTaskTitle: string | null
}

export interface ClaimUserRewardTaskResult {
  success: boolean
  taskId: string
  taskSlug: string
  taskTitle: string
  coinReward: number
  newBalance: number
  badgeId: string | null
  badgeName: string | null
  badgeAwarded: boolean
  claimedAt: string
}

// ============================================
// Unified quest engine (quests) - Phase 1
// ============================================
export type QuestAudience = 'user' | 'fansub'
export type QuestKind = 'achievement' | 'daily' | 'weekly' | 'event'
export type QuestRewardKind = 'coin' | 'badge' | 'store_item' | 'boost_credit'

export interface Quest {
  questId: string
  slug: string
  title: string
  description: string
  audience: QuestAudience
  kind: QuestKind
  metricKey: string
  targetValue: number
  progressValue: number
  isCompleted: boolean
  isClaimed: boolean
  isClaimable: boolean
  isLocked: boolean
  rewardKind: QuestRewardKind
  coinReward: number
  badgeId: string | null
  badgeName: string | null
  badgeImageUrl: string | null
  rewardItemId: string | null
  rewardItemName: string | null
  rewardItemType: string | null
  rewardItemImage: string | null
  boostCredit: number
  gateMetricKey: string | null
  gateMinValue: number | null
  gateProgressValue: number | null
  gateMet: boolean
  taskGroup: string
  tierLevel: number
  unlockQuestId: string | null
  unlockQuestTitle: string | null
  periodKey: string
  claimedAt: string | null
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
}

export interface ClaimQuestResult {
  success: boolean
  questId: string
  questSlug: string
  questTitle: string
  kind: QuestKind
  audience: QuestAudience
  periodKey: string
  coinReward: number
  newBalance: number
  badgeId: string | null
  badgeName: string | null
  badgeAwarded: boolean
  rewardItemId: string | null
  itemGranted: boolean
  claimedAt: string
}

export interface AdminUserRewardTask {
  id: string
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  coinReward: number
  badgeId: string | null
  badgeName: string | null
  badgeImageUrl: string | null
  isActive: boolean
  sortOrder: number
  taskGroup: string
  tierLevel: number
  unlockTaskId: string | null
  createdAt: string
  updatedAt: string
}

export interface RewardBadgeOption {
  id: string
  name: string
  imageUrl: string | null
}

export type ReadingStreakRewardTriggerType =
  | 'daily_read'
  | 'streak_milestone'
  | 'weekly_active_days'

export type ReadingStreakRewardRecurrence = 'daily' | 'weekly' | 'once'

export interface ReadingStreakWeekDay {
  date: string
  label: string
  isRead: boolean
  isToday: boolean
}

export interface ReadingStreakRewardPreview {
  ruleId: string
  slug: string
  title: string
  description: string
  triggerType: ReadingStreakRewardTriggerType
  targetValue: number
  progressValue: number
  coinReward: number
  recurrence: ReadingStreakRewardRecurrence
  isClaimable?: boolean
}

export interface ReadingStreakRecentReward {
  claimId: string
  ruleId: string
  title: string
  triggerType: ReadingStreakRewardTriggerType
  creditedCoin: number
  streakDays: number
  activeDaysThisWeek: number
  claimedAt: string
}

export interface ReadingStreakSummary {
  currentStreak: number
  hasReadToday: boolean
  activeDaysThisWeek: number
  lastReadAt: string | null
  weekDays: ReadingStreakWeekDay[]
  claimableRewards: ReadingStreakRewardPreview[]
  nextReward: ReadingStreakRewardPreview | null
  recentRewards: ReadingStreakRecentReward[]
  earnedTodayCoin: number
  totalClaimedCoin: number
}

export interface ClaimReadingStreakRewardsResult {
  success: boolean
  claimed: ReadingStreakRecentReward[]
  totalCoin: number
  newBalance: number
  summary: ReadingStreakSummary | null
}

export interface AdminReadingStreakRewardRule {
  id: string
  slug: string
  title: string
  description: string
  triggerType: ReadingStreakRewardTriggerType
  targetValue: number
  coinReward: number
  recurrence: ReadingStreakRewardRecurrence
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AdminReadingStreakRewardClaim {
  id: string
  userId: string
  username: string
  avatarUrl: string | null
  ruleId: string
  ruleTitle: string
  ruleSlug: string
  triggerType: ReadingStreakRewardTriggerType
  periodStart: string | null
  progressValue: number
  streakDays: number
  activeDaysThisWeek: number
  creditedCoin: number
  claimedAt: string
}

export interface AdminReadingStreakRewardDashboard {
  totalRules: number
  activeRules: number
  claims30d: number
  totalCoin30d: number
  readersToday: number
  longestClaimStreak: number
}

