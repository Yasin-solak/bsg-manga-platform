import type { FansubBoostPlacementType } from '@/lib/fansubBoostPolicy'
import {
  normalizeFansubSupporterAssetPresentation,
  type FansubSupporterAssetPresentation,
} from '@/lib/fansubSupporterAssetPresentation'
import type { FansubSupporterAssetKind } from '@/services/fansubSupporterAssetService'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

type JsonObject = Record<string, unknown>

export interface AdminSupporterAssetActor {
  userId: string
  username: string
  avatarUrl: string | null
}

export interface AdminSupporterAssetCapabilityPolicyRow {
  capabilityKey: string
  label: string
  summary: string
  detail: string
  where: string
  surfaceGroup: string
  placementType: FansubBoostPlacementType
  tierLevel: number | null
  sortOrder: number
  placementLabel: string
  eligibleFansubCount: number
  liveFansubCount: number
}

export interface AdminSupporterAssetTierQuotaRow {
  tierLevel: number
  tierLabel: string
  emojiLimit: number
  stickerLimit: number
}

export interface AdminSupporterAssetOverview {
  fansubCountWithAssets: number
  totalAssetCount: number
  totalEmojiCount: number
  totalStickerCount: number
  usableAssetCount: number
  quotaOutsideAssetCount: number
  revisedAssetCount: number
  uploadCount30d: number
  editCount30d: number
}

export interface AdminSupporterAssetTopFansubRow {
  fansubId: string
  name: string
  slug: string
  tierLevel: number
  emojiCount: number
  stickerCount: number
  totalAssetCount: number
  liveAssetCount: number
  archivedAssetCount: number
  usableAssetCount: number
  lastAssetAt: string | null
  lastActivityAt: string | null
  lastActor: AdminSupporterAssetActor | null
}

export interface AdminSupporterAssetLatestRow {
  assetId: string
  fansubId: string
  fansubName: string
  fansubSlug: string
  tierLevel: number
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  assetRef: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  presentation: FansubSupporterAssetPresentation
  isActive: boolean
  isArchived: boolean
  quotaLimit: number
  quotaRank: number | null
  isWithinQuota: boolean
  isUsable: boolean
  currentRevisionId: string | null
  currentRevisionNumber: number | null
  latestRevisionNumber: number | null
  currentRevisionCreatedAt: string | null
  currentRevisionCreatedBy: AdminSupporterAssetActor | null
  createdBy: AdminSupporterAssetActor | null
  updatedBy: AdminSupporterAssetActor | null
  deletedBy: AdminSupporterAssetActor | null
  createdAt: string | null
  updatedAt: string | null
  deletedAt: string | null
}

export interface AdminSupporterAssetRevisionRow {
  revisionId: string
  revisionNumber: number
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  assetRef: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  presentation: FansubSupporterAssetPresentation
  createdAt: string | null
  createdBy: AdminSupporterAssetActor | null
  isCurrent: boolean
  isLegacy: boolean
}

export interface AdminSupporterAssetUploaderRow {
  user: AdminSupporterAssetActor
  uploadCount30d: number
  editCount30d: number
  fansubCount30d: number
  lastActivityAt: string | null
}

export interface AdminSupporterAssetActivityRow {
  eventType: 'upload' | 'edit' | 'archive'
  eventLabel: string
  assetId: string
  fansubId: string
  fansubName: string
  fansubSlug: string
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  actor: AdminSupporterAssetActor | null
  occurredAt: string | null
  revisionNumber: number | null
}

export interface AdminSupporterAssetHealth {
  inactiveAssetCount: number
  archivedAssetCount: number
  quotaOutsideAssetCount: number
  missingRevisionCount: number
  missingActorCount: number
  legacyRefCount: number
  gifAssetCount: number
  standardizedRefCount: number
  lastAssetAt: string | null
}

export interface AdminSupporterAssetTransport {
  uploadPath: string
  assetRefScheme: string
  bucket: string
}

