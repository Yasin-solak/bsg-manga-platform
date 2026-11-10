import { withAbortSignal, withServiceTimeout } from './apiResilience'
import type { FansubBoostCapabilityPolicy, FansubBoostPlacementType } from '@/lib/fansubBoostPolicy'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

type JsonObject = Record<string, unknown>

export interface AdminBoostOverview {
  totalFansubCount: number
  boostedFansubCount: number
  totalActivePower: number
  uniqueActiveSupporterCount: number
  activeGrantCount: number
  grantCount7d: number
  grantCount30d: number
  grantedPower30d: number
  donationCount30d: number
  donationAmount30d: number
  activeFoundingSupporterCount: number
  activeStreakSupporterCount: number
  repeatSupporterCount: number
}

export interface AdminBoostPolicy {
  tierThresholds: number[]
  foundingLimit: number
  streakGraceDays: number
}

export interface AdminBoostCapabilityPolicyRow extends FansubBoostCapabilityPolicy {
  eligibleFansubCount: number
  liveFansubCount: number
}

export interface AdminBoostTierRow {
  tierLevel: number
  tierLabel: string
  fansubCount: number
  totalPower: number
  totalSupporters: number
}

export interface AdminBoostSurfaceRow {
  key: string
  label: string
  tierLabel: string
  modeLabel: string
  placement: string
  eligibleFansubCount: number
  liveFansubCount: number
  usageLast30d: number | null
}

export interface AdminBoostTopFansubRow {
  fansubId: string
  name: string
  slug: string
  tierLevel: number
  activePower: number
  activeSupporterCount: number
  lastGrantAt: string | null
}

export interface AdminBoostHealth {
  expiringGrantCount7d: number
  staleSnapshotCount: number
  missingRewardStateCount: number
  chapterCreditEnabledCount: number
  specialNotificationCount30d: number
  activeVanityCount: number
  lastGrantAt: string | null
  lastDonationAt: string | null
}

export interface AdminBoostControlCenter {
  generatedAt: string | null
  policy: AdminBoostPolicy
  capabilityPolicies: AdminBoostCapabilityPolicyRow[]
  overview: AdminBoostOverview
  tiers: AdminBoostTierRow[]
  surfaces: AdminBoostSurfaceRow[]
  topFansubs: AdminBoostTopFansubRow[]
  health: AdminBoostHealth
}

const adminBoostLogger = createScopedLogger('adminBoostControlService')

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

function toSafeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function toSafeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => toSafeNumber(item))
}

function mapOverview(value: JsonObject): AdminBoostOverview {
  return {
    totalFansubCount: toSafeNumber(value.totalFansubCount),
    boostedFansubCount: toSafeNumber(value.boostedFansubCount),
    totalActivePower: toSafeNumber(value.totalActivePower),
    uniqueActiveSupporterCount: toSafeNumber(value.uniqueActiveSupporterCount),
    activeGrantCount: toSafeNumber(value.activeGrantCount),
    grantCount7d: toSafeNumber(value.grantCount7d),
    grantCount30d: toSafeNumber(value.grantCount30d),
    grantedPower30d: toSafeNumber(value.grantedPower30d),
    donationCount30d: toSafeNumber(value.donationCount30d),
    donationAmount30d: toSafeNumber(value.donationAmount30d),
    activeFoundingSupporterCount: toSafeNumber(value.activeFoundingSupporterCount),
    activeStreakSupporterCount: toSafeNumber(value.activeStreakSupporterCount),
    repeatSupporterCount: toSafeNumber(value.repeatSupporterCount),
  }
}

function mapPolicy(value: JsonObject): AdminBoostPolicy {
  return {
    tierThresholds: toSafeNumberArray(value.tierThresholds),
    foundingLimit: toSafeNumber(value.foundingLimit),
    streakGraceDays: toSafeNumber(value.streakGraceDays),
  }
}

function mapCapabilityPolicyRow(value: unknown): AdminBoostCapabilityPolicyRow | null {
  const row = normalizeJsonObject(value)
  const capabilityKey = toSafeString(row.capabilityKey)
  const label = toSafeString(row.label)
  if (!capabilityKey || !label) return null

  const placementType = row.placementType === 'core' || row.placementType === 'tier' || row.placementType === 'disabled'
    ? row.placementType
    : 'disabled'

  const tierLevel = placementType === 'tier'
    ? Math.max(1, Math.min(3, toSafeNumber(row.tierLevel) || 1))
    : null

  return {
    capabilityKey,
    label,
    summary: toSafeString(row.summary),
    detail: toSafeString(row.detail),
    where: toSafeString(row.where),
    surfaceGroup: toSafeString(row.surfaceGroup, 'general'),
    placementType,
    tierLevel,
    sortOrder: toSafeNumber(row.sortOrder),
    eligibleFansubCount: toSafeNumber(row.eligibleFansubCount),
    liveFansubCount: toSafeNumber(row.liveFansubCount),
  }
}

