import { withAbortSignal, withServiceTimeout } from './apiResilience'
import type { FansubBoostCapabilityPolicy } from '@/lib/fansubBoostPolicy'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { createScopedLogger } from './logger'
import { loadPublicUserDirectoryLiteByIds } from './publicUserDirectoryLite'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { getCurrentUserIdentity } from './userService/selfIdentity'
import { toUserFacingErrorMessage } from './userFacingError'
import { txa } from '@/i18n/activeLocale'

type JsonObject = Record<string, unknown>

type DbFansubBoostPlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  coin_cost: number
  boost_power: number
  duration_days: number
  supporter_reward_tier: number
  sort_order: number
  metadata: JsonObject | null
}

type DbFansubBoostSnapshotRow = {
  fansub_id: string
  active_power: number
  tier_level: number
  active_supporter_count: number
  active_grant_count: number
  active_monthly_supporter_count: number
  active_mega_supporter_count: number
  active_top_supporter_count: number
  capabilities: JsonObject | null
  last_grant_expires_at: string | null
  current_tier_floor_power: number | null
  next_tier_level: number | null
  next_tier_required_power: number | null
  next_tier_remaining_power: number | null
  tier_progress_percent: number | string | null
}

type DbFansubBoostSupporterStateRow = {
  fansub_id: string
  supporter_user_id: string
  active_grant_count: number
  active_total_power: number
  highest_active_plan_code: string | null
  supporter_reward_tier: number
  reward_capabilities: JsonObject | null
  active_until: string | null
  lifetime_grant_count: number
  lifetime_total_power: number
  latest_supporter_note: string | null
  is_visible: boolean
  last_granted_at: string | null
}

type DbFansubBoostSupporterPreviewRow = {
  supporter_user_id: string
  username: string
  username_slug: string
  avatar_url: string | null
  supporter_reward_tier: number
  highest_active_plan_code: string | null
  latest_supporter_note: string | null
  active_until: string | null
  reward_capabilities: JsonObject | null
}

type DbPurchaseFansubBoostResult = {
  grantId: string
  fansubId: string
  planCode: string
  planName: string
  coinCost: number
  boostPower: number
  quantity: number
  durationDays: number
  supporterRewardTier: number
  startsAt: string
  expiresAt: string
  newUserStones: number
  supporterPreview: DbFansubBoostSupporterPreviewRow[] | null
  supporterState: DbFansubBoostSupporterStateRow | null
  snapshot: DbFansubBoostSnapshotRow | null
}

type DbMyFansubBoostHistoryRow = {
  id: string
  fansub_id: string
  plan_code: string
  coin_cost: number
  boost_power: number
  duration_days: number
  supporter_reward_tier: number
  status: string
  supporter_note: string | null
  granted_at: string
  starts_at: string
  expires_at: string
  metadata: JsonObject | null
  fansub: {
    id: string
    name: string
    slug: string | null
    avatar_url: string | null
  } | Array<{
    id: string
    name: string
    slug: string | null
    avatar_url: string | null
  }> | null
}

export interface FansubBoostPlanMetadata extends JsonObject {
  accent?: string
  eyebrow?: string
  summary?: string
  fansubBenefitSummary?: string
  supporterBenefitSummary?: string
  badgeLabel?: string
  ctaLabel?: string
}