export interface AdminSupporterAssetControlCenter {
  generatedAt: string | null
  transport: AdminSupporterAssetTransport
  capabilityPolicies: AdminSupporterAssetCapabilityPolicyRow[]
  tierQuotas: AdminSupporterAssetTierQuotaRow[]
  overview: AdminSupporterAssetOverview
  topFansubs: AdminSupporterAssetTopFansubRow[]
  latestAssets: AdminSupporterAssetLatestRow[]
  topUploaders: AdminSupporterAssetUploaderRow[]
  recentActivity: AdminSupporterAssetActivityRow[]
  health: AdminSupporterAssetHealth
}

export interface AdminSupporterAssetFansubInventorySummary {
  fansubId: string
  name: string
  slug: string
  tierLevel: number
  emojiLimit: number
  stickerLimit: number
  totalAssetCount: number
  liveAssetCount: number
  archivedAssetCount: number
  usableAssetCount: number
  lastAssetAt: string | null
  lastActivityAt: string | null
  latestActor: AdminSupporterAssetActor | null
}

export interface AdminSupporterAssetFansubInventory {
  fansub: AdminSupporterAssetFansubInventorySummary | null
  items: AdminSupporterAssetLatestRow[]
  recentActivity: AdminSupporterAssetActivityRow[]
}

export interface AdminSupporterAssetDetail {
  asset: AdminSupporterAssetLatestRow | null
  revisions: AdminSupporterAssetRevisionRow[]
}

const adminSupporterAssetLogger = createScopedLogger('adminSupporterAssetControlService')

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

function toSafeNullableNumber(value: unknown) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toSafeString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function toSafeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizePlacementType(value: unknown): FansubBoostPlacementType {
  if (value === 'core' || value === 'tier' || value === 'disabled') return value
  return 'disabled'
}

function normalizeAssetKind(value: unknown): FansubSupporterAssetKind | null {
  return value === 'emoji' || value === 'sticker' ? value : null
}

function normalizeActivityType(value: unknown): AdminSupporterAssetActivityRow['eventType'] | null {
  return value === 'upload' || value === 'edit' || value === 'archive' ? value : null
}

function mapActor(value: unknown): AdminSupporterAssetActor | null {
  const row = normalizeJsonObject(value)
  const userId = toSafeString(row.userId)
  const username = toSafeString(row.username)
  if (!userId || !username) return null
  return {
    userId,
    username,
    avatarUrl: toNullableString(row.avatarUrl),
  }
}

function mapCapabilityPolicyRow(value: unknown): AdminSupporterAssetCapabilityPolicyRow | null {
  const row = normalizeJsonObject(value)
  const capabilityKey = toSafeString(row.capabilityKey)
  const label = toSafeString(row.label)
  if (!capabilityKey || !label) return null

  const placementType = normalizePlacementType(row.placementType)
  const tierLevel = placementType === 'tier'
    ? Math.max(1, Math.min(3, toSafeNumber(row.tierLevel) || 1))
    : null

  return {
    capabilityKey,
    label,
    summary: toSafeString(row.summary),
    detail: toSafeString(row.detail),
    where: toSafeString(row.where),
    surfaceGroup: toSafeString(row.surfaceGroup, 'supporters'),
    placementType,
    tierLevel,
    sortOrder: toSafeNumber(row.sortOrder),
    placementLabel: toSafeString(
      row.placementLabel,
      placementType === 'core' ? 'Core' : placementType === 'disabled' ? 'Kapali' : 'Seviye 1',
    ),
    eligibleFansubCount: toSafeNumber(row.eligibleFansubCount),
    liveFansubCount: toSafeNumber(row.liveFansubCount),
  }
}

function mapTierQuotaRow(value: unknown): AdminSupporterAssetTierQuotaRow | null {
  const row = normalizeJsonObject(value)
  const tierLabel = toSafeString(row.tierLabel)
  if (!tierLabel) return null

  return {
    tierLevel: toSafeNumber(row.tierLevel),
    tierLabel,
    emojiLimit: toSafeNumber(row.emojiLimit),
    stickerLimit: toSafeNumber(row.stickerLimit),
  }
}