function mapTierRow(value: unknown): AdminBoostTierRow | null {
  const row = normalizeJsonObject(value)
  const tierLabel = toSafeString(row.tierLabel)
  if (!tierLabel) return null

  return {
    tierLevel: toSafeNumber(row.tierLevel),
    tierLabel,
    fansubCount: toSafeNumber(row.fansubCount),
    totalPower: toSafeNumber(row.totalPower),
    totalSupporters: toSafeNumber(row.totalSupporters),
  }
}

function mapSurfaceRow(value: unknown): AdminBoostSurfaceRow | null {
  const row = normalizeJsonObject(value)
  const key = toSafeString(row.key)
  const label = toSafeString(row.label)
  if (!key || !label) return null

  return {
    key,
    label,
    tierLabel: toSafeString(row.tierLabel, 'Core'),
    modeLabel: toSafeString(row.modeLabel, 'Oto'),
    placement: toSafeString(row.placement),
    eligibleFansubCount: toSafeNumber(row.eligibleFansubCount),
    liveFansubCount: toSafeNumber(row.liveFansubCount),
    usageLast30d: row.usageLast30d == null ? null : toSafeNumber(row.usageLast30d),
  }
}

function mapTopFansubRow(value: unknown): AdminBoostTopFansubRow | null {
  const row = normalizeJsonObject(value)
  const fansubId = toSafeString(row.fansubId)
  if (!fansubId) return null

  return {
    fansubId,
    name: toSafeString(row.name, 'Fansub'),
    slug: toSafeString(row.slug),
    tierLevel: toSafeNumber(row.tierLevel),
    activePower: toSafeNumber(row.activePower),
    activeSupporterCount: toSafeNumber(row.activeSupporterCount),
    lastGrantAt: toNullableString(row.lastGrantAt),
  }
}

function mapHealth(value: JsonObject): AdminBoostHealth {
  return {
    expiringGrantCount7d: toSafeNumber(value.expiringGrantCount7d),
    staleSnapshotCount: toSafeNumber(value.staleSnapshotCount),
    missingRewardStateCount: toSafeNumber(value.missingRewardStateCount),
    chapterCreditEnabledCount: toSafeNumber(value.chapterCreditEnabledCount),
    specialNotificationCount30d: toSafeNumber(value.specialNotificationCount30d),
    activeVanityCount: toSafeNumber(value.activeVanityCount),
    lastGrantAt: toNullableString(value.lastGrantAt),
    lastDonationAt: toNullableString(value.lastDonationAt),
  }
}

export async function getAdminBoostControlCenter(): Promise<AdminBoostControlCenter> {
  const requestContext = createRequestContext('adminBoostControlService', 'getAdminBoostControlCenter')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_boost_control_center'),
      signal,
    ),
    { label: 'adminBoostControlService.getAdminBoostControlCenter' },
  )

  if (error) {
    adminBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Boost kontrol merkezi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = normalizeJsonObject(normalizeRpcPayload<JsonObject>(data))

  return {
    generatedAt: toNullableString(payload.generatedAt),
    policy: mapPolicy(normalizeJsonObject(payload.policy)),
    capabilityPolicies: Array.isArray(payload.capabilityPolicies)
      ? payload.capabilityPolicies
        .map(mapCapabilityPolicyRow)
        .filter((row): row is AdminBoostCapabilityPolicyRow => row !== null)
      : [],
    overview: mapOverview(normalizeJsonObject(payload.overview)),
    tiers: Array.isArray(payload.tiers)
      ? payload.tiers.map(mapTierRow).filter((row): row is AdminBoostTierRow => row !== null)
      : [],
    surfaces: Array.isArray(payload.surfaces)
      ? payload.surfaces.map(mapSurfaceRow).filter((row): row is AdminBoostSurfaceRow => row !== null)
      : [],
    topFansubs: Array.isArray(payload.topFansubs)
      ? payload.topFansubs.map(mapTopFansubRow).filter((row): row is AdminBoostTopFansubRow => row !== null)
      : [],
    health: mapHealth(normalizeJsonObject(payload.health)),
  }
}

export async function updateAdminBoostCapabilityPolicy(input: {
  capabilityKey: string
  placementType: FansubBoostPlacementType
  tierLevel?: number | null
}): Promise<AdminBoostCapabilityPolicyRow> {
  const requestContext = createRequestContext('adminBoostControlService', 'updateAdminBoostCapabilityPolicy', {
    capabilityKey: input.capabilityKey,
    placementType: input.placementType,
    tierLevel: input.tierLevel ?? null,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('update_admin_boost_capability_policy', {
        p_capability_key: input.capabilityKey,
        p_placement_type: input.placementType,
        p_tier_level: input.placementType === 'tier' ? input.tierLevel ?? null : null,
      }),
      signal,
    ),
    { label: 'adminBoostControlService.updateAdminBoostCapabilityPolicy' },
  )

  if (error) {
    adminBoostLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Boost capability yerlesimi guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const mapped = mapCapabilityPolicyRow(normalizeJsonObject(normalizeRpcPayload<JsonObject>(data)))
  if (!mapped) {
    throw new Error('Boost capability politikasi guncellenemedi.')
  }

  return mapped
}