export interface FansubBoostCapabilities extends JsonObject {
  tierLevel?: number
  tierKey?: string
  tierLabel?: string
  tierHeadline?: string
  tierSummary?: string
  currentBenefits?: string[]
  nextTierSummary?: string
  nextTierBenefits?: string[]
  nextTierCallout?: string
  canUseSupporterList?: boolean
  canUseSupporterEmojiAssets?: boolean
  canUseSupporterStickerAssets?: boolean
  canShowcaseManga?: boolean
  canUploadStaticBackground?: boolean
  canUploadVideoBackground?: boolean
  canUseHoverTheme?: boolean
  canUseSpecialNotifications?: boolean
  canManagePinnedNotice?: boolean
  hasFansubIdentityTags?: boolean
  hasFullNameStyle?: boolean
  hasDiscoverBadge?: boolean
  canUsePolls?: boolean
  hasAnalytics?: boolean
  hasAdvancedAnalytics?: boolean
  hasChapterEndCredit?: boolean
  hasGoldFrame?: boolean
  hasVanityUrl?: boolean
  hasSupporterStreak?: boolean
  hasFoundingSupporter?: boolean
  emojiSlotLimit?: number
  supporterEmojiSlotLimit?: number
  supporterStickerSlotLimit?: number
}

export interface FansubBoostRewardCapabilities extends JsonObject {
  rewardTier?: number
  rewardLabel?: string
  rewardSummary?: string
  rewardHighlights?: string[]
  supporterPitch?: string
  isFoundingSupporter?: boolean
  foundingOrder?: number | null
  foundingLabel?: string | null
  streakCount?: number
  bestStreakCount?: number
  supporterStatusLine?: string | null
  identityBadgeLabel?: string | null
  canUseSupporterEmojis?: boolean
  canUseSupporterStickers?: boolean
}

export interface FansubBoostPlan {
  id: string
  code: string
  name: string
  description: string
  coinCost: number
  boostPower: number
  durationDays: number
  supporterRewardTier: number
  sortOrder: number
  metadata: FansubBoostPlanMetadata
}

export interface FansubBoostSnapshot {
  fansubId: string
  activePower: number
  tierLevel: number
  activeSupporterCount: number
  activeGrantCount: number
  activeMonthlySupporterCount: number
  activeMegaSupporterCount: number
  activeTopSupporterCount: number
  capabilities: FansubBoostCapabilities
  lastGrantExpiresAt: string | null
  currentTierFloorPower: number
  nextTierLevel: number | null
  nextTierRequiredPower: number | null
  nextTierRemainingPower: number
  tierProgressPercent: number
}

export interface FansubBoostSupporterState {
  fansubId: string
  supporterUserId: string
  activeGrantCount: number
  activeTotalPower: number
  highestActivePlanCode: string | null
  supporterRewardTier: number
  rewardCapabilities: FansubBoostRewardCapabilities
  activeUntil: string | null
  lifetimeGrantCount: number
  lifetimeTotalPower: number
  latestSupporterNote: string | null
  isVisible: boolean
  lastGrantedAt: string | null
}

export interface FansubBoostSupporterPreview {
  supporterUserId: string
  username: string
  usernameSlug: string
  avatarUrl: string | null
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
  supporterRewardTier: number
  highestActivePlanCode: string | null
  latestSupporterNote: string | null
  activeUntil: string | null
  rewardCapabilities: FansubBoostRewardCapabilities
}

export interface FansubBoostPublicBundle {
  snapshot: FansubBoostSnapshot | null
  supporterPreview: FansubBoostSupporterPreview[]
}

export type FansubBoostPolicyCatalogItem = FansubBoostCapabilityPolicy

export interface FansubManageBoostRewardSummary {
  activeSupporterCount: number
  visibleSupporterCount: number
  foundingSupporterCount: number
  activeFoundingSupporterCount: number
  activeStreakSupporterCount: number
  bestActiveStreakCount: number
  bestLifetimeStreakCount: number
  remainingFoundingSlots: number
  monthlySupporterCount: number
  megaSupporterCount: number
  topSupporterCount: number
  lastGrantedAt: string | null
  hasAnyRewardState: boolean
}

export interface PurchaseFansubBoostInput {
  fansubId: string
  planCode: string
  supporterNote?: string | null
  quantity?: number
}