function mapOverview(value: unknown): AdminSupporterAssetOverview {
  const row = normalizeJsonObject(value)
  return {
    fansubCountWithAssets: toSafeNumber(row.fansubCountWithAssets),
    totalAssetCount: toSafeNumber(row.totalAssetCount),
    totalEmojiCount: toSafeNumber(row.totalEmojiCount),
    totalStickerCount: toSafeNumber(row.totalStickerCount),
    usableAssetCount: toSafeNumber(row.usableAssetCount),
    quotaOutsideAssetCount: toSafeNumber(row.quotaOutsideAssetCount),
    revisedAssetCount: toSafeNumber(row.revisedAssetCount),
    uploadCount30d: toSafeNumber(row.uploadCount30d),
    editCount30d: toSafeNumber(row.editCount30d),
  }
}

function mapTopFansubRow(value: unknown): AdminSupporterAssetTopFansubRow | null {
  const row = normalizeJsonObject(value)
  const fansubId = toSafeString(row.fansubId)
  if (!fansubId) return null

  return {
    fansubId,
    name: toSafeString(row.name, 'Fansub'),
    slug: toSafeString(row.slug),
    tierLevel: toSafeNumber(row.tierLevel),
    emojiCount: toSafeNumber(row.emojiCount),
    stickerCount: toSafeNumber(row.stickerCount),
    totalAssetCount: toSafeNumber(row.totalAssetCount),
    liveAssetCount: toSafeNumber(row.liveAssetCount),
    archivedAssetCount: toSafeNumber(row.archivedAssetCount),
    usableAssetCount: toSafeNumber(row.usableAssetCount),
    lastAssetAt: toNullableString(row.lastAssetAt),
    lastActivityAt: toNullableString(row.lastActivityAt),
    lastActor: mapActor(row.lastActor),
  }
}

function mapLatestAssetRow(value: unknown): AdminSupporterAssetLatestRow | null {
  const row = normalizeJsonObject(value)
  const assetId = toSafeString(row.assetId)
  const fansubId = toSafeString(row.fansubId)
  const assetKind = normalizeAssetKind(row.assetKind)
  const label = toSafeString(row.label)
  const assetRef = toSafeString(row.assetRef)
  if (!assetId || !fansubId || !assetKind || !label || !assetRef) return null

  return {
    assetId,
    fansubId,
    fansubName: toSafeString(row.fansubName, 'Fansub'),
    fansubSlug: toSafeString(row.fansubSlug),
    tierLevel: toSafeNumber(row.tierLevel),
    assetKind,
    shortcode: toSafeString(row.shortcode),
    label,
    assetRef,
    mimeType: toSafeString(row.mimeType),
    width: toSafeNullableNumber(row.width),
    height: toSafeNullableNumber(row.height),
    sizeBytes: toSafeNullableNumber(row.sizeBytes),
    presentation: normalizeFansubSupporterAssetPresentation(
      row.presentation && typeof row.presentation === 'object'
        ? row.presentation as Partial<FansubSupporterAssetPresentation>
        : null,
      assetKind,
    ),
    isActive: toSafeBoolean(row.isActive, true),
    isArchived: toSafeBoolean(row.isArchived, false),
    quotaLimit: toSafeNumber(row.quotaLimit),
    quotaRank: toSafeNullableNumber(row.quotaRank),
    isWithinQuota: toSafeBoolean(row.isWithinQuota, false),
    isUsable: toSafeBoolean(row.isUsable, false),
    currentRevisionId: toNullableString(row.currentRevisionId),
    currentRevisionNumber: toSafeNullableNumber(row.currentRevisionNumber),
    latestRevisionNumber: toSafeNullableNumber(row.latestRevisionNumber),
    currentRevisionCreatedAt: toNullableString(row.currentRevisionCreatedAt),
    currentRevisionCreatedBy: mapActor(row.currentRevisionCreatedBy),
    createdBy: mapActor(row.createdBy),
    updatedBy: mapActor(row.updatedBy),
    deletedBy: mapActor(row.deletedBy),
    createdAt: toNullableString(row.createdAt),
    updatedAt: toNullableString(row.updatedAt),
    deletedAt: toNullableString(row.deletedAt),
  }
}