export interface PurchaseFansubBoostResult {
  grantId: string
  fansubId: string
  planCode: string
  planName: string
  coinCost: number
  boostPower: number
  quantity: number
  durationDays: number
  supporterRewardTier: number
  startsAt: string
  expiresAt: string
  newUserStones: number
  supporterPreview: FansubBoostSupporterPreview[]
  supporterState: FansubBoostSupporterState | null
  snapshot: FansubBoostSnapshot | null
}

export interface MyFansubBoostHistoryItem {
  id: string
  fansubId: string
  fansubName: string
  fansubSlug: string | null
  fansubAvatarUrl: string | null
  planCode: string
  planName: string
  coinCost: number
  boostPower: number
  durationDays: number
  quantity: number
  supporterRewardTier: number
  status: string
  supporterNote: string | null
  grantedAt: string
  startsAt: string
  expiresAt: string
}

export interface ListMyFansubBoostHistoryOptions {
  limit?: number
  signal?: AbortSignal
  supporterUserId?: string | null
}

const fansubBoostLogger = createScopedLogger('fansubBoostService')

function normalizeJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function normalizeRpcPayload<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null
  }
  return (data || null) as T | null
}

function toSafeNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : Number(value || 0) || 0
}

function toSafeBoolean(value: unknown) {
  return value === true
}

function readMetadataNumber(metadata: JsonObject, key: string, fallback: number) {
  const value = metadata[key]
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback
}

function readMetadataString(metadata: JsonObject, key: string, fallback: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function mapFansubBoostPlanRow(row: DbFansubBoostPlanRow): FansubBoostPlan {
  return {
    id: row.id,
    code: row.code,
    name: txa(row.name?.trim() || 'Takviye'),
    description: txa(row.description?.trim() || ''),
    coinCost: Number(row.coin_cost || 0),
    boostPower: Number(row.boost_power || 0),
    durationDays: Number(row.duration_days || 0),
    supporterRewardTier: Number(row.supporter_reward_tier || 0),
    sortOrder: Number(row.sort_order || 0),
    metadata: normalizeJsonObject(row.metadata) as FansubBoostPlanMetadata,
  }
}

function getJoinedFansub(row: DbMyFansubBoostHistoryRow) {
  if (Array.isArray(row.fansub)) return row.fansub[0] ?? null
  return row.fansub ?? null
}

function mapMyFansubBoostHistoryRow(row: DbMyFansubBoostHistoryRow): MyFansubBoostHistoryItem | null {
  if (!row?.id || !row.fansub_id) return null

  const metadata = normalizeJsonObject(row.metadata)
  const fansub = getJoinedFansub(row)

  return {
    id: row.id,
    fansubId: row.fansub_id,
    fansubName: fansub?.name || 'Fansub',
    fansubSlug: fansub?.slug || null,
    fansubAvatarUrl: fansub?.avatar_url || null,
    planCode: row.plan_code || 'monthly',
    planName: readMetadataString(metadata, 'planName', row.plan_code || 'Takviye'),
    coinCost: Number(row.coin_cost || 0),
    boostPower: Number(row.boost_power || 0),
    durationDays: Number(row.duration_days || 0),
    quantity: readMetadataNumber(metadata, 'quantity', 1),
    supporterRewardTier: Number(row.supporter_reward_tier || 0),
    status: row.status || 'active',
    supporterNote: typeof row.supporter_note === 'string' && row.supporter_note.trim() ? row.supporter_note.trim() : null,
    grantedAt: row.granted_at,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  }
}

function getE2EMyFansubBoostHistory(): MyFansubBoostHistoryItem[] {
  return [
    {
      id: 'e2e-boost-history-1',
      fansubId: 'e2e-fansub-1',
      fansubName: 'E2E Fansub',
      fansubSlug: 'e2e-fansub',
      fansubAvatarUrl: '/fansub/cloud-avatar.png',
      planCode: 'monthly',
      planName: 'Takviye',
      coinCost: 300,
      boostPower: 120,
      durationDays: 30,
      quantity: 1,
      supporterRewardTier: 1,
      status: 'active',
      supporterNote: 'E2E destek kaydi',
      grantedAt: '2026-05-12T12:00:00.000Z',
      startsAt: '2026-05-12T12:00:00.000Z',
      expiresAt: '2026-06-11T12:00:00.000Z',
    },
  ]
}

function hasE2EQueryParamInBrowser() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('e2e') === '1'
}

function mapFansubBoostSnapshotRow(row: DbFansubBoostSnapshotRow | null | undefined): FansubBoostSnapshot | null {
  if (!row?.fansub_id) return null
  return {
    fansubId: row.fansub_id,
    activePower: Number(row.active_power || 0),
    tierLevel: Number(row.tier_level || 0),
    activeSupporterCount: Number(row.active_supporter_count || 0),
    activeGrantCount: Number(row.active_grant_count || 0),
    activeMonthlySupporterCount: Number(row.active_monthly_supporter_count || 0),
    activeMegaSupporterCount: Number(row.active_mega_supporter_count || 0),
    activeTopSupporterCount: Number(row.active_top_supporter_count || 0),
    capabilities: normalizeJsonObject(row.capabilities) as FansubBoostCapabilities,
    lastGrantExpiresAt: typeof row.last_grant_expires_at === 'string' ? row.last_grant_expires_at : null,
    currentTierFloorPower: Number(row.current_tier_floor_power || 0),
    nextTierLevel: row.next_tier_level == null ? null : Number(row.next_tier_level || 0),
    nextTierRequiredPower: row.next_tier_required_power == null ? null : Number(row.next_tier_required_power || 0),
    nextTierRemainingPower: Number(row.next_tier_remaining_power || 0),
    tierProgressPercent: Number(row.tier_progress_percent || 0),
  }
}

function mapFansubBoostSupporterStateRow(
  row: DbFansubBoostSupporterStateRow | null | undefined,
): FansubBoostSupporterState | null {
  if (!row?.fansub_id || !row?.supporter_user_id) return null
  return {
    fansubId: row.fansub_id,
    supporterUserId: row.supporter_user_id,
    activeGrantCount: Number(row.active_grant_count || 0),
    activeTotalPower: Number(row.active_total_power || 0),
    highestActivePlanCode: typeof row.highest_active_plan_code === 'string' ? row.highest_active_plan_code : null,
    supporterRewardTier: Number(row.supporter_reward_tier || 0),
    rewardCapabilities: normalizeJsonObject(row.reward_capabilities) as FansubBoostRewardCapabilities,
    activeUntil: typeof row.active_until === 'string' ? row.active_until : null,
    lifetimeGrantCount: Number(row.lifetime_grant_count || 0),
    lifetimeTotalPower: Number(row.lifetime_total_power || 0),
    latestSupporterNote: typeof row.latest_supporter_note === 'string' ? row.latest_supporter_note : null,
    isVisible: row.is_visible !== false,
    lastGrantedAt: typeof row.last_granted_at === 'string' ? row.last_granted_at : null,
  }
}

function mapFansubBoostSupporterPreviewRow(
  row: DbFansubBoostSupporterPreviewRow | null | undefined,
): FansubBoostSupporterPreview | null {
  if (!row?.supporter_user_id || !row?.username || !row?.username_slug) return null
  return {
    supporterUserId: row.supporter_user_id,
    username: row.username,
    usernameSlug: row.username_slug,
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    supporterRewardTier: Number(row.supporter_reward_tier || 0),
    highestActivePlanCode: typeof row.highest_active_plan_code === 'string' ? row.highest_active_plan_code : null,
    latestSupporterNote: typeof row.latest_supporter_note === 'string' ? row.latest_supporter_note : null,
    activeUntil: typeof row.active_until === 'string' ? row.active_until : null,
    rewardCapabilities: normalizeJsonObject(row.reward_capabilities) as FansubBoostRewardCapabilities,
  }
}