function mapRevisionRow(value: unknown): AdminSupporterAssetRevisionRow | null {
  const row = normalizeJsonObject(value)
  const revisionId = toSafeString(row.revisionId)
  const assetKind = normalizeAssetKind(row.assetKind)
  const label = toSafeString(row.label)
  const assetRef = toSafeString(row.assetRef)
  if (!revisionId || !assetKind || !label || !assetRef) return null

  return {
    revisionId,
    revisionNumber: Math.max(1, toSafeNumber(row.revisionNumber)),
    assetKind,
    shortcode: toSafeString(row.shortcode),
    label,
    assetRef,
    mimeType: toSafeString(row.mimeType),
    width: toSafeNullableNumber(row.width),
    height: toSafeNullableNumber(row.height),
    sizeBytes: toSafeNullableNumber(row.sizeBytes),
    presentation: normalizeFansubSupporterAssetPresentation(
      row.presentation && typeof row.presentation === 'object'
        ? row.presentation as Partial<FansubSupporterAssetPresentation>
        : null,
      assetKind,
    ),
    createdAt: toNullableString(row.createdAt),
    createdBy: mapActor(row.createdBy),
    isCurrent: toSafeBoolean(row.isCurrent, false),
    isLegacy: toSafeBoolean(row.isLegacy, false),
  }
}

function mapUploaderRow(value: unknown): AdminSupporterAssetUploaderRow | null {
  const row = normalizeJsonObject(value)
  const user = mapActor(row.user)
  if (!user) return null
  return {
    user,
    uploadCount30d: toSafeNumber(row.uploadCount30d),
    editCount30d: toSafeNumber(row.editCount30d),
    fansubCount30d: toSafeNumber(row.fansubCount30d),
    lastActivityAt: toNullableString(row.lastActivityAt),
  }
}

function mapActivityRow(value: unknown): AdminSupporterAssetActivityRow | null {
  const row = normalizeJsonObject(value)
  const eventType = normalizeActivityType(row.eventType)
  const assetId = toSafeString(row.assetId)
  const fansubId = toSafeString(row.fansubId)
  const assetKind = normalizeAssetKind(row.assetKind)
  if (!eventType || !assetId || !fansubId || !assetKind) return null
  return {
    eventType,
    eventLabel: toSafeString(row.eventLabel, eventType),
    assetId,
    fansubId,
    fansubName: toSafeString(row.fansubName, 'Fansub'),
    fansubSlug: toSafeString(row.fansubSlug),
    assetKind,
    shortcode: toSafeString(row.shortcode),
    label: toSafeString(row.label),
    actor: mapActor(row.actor),
    occurredAt: toNullableString(row.occurredAt),
    revisionNumber: toSafeNullableNumber(row.revisionNumber),
  }
}

function mapHealth(value: unknown): AdminSupporterAssetHealth {
  const row = normalizeJsonObject(value)
  return {
    inactiveAssetCount: toSafeNumber(row.inactiveAssetCount),
    archivedAssetCount: toSafeNumber(row.archivedAssetCount),
    quotaOutsideAssetCount: toSafeNumber(row.quotaOutsideAssetCount),
    missingRevisionCount: toSafeNumber(row.missingRevisionCount),
    missingActorCount: toSafeNumber(row.missingActorCount),
    legacyRefCount: toSafeNumber(row.legacyRefCount),
    gifAssetCount: toSafeNumber(row.gifAssetCount),
    standardizedRefCount: toSafeNumber(row.standardizedRefCount),
    lastAssetAt: toNullableString(row.lastAssetAt),
  }
}

function mapTransport(value: unknown): AdminSupporterAssetTransport {
  const row = normalizeJsonObject(value)
  return {
    uploadPath: toSafeString(row.uploadPath, 'cloudflare'),
    assetRefScheme: toSafeString(row.assetRefScheme, 'store-assets://'),
    bucket: toSafeString(row.bucket, 'store-assets'),
  }
}