async function enrichFansubBoostSupporterPreview(
  rows: FansubBoostSupporterPreview[],
  signal?: AbortSignal,
): Promise<FansubBoostSupporterPreview[]> {
  const supporterIds = Array.from(
    new Set(rows.map((row) => row.supporterUserId.trim()).filter(Boolean)),
  )
  if (supporterIds.length === 0) return rows

  const directoryRows = await loadPublicUserDirectoryLiteByIds(supporterIds, signal)
  return rows.map((row) => ({
    ...row,
    activeFansubIdentityTag: directoryRows.get(row.supporterUserId)?.active_fansub_identity_tag ?? null,
  }))
}

function mapFansubManageBoostRewardSummary(
  value: JsonObject | null | undefined,
): FansubManageBoostRewardSummary {
  return {
    activeSupporterCount: toSafeNumber(value?.activeSupporterCount),
    visibleSupporterCount: toSafeNumber(value?.visibleSupporterCount),
    foundingSupporterCount: toSafeNumber(value?.foundingSupporterCount),
    activeFoundingSupporterCount: toSafeNumber(value?.activeFoundingSupporterCount),
    activeStreakSupporterCount: toSafeNumber(value?.activeStreakSupporterCount),
    bestActiveStreakCount: toSafeNumber(value?.bestActiveStreakCount),
    bestLifetimeStreakCount: toSafeNumber(value?.bestLifetimeStreakCount),
    remainingFoundingSlots: toSafeNumber(value?.remainingFoundingSlots),
    monthlySupporterCount: toSafeNumber(value?.monthlySupporterCount),
    megaSupporterCount: toSafeNumber(value?.megaSupporterCount),
    topSupporterCount: toSafeNumber(value?.topSupporterCount),
    lastGrantedAt: typeof value?.lastGrantedAt === 'string' ? value.lastGrantedAt : null,
    hasAnyRewardState: toSafeBoolean(value?.hasAnyRewardState),
  }
}

function mapFansubBoostPolicyCatalogItem(
  value: JsonObject | null | undefined,
): FansubBoostPolicyCatalogItem | null {
  const capabilityKeySource = typeof value?.capabilityKey === 'string'
    ? value.capabilityKey
    : typeof value?.capability_key === 'string'
      ? value.capability_key
      : ''
  const capabilityKey = capabilityKeySource.trim()
  const label = typeof value?.label === 'string' ? value.label.trim() : ''

  if (!capabilityKey || !label) return null

  const rawPlacementType = value?.placementType ?? value?.placement_type
  const placementType = rawPlacementType === 'core' || rawPlacementType === 'tier' || rawPlacementType === 'disabled'
    ? rawPlacementType
    : 'disabled'

  const tierLevel = placementType === 'tier' ? toSafeNumber(value?.tierLevel ?? value?.tier_level) : null

  return {
    capabilityKey,
    label: txa(label),
    summary: typeof value?.summary === 'string' ? txa(value.summary) : '',
    detail: typeof value?.detail === 'string' ? txa(value.detail) : '',
    where: typeof value?.where === 'string'
      ? txa(value.where)
      : typeof value?.placement_hint === 'string'
        ? txa(value.placement_hint)
        : '',
    surfaceGroup: typeof value?.surfaceGroup === 'string'
      ? value.surfaceGroup
      : typeof value?.surface_group === 'string'
        ? value.surface_group
        : 'general',
    placementType,
    tierLevel: placementType === 'tier' ? Math.max(1, Math.min(3, tierLevel || 1)) : null,
    sortOrder: toSafeNumber(value?.sortOrder ?? value?.sort_order),
  }
}

export async function listActiveFansubBoostPlans(): Promise<FansubBoostPlan[]> {
  const requestContext = createRequestContext('fansubBoostService', 'listActiveFansubBoostPlans')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_active_fansub_boost_plans'),
      signal,
    ),
    { label: 'fansubBoostService.listActiveFansubBoostPlans' },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Aktif takviye planlari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as DbFansubBoostPlanRow[]).map(mapFansubBoostPlanRow)
}

export async function getPublicFansubBoostSnapshot(
  fansubId: string,
  signal?: AbortSignal,
): Promise<FansubBoostSnapshot | null> {
  const requestContext = createRequestContext('fansubBoostService', 'getPublicFansubBoostSnapshot', { fansubId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_public_fansub_boost_snapshot', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubBoostService.getPublicFansubBoostSnapshot', signal },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub boost ozeti yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return mapFansubBoostSnapshotRow(normalizeRpcPayload<DbFansubBoostSnapshotRow>(data))
}

export async function getPublicFansubBoostBundle(
  fansubId: string,
  supporterPreviewLimit = 6,
): Promise<FansubBoostPublicBundle> {
  const requestContext = createRequestContext('fansubBoostService', 'getPublicFansubBoostBundle', {
    fansubId,
    supporterPreviewLimit,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_public_fansub_boost_bundle', {
        p_fansub_id: fansubId,
        p_supporter_preview_limit: supporterPreviewLimit,
      }),
      signal,
    ),
    { label: 'fansubBoostService.getPublicFansubBoostBundle' },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub boost paketi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = normalizeRpcPayload<{ snapshot?: DbFansubBoostSnapshotRow | null; supporterPreview?: DbFansubBoostSupporterPreviewRow[] | null }>(data)
  return {
    snapshot: mapFansubBoostSnapshotRow(payload?.snapshot ?? null),
    supporterPreview: await enrichFansubBoostSupporterPreview(
      ((payload?.supporterPreview || []) as DbFansubBoostSupporterPreviewRow[])
      .map(mapFansubBoostSupporterPreviewRow)
      .filter((row): row is FansubBoostSupporterPreview => row !== null),
    ),
  }
}

export async function listPublicFansubBoostCapabilityPolicies(
  signal?: AbortSignal,
): Promise<FansubBoostPolicyCatalogItem[]> {
  const requestContext = createRequestContext('fansubBoostService', 'listPublicFansubBoostCapabilityPolicies')
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase.rpc('list_public_fansub_boost_capability_policies'),
      nextSignal,
    ),
    { label: 'fansubBoostService.listPublicFansubBoostCapabilityPolicies', signal },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Boost capability katalogu yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as JsonObject[])
    .map((row) => mapFansubBoostPolicyCatalogItem(normalizeJsonObject(row)))
    .filter((row): row is FansubBoostPolicyCatalogItem => row !== null)
}

export async function getMyFansubBoostSupporterState(fansubId: string): Promise<FansubBoostSupporterState | null> {
  const requestContext = createRequestContext('fansubBoostService', 'getMyFansubBoostSupporterState', { fansubId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_my_fansub_boost_supporter_state', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubBoostService.getMyFansubBoostSupporterState' },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Destekci takviye durumu yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return mapFansubBoostSupporterStateRow(normalizeRpcPayload<DbFansubBoostSupporterStateRow>(data))
}

export async function listMyFansubBoostHistory(
  options: ListMyFansubBoostHistoryOptions = {},
): Promise<MyFansubBoostHistoryItem[]> {
  if (isE2EModeEnabled() || hasE2EQueryParamInBrowser() || options.supporterUserId?.startsWith('e2e-')) {
    return getE2EMyFansubBoostHistory()
  }

  const supporterUserId = options.supporterUserId || (await getCurrentUserIdentity())?.id || null
  if (!supporterUserId) return []

  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.min(50, Math.max(1, Math.floor(options.limit as number)))
    : 12

  const requestContext = createRequestContext('fansubBoostService', 'listMyFansubBoostHistory', {
    supporterUserId,
    limit: normalizedLimit,
  })

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_boost_grants')
        .select(`
          id,
          fansub_id,
          plan_code,
          coin_cost,
          boost_power,
          duration_days,
          supporter_reward_tier,
          status,
          supporter_note,
          granted_at,
          starts_at,
          expires_at,
          metadata,
          fansub:fansub_id (
            id,
            name,
            slug,
            avatar_url
          )
        `)
        .eq('supporter_user_id', supporterUserId)
        .order('granted_at', { ascending: false })
        .limit(normalizedLimit),
      signal,
    ),
    { label: 'fansubBoostService.listMyFansubBoostHistory', signal: options.signal },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Takviye gecmisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as DbMyFansubBoostHistoryRow[])
    .map(mapMyFansubBoostHistoryRow)
    .filter((row): row is MyFansubBoostHistoryItem => row !== null)
}