function mapFansubInventorySummary(value: unknown): AdminSupporterAssetFansubInventorySummary | null {
  const row = normalizeJsonObject(value)
  const fansubId = toSafeString(row.fansubId)
  if (!fansubId) return null
  return {
    fansubId,
    name: toSafeString(row.name, 'Fansub'),
    slug: toSafeString(row.slug),
    tierLevel: toSafeNumber(row.tierLevel),
    emojiLimit: toSafeNumber(row.emojiLimit),
    stickerLimit: toSafeNumber(row.stickerLimit),
    totalAssetCount: toSafeNumber(row.totalAssetCount),
    liveAssetCount: toSafeNumber(row.liveAssetCount),
    archivedAssetCount: toSafeNumber(row.archivedAssetCount),
    usableAssetCount: toSafeNumber(row.usableAssetCount),
    lastAssetAt: toNullableString(row.lastAssetAt),
    lastActivityAt: toNullableString(row.lastActivityAt),
    latestActor: mapActor(row.latestActor),
  }
}

async function callAdminRpc(event: string, rpcName: string, args?: Record<string, unknown>): Promise<JsonObject> {
  const requestContext = createRequestContext('adminSupporterAssetControlService', event)
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc(rpcName, args),
      signal,
    ),
    { label: `adminSupporterAssetControlService.${event}` },
  )

  if (error) {
    adminSupporterAssetLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Supporter asset kontrol verisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return normalizeJsonObject(normalizeRpcPayload<JsonObject>(data))
}

export async function getAdminSupporterAssetControlCenter(): Promise<AdminSupporterAssetControlCenter> {
  const payload = await callAdminRpc('getAdminSupporterAssetControlCenter', 'get_admin_supporter_asset_control_center')

  return {
    generatedAt: toNullableString(payload.generatedAt),
    transport: mapTransport(payload.transport),
    capabilityPolicies: Array.isArray(payload.capabilityPolicies)
      ? payload.capabilityPolicies
        .map(mapCapabilityPolicyRow)
        .filter((row): row is AdminSupporterAssetCapabilityPolicyRow => row !== null)
      : [],
    tierQuotas: Array.isArray(payload.tierQuotas)
      ? payload.tierQuotas
        .map(mapTierQuotaRow)
        .filter((row): row is AdminSupporterAssetTierQuotaRow => row !== null)
      : [],
    overview: mapOverview(payload.overview),
    topFansubs: Array.isArray(payload.topFansubs)
      ? payload.topFansubs
        .map(mapTopFansubRow)
        .filter((row): row is AdminSupporterAssetTopFansubRow => row !== null)
      : [],
    latestAssets: Array.isArray(payload.latestAssets)
      ? payload.latestAssets
        .map(mapLatestAssetRow)
        .filter((row): row is AdminSupporterAssetLatestRow => row !== null)
      : [],
    topUploaders: Array.isArray(payload.topUploaders)
      ? payload.topUploaders
        .map(mapUploaderRow)
        .filter((row): row is AdminSupporterAssetUploaderRow => row !== null)
      : [],
    recentActivity: Array.isArray(payload.recentActivity)
      ? payload.recentActivity
        .map(mapActivityRow)
        .filter((row): row is AdminSupporterAssetActivityRow => row !== null)
      : [],
    health: mapHealth(payload.health),
  }
}

export async function getAdminSupporterAssetFansubInventory(
  fansubId: string,
): Promise<AdminSupporterAssetFansubInventory> {
  const payload = await callAdminRpc('getAdminSupporterAssetFansubInventory', 'get_admin_supporter_asset_fansub_inventory', {
    p_fansub_id: fansubId,
  })

  return {
    fansub: mapFansubInventorySummary(payload.fansub),
    items: Array.isArray(payload.items)
      ? payload.items
        .map(mapLatestAssetRow)
        .filter((row): row is AdminSupporterAssetLatestRow => row !== null)
      : [],
    recentActivity: Array.isArray(payload.recentActivity)
      ? payload.recentActivity
        .map(mapActivityRow)
        .filter((row): row is AdminSupporterAssetActivityRow => row !== null)
      : [],
  }
}

export async function getAdminSupporterAssetDetail(assetId: string): Promise<AdminSupporterAssetDetail> {
  const payload = await callAdminRpc('getAdminSupporterAssetDetail', 'get_admin_supporter_asset_detail', {
    p_asset_id: assetId,
  })

  return {
    asset: mapLatestAssetRow(payload.asset),
    revisions: Array.isArray(payload.revisions)
      ? payload.revisions
        .map(mapRevisionRow)
        .filter((row): row is AdminSupporterAssetRevisionRow => row !== null)
      : [],
  }
}