export async function getFansubManageBoostRewardSummary(
  fansubId: string,
): Promise<FansubManageBoostRewardSummary> {
  const requestContext = createRequestContext('fansubBoostService', 'getFansubManageBoostRewardSummary', {
    fansubId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_boost_reward_summary', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubBoostService.getFansubManageBoostRewardSummary' },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Supporter reward ozeti yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return mapFansubManageBoostRewardSummary(normalizeJsonObject(normalizeRpcPayload<JsonObject>(data)))
}

export async function listPublicFansubBoostSupportersPreview(
  fansubId: string,
  limit = 6,
  signal?: AbortSignal,
): Promise<FansubBoostSupporterPreview[]> {
  const requestContext = createRequestContext('fansubBoostService', 'listPublicFansubBoostSupportersPreview', {
    fansubId,
    limit,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_public_fansub_boost_supporters_preview', {
        p_fansub_id: fansubId,
        p_limit: limit,
      }),
      signal,
    ),
    { label: 'fansubBoostService.listPublicFansubBoostSupportersPreview', signal },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub destekci onizlemesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return enrichFansubBoostSupporterPreview(((data || []) as DbFansubBoostSupporterPreviewRow[])
    .map(mapFansubBoostSupporterPreviewRow)
    .filter((row): row is FansubBoostSupporterPreview => row !== null), signal)
}

export async function purchaseFansubBoost(input: PurchaseFansubBoostInput): Promise<PurchaseFansubBoostResult> {
  const requestContext = createRequestContext('fansubBoostService', 'purchaseFansubBoost', {
    fansubId: input.fansubId,
    planCode: input.planCode,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('purchase_fansub_boost', {
        p_fansub_id: input.fansubId,
        p_plan_code: input.planCode,
        p_supporter_note: input.supporterNote?.trim() || null,
        p_quantity: input.quantity ?? 1,
      }),
      signal,
    ),
    { label: 'fansubBoostService.purchaseFansubBoost' },
  )

  if (error) {
    fansubBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub takviye satin alma islemi basarisiz oldu.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = normalizeRpcPayload<DbPurchaseFansubBoostResult>(data)
  if (!payload?.grantId) {
    throw new Error('Fansub takviye yaniti bos dondu.')
  }

  return {
    grantId: payload.grantId,
    fansubId: payload.fansubId,
    planCode: payload.planCode,
    planName: payload.planName,
    coinCost: Number(payload.coinCost || 0),
    boostPower: Number(payload.boostPower || 0),
    quantity: Number(payload.quantity || 1),
    durationDays: Number(payload.durationDays || 0),
    supporterRewardTier: Number(payload.supporterRewardTier || 0),
    startsAt: payload.startsAt,
    expiresAt: payload.expiresAt,
    newUserStones: Number(payload.newUserStones || 0),
    supporterPreview: await enrichFansubBoostSupporterPreview(((payload.supporterPreview || []) as DbFansubBoostSupporterPreviewRow[])
      .map(mapFansubBoostSupporterPreviewRow)
      .filter((row): row is FansubBoostSupporterPreview => row !== null)),
    supporterState: mapFansubBoostSupporterStateRow(payload.supporterState),
    snapshot: mapFansubBoostSnapshotRow(payload.snapshot),
  }
}
