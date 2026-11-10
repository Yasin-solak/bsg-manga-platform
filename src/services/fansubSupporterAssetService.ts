import {
  isValidFansubSupporterAssetShortcode,
  normalizeFansubSupporterAssetShortcode,
  type FansubSupporterAssetKind,
} from '@/lib/fansubSupporterAssetTokens'
import {
  FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH,
  normalizeFansubSupporterAssetPresentation,
  type FansubSupporterAssetPresentation,
} from '@/lib/fansubSupporterAssetPresentation'
import { isAbortLikeError, withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { getE2EMockAuthUser } from '@/testing/e2eMocks'
import { toUserFacingErrorMessage } from './userFacingError'

type JsonObject = Record<string, unknown>

type RpcFansubSupporterAssetCatalogRow = {
  id?: unknown
  fansub_id?: unknown
  fansubId?: unknown
  asset_kind?: unknown
  assetKind?: unknown
  shortcode?: unknown
  label?: unknown
  asset_ref?: unknown
  assetRef?: unknown
  mime_type?: unknown
  mimeType?: unknown
  width?: unknown
  height?: unknown
  size_bytes?: unknown
  sizeBytes?: unknown
  is_active?: unknown
  isActive?: unknown
  sort_order?: unknown
  sortOrder?: unknown
  quota_limit?: unknown
  quotaLimit?: unknown
  quota_rank?: unknown
  quotaRank?: unknown
  is_within_quota?: unknown
  isWithinQuota?: unknown
  is_usable?: unknown
  isUsable?: unknown
  presentation?: unknown
  current_revision_id?: unknown
  currentRevisionId?: unknown
  current_revision_number?: unknown
  currentRevisionNumber?: unknown
  legacy_revision_id?: unknown
  legacyRevisionId?: unknown
  legacy_revision_number?: unknown
  legacyRevisionNumber?: unknown
  created_at?: unknown
  createdAt?: unknown
  updated_at?: unknown
  updatedAt?: unknown
}

type RpcFansubSupporterAssetRenderCatalogRow = {
  revision_id?: unknown
  revisionId?: unknown
  asset_id?: unknown
  assetId?: unknown
  fansub_id?: unknown
  fansubId?: unknown
  asset_kind?: unknown
  assetKind?: unknown
  shortcode?: unknown
  label?: unknown
  asset_ref?: unknown
  assetRef?: unknown
  mime_type?: unknown
  mimeType?: unknown
  width?: unknown
  height?: unknown
  size_bytes?: unknown
  sizeBytes?: unknown
  presentation?: unknown
  revision_number?: unknown
  revisionNumber?: unknown
  created_at?: unknown
  createdAt?: unknown
}

type RpcFansubSupporterAssetBundle = {
  fansubId?: unknown
  supporterUserId?: unknown
  supporterRewardTier?: unknown
  canUseSupporterEmojis?: unknown
  canUseSupporterStickers?: unknown
  supporterEmojiSlotLimit?: unknown
  supporterStickerSlotLimit?: unknown
  rewardCapabilities?: unknown
} | null

type RpcManageFansubSupporterAssetsPayload = {
  fansubId?: unknown
  supporterEmojiSlotLimit?: unknown
  supporterStickerSlotLimit?: unknown
  items?: Array<JsonObject | null> | null
} | null

export interface FansubSupporterAssetCatalogItem {
  id: string
  fansubId: string
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  assetRef: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  isActive: boolean
  sortOrder: number
  quotaLimit: number
  quotaRank: number
  isWithinQuota: boolean
  isUsable: boolean
  presentation: FansubSupporterAssetPresentation
  currentRevisionId: string | null
  currentRevisionNumber: number | null
  legacyRevisionId: string | null
  legacyRevisionNumber: number | null
  createdAt: string | null
  updatedAt: string | null
}

export interface FansubSupporterAssetRenderCatalogItem {
  revisionId: string
  assetId: string
  fansubId: string
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  assetRef: string
  mimeType: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  presentation: FansubSupporterAssetPresentation
  revisionNumber: number
  createdAt: string | null
}

export interface FansubSupporterAssetViewerBundle {
  fansubId: string
  supporterUserId: string | null
  supporterRewardTier: number
  canUseSupporterEmojis: boolean
  canUseSupporterStickers: boolean
  supporterEmojiSlotLimit: number
  supporterStickerSlotLimit: number
  rewardCapabilities: JsonObject
}

export interface FansubManageSupporterAssetsPayload {
  fansubId: string
  supporterEmojiSlotLimit: number
  supporterStickerSlotLimit: number
  items: FansubSupporterAssetCatalogItem[]
}

export interface CreateFansubSupporterAssetInput {
  fansubId: string
  assetKind: FansubSupporterAssetKind
  shortcode: string
  label: string
  assetRef: string
  mimeType: string
  width?: number | null
  height?: number | null
  sizeBytes?: number | null
  presentation?: Partial<FansubSupporterAssetPresentation> | null
}

export interface UpdateFansubSupporterAssetInput {
  id: string
  fansubId: string
  isActive?: boolean
  sortOrder?: number
}

const fansubSupporterAssetLogger = createScopedLogger('fansubSupporterAssetService')
const renderCatalogCache = new Map<string, FansubSupporterAssetRenderCatalogItem>()
const renderCatalogInFlight = new Map<string, Promise<FansubSupporterAssetRenderCatalogItem[]>>()

export type { FansubSupporterAssetKind } from '@/lib/fansubSupporterAssetTokens'

function normalizeRpcPayload<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null
  }
  return (data || null) as T | null
}

function toSafeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toSafeNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toSafeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeAssetKind(value: unknown): FansubSupporterAssetKind | null {
  return value === 'emoji' || value === 'sticker' ? value : null
}

function normalizeLabel(value: string, fallbackShortcode?: string) {
  const normalized = value.trim()
  if (normalized.length > 0) return normalized.slice(0, FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH)
  return (fallbackShortcode || 'Yeni ifade').slice(0, FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH)
}

function normalizeShortcode(value: string) {
  const normalized = normalizeFansubSupporterAssetShortcode(value)
  if (!isValidFansubSupporterAssetShortcode(normalized)) {
    throw new Error('Kisa kod yalniz kucuk harf, rakam, tire ve alt cizgi icerebilir.')
  }
  return normalized
}

function mapCatalogRow(row: RpcFansubSupporterAssetCatalogRow | null | undefined): FansubSupporterAssetCatalogItem | null {
  const id = toSafeString(row?.id)
  const fansubId = toSafeString(row?.fansub_id) || toSafeString(row?.fansubId)
  const assetKind = normalizeAssetKind(row?.asset_kind) || normalizeAssetKind(row?.assetKind)
  const shortcode = toSafeString(row?.shortcode)
  const label = toSafeString(row?.label)
  const assetRef = toSafeString(row?.asset_ref) || toSafeString(row?.assetRef)
  const mimeType = toSafeString(row?.mime_type) || toSafeString(row?.mimeType)

  if (!id || !fansubId || !assetKind || !shortcode || !label || !assetRef || !mimeType) {
    return null
  }

  return {
    id,
    fansubId,
    assetKind,
    shortcode,
    label,
    assetRef,
    mimeType,
    width: toSafeNumber(row?.width),
    height: toSafeNumber(row?.height),
    sizeBytes: toSafeNumber(row?.size_bytes) ?? toSafeNumber(row?.sizeBytes),
    isActive: toSafeBoolean(row?.is_active, toSafeBoolean(row?.isActive, true)),
    sortOrder: toSafeNumber(row?.sort_order) ?? toSafeNumber(row?.sortOrder) ?? 100,
    quotaLimit: Math.max(0, toSafeNumber(row?.quota_limit) ?? toSafeNumber(row?.quotaLimit) ?? 0),
    quotaRank: Math.max(1, toSafeNumber(row?.quota_rank) ?? toSafeNumber(row?.quotaRank) ?? 1),
    isWithinQuota: toSafeBoolean(row?.is_within_quota, toSafeBoolean(row?.isWithinQuota, false)),
    isUsable: toSafeBoolean(row?.is_usable, toSafeBoolean(row?.isUsable, false)),
    presentation: normalizeFansubSupporterAssetPresentation(
      row?.presentation && typeof row.presentation === 'object' ? row.presentation as Partial<FansubSupporterAssetPresentation> : null,
      assetKind,
    ),
    currentRevisionId: toSafeString(row?.current_revision_id) || toSafeString(row?.currentRevisionId),
    currentRevisionNumber: toSafeNumber(row?.current_revision_number) ?? toSafeNumber(row?.currentRevisionNumber),
    legacyRevisionId: toSafeString(row?.legacy_revision_id) || toSafeString(row?.legacyRevisionId),
    legacyRevisionNumber: toSafeNumber(row?.legacy_revision_number) ?? toSafeNumber(row?.legacyRevisionNumber),
    createdAt: toSafeString(row?.created_at) || toSafeString(row?.createdAt),
    updatedAt: toSafeString(row?.updated_at) || toSafeString(row?.updatedAt),
  }
}

function mapRenderCatalogRow(row: RpcFansubSupporterAssetRenderCatalogRow | null | undefined): FansubSupporterAssetRenderCatalogItem | null {
  const revisionId = toSafeString(row?.revision_id) || toSafeString(row?.revisionId)
  const assetId = toSafeString(row?.asset_id) || toSafeString(row?.assetId)
  const fansubId = toSafeString(row?.fansub_id) || toSafeString(row?.fansubId)
  const assetKind = normalizeAssetKind(row?.asset_kind) || normalizeAssetKind(row?.assetKind)
  const shortcode = toSafeString(row?.shortcode)
  const label = toSafeString(row?.label)
  const assetRef = toSafeString(row?.asset_ref) || toSafeString(row?.assetRef)
  const mimeType = toSafeString(row?.mime_type) || toSafeString(row?.mimeType)

  if (!revisionId || !assetId || !fansubId || !assetKind || !shortcode || !label || !assetRef || !mimeType) {
    return null
  }

  return {
    revisionId,
    assetId,
    fansubId,
    assetKind,
    shortcode,
    label,
    assetRef,
    mimeType,
    width: toSafeNumber(row?.width),
    height: toSafeNumber(row?.height),
    sizeBytes: toSafeNumber(row?.size_bytes) ?? toSafeNumber(row?.sizeBytes),
    presentation: normalizeFansubSupporterAssetPresentation(
      row?.presentation && typeof row.presentation === 'object' ? row.presentation as Partial<FansubSupporterAssetPresentation> : null,
      assetKind,
    ),
    revisionNumber: Math.max(1, toSafeNumber(row?.revision_number) ?? toSafeNumber(row?.revisionNumber) ?? 1),
    createdAt: toSafeString(row?.created_at) || toSafeString(row?.createdAt),
  }
}

function mapManagePayload(payload: RpcManageFansubSupporterAssetsPayload, fansubId: string): FansubManageSupporterAssetsPayload {
  return {
    fansubId: toSafeString(payload?.fansubId) || fansubId,
    supporterEmojiSlotLimit: Math.max(0, toSafeNumber(payload?.supporterEmojiSlotLimit) ?? 0),
    supporterStickerSlotLimit: Math.max(0, toSafeNumber(payload?.supporterStickerSlotLimit) ?? 0),
    items: (payload?.items || [])
      .map((item) => mapCatalogRow(item as RpcFansubSupporterAssetCatalogRow))
      .filter((item): item is FansubSupporterAssetCatalogItem => item !== null),
  }
}

function mapViewerBundle(payload: RpcFansubSupporterAssetBundle, fansubId: string): FansubSupporterAssetViewerBundle {
  return {
    fansubId: toSafeString(payload?.fansubId) || fansubId,
    supporterUserId: toSafeString(payload?.supporterUserId),
    supporterRewardTier: Math.max(0, toSafeNumber(payload?.supporterRewardTier) ?? 0),
    canUseSupporterEmojis: toSafeBoolean(payload?.canUseSupporterEmojis, false),
    canUseSupporterStickers: toSafeBoolean(payload?.canUseSupporterStickers, false),
    supporterEmojiSlotLimit: Math.max(0, toSafeNumber(payload?.supporterEmojiSlotLimit) ?? 0),
    supporterStickerSlotLimit: Math.max(0, toSafeNumber(payload?.supporterStickerSlotLimit) ?? 0),
    rewardCapabilities: payload?.rewardCapabilities && typeof payload.rewardCapabilities === 'object'
      ? payload.rewardCapabilities as JsonObject
      : {},
  }
}

async function getImageDimensions(file: File) {
  if (!file.type.startsWith('image/')) {
    return { width: null, height: null }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('Gorsel boyutu okunamadi.'))
      image.src = objectUrl
    })
    return dimensions
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function logServiceError(event: string, error: unknown, message: string, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('fansubSupporterAssetService', event, context)
  fansubSupporterAssetLogger.error({
    event: requestContext.event,
    message: toUserFacingErrorMessage(error, message),
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

async function fetchAssetById(
  fansubId: string,
  assetId: string,
  assetKind?: FansubSupporterAssetKind,
): Promise<FansubSupporterAssetCatalogItem> {
  const items = await listPublicFansubSupporterAssets(fansubId, assetKind)
  const asset = items.find((entry) => entry.id === assetId)
  if (!asset) {
    throw new Error('Supporter asset kaydi yenilenemedi.')
  }
  return asset
}

export async function listPublicFansubSupporterAssets(
  fansubId: string,
  assetKind?: FansubSupporterAssetKind,
  signal?: AbortSignal,
): Promise<FansubSupporterAssetCatalogItem[]> {
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase.rpc('list_public_fansub_supporter_assets', {
        p_fansub_id: fansubId,
        p_asset_kind: assetKind ?? null,
      }),
      nextSignal,
    ),
    { label: 'fansubSupporterAssetService.listPublicFansubSupporterAssets', signal },
  )

  if (error) {
    logServiceError('list-public-assets', error, 'Supporter assetleri yuklenemedi.', { fansubId, assetKind: assetKind ?? null })
    throw error
  }

  return ((data || []) as RpcFansubSupporterAssetCatalogRow[])
    .map((row) => mapCatalogRow(row))
    .filter((row): row is FansubSupporterAssetCatalogItem => row !== null)
}

async function requestPublicFansubSupporterAssetRenderCatalog(
  revisionIds: string[],
  signal?: AbortSignal,
) {
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase.rpc('get_public_fansub_supporter_asset_render_catalog', {
        p_revision_ids: revisionIds,
      }),
      nextSignal,
    ),
    { label: 'fansubSupporterAssetService.getPublicFansubSupporterAssetRenderCatalog', signal },
  )

  if (error) {
    if (!isAbortLikeError(error)) {
      logServiceError('get-render-catalog', error, 'Supporter asset revizyonlari yuklenemedi.', {
        revisionCount: revisionIds.length,
      })
    }
    throw error
  }

  const mapped = ((data || []) as RpcFansubSupporterAssetRenderCatalogRow[])
    .map((row) => mapRenderCatalogRow(row))
    .filter((row): row is FansubSupporterAssetRenderCatalogItem => row !== null)

  mapped.forEach((item) => {
    renderCatalogCache.set(item.revisionId, item)
  })

  return mapped
}

export async function getPublicFansubSupporterAssetRenderCatalog(
  revisionIds: string[],
  signal?: AbortSignal,
): Promise<FansubSupporterAssetRenderCatalogItem[]> {
  const normalizedRevisionIds = Array.from(
    new Set(
      revisionIds
        .map((revisionId) => revisionId.trim().toLowerCase())
        .filter((revisionId) => revisionId.length > 0),
    ),
  )

  if (normalizedRevisionIds.length === 0) return []

  const missingRevisionIds = normalizedRevisionIds.filter((revisionId) => !renderCatalogCache.has(revisionId))

  if (missingRevisionIds.length > 0) {
    // If abort-bound requests enter the global in-flight cache, in StrictMode/cancel scenarios a later
    // healthy call binds to a cancelled promise and the preview stays empty.
    if (signal) {
      await requestPublicFansubSupporterAssetRenderCatalog(missingRevisionIds, signal)
    } else {
    const cacheKey = missingRevisionIds.slice().sort().join(',')
    let request = renderCatalogInFlight.get(cacheKey)

    if (!request) {
      request = requestPublicFansubSupporterAssetRenderCatalog(missingRevisionIds)

      renderCatalogInFlight.set(cacheKey, request)
      void request.finally(() => {
        renderCatalogInFlight.delete(cacheKey)
      })
    }

    await request
    }
  }

  return normalizedRevisionIds
    .map((revisionId) => renderCatalogCache.get(revisionId))
    .filter((item): item is FansubSupporterAssetRenderCatalogItem => item !== undefined)
}

export async function getMyFansubSupporterAssetBundle(
  fansubId: string,
): Promise<FansubSupporterAssetViewerBundle> {
  const e2eMockUser = getE2EMockAuthUser()
  if (e2eMockUser) {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.rpc('get_my_fansub_supporter_asset_bundle', {
          p_fansub_id: fansubId,
        }),
        signal,
      ),
      { label: 'fansubSupporterAssetService.getMyFansubSupporterAssetBundle.e2e' },
    )

    if (error) {
      logServiceError('get-viewer-bundle-e2e', error, 'Supporter asset yetkileri yuklenemedi.', { fansubId })
      throw error
    }

    return mapViewerBundle(normalizeRpcPayload<RpcFansubSupporterAssetBundle>(data), fansubId)
  }

  const sessionResult = await supabase.auth.getSession()
  if (!sessionResult.data.session?.user?.id) {
    return mapViewerBundle(null, fansubId)
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_my_fansub_supporter_asset_bundle', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubSupporterAssetService.getMyFansubSupporterAssetBundle' },
  )

  if (error) {
    logServiceError('get-viewer-bundle', error, 'Supporter asset yetkileri yuklenemedi.', { fansubId })
    throw error
  }

  return mapViewerBundle(normalizeRpcPayload<RpcFansubSupporterAssetBundle>(data), fansubId)
}

export async function getFansubManageSupporterAssets(
  fansubId: string,
): Promise<FansubManageSupporterAssetsPayload> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_supporter_assets', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubSupporterAssetService.getFansubManageSupporterAssets' },
  )

  if (error) {
    logServiceError('get-manage-assets', error, 'Supporter asset yonetim verisi yuklenemedi.', { fansubId })
    throw error
  }

  return mapManagePayload(normalizeRpcPayload<RpcManageFansubSupporterAssetsPayload>(data), fansubId)
}

export interface FansubSupporterAssetUsageItem {
  shortcode: string
  assetKind: FansubSupporterAssetKind
  uses: number
}

/**
 * Fansub ifadelerinin (emoji/cikartma) topluluk icerigindeki kullanim sayilarini
 * dondurur (post + yorum token taramasi). Yalniz fansub ekibi/admin gorebilir.
 */
export async function getFansubSupporterAssetUsage(
  fansubId: string,
): Promise<FansubSupporterAssetUsageItem[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_supporter_asset_usage', { p_fansub_id: fansubId }),
      signal,
    ),
    { label: 'fansubSupporterAssetService.getFansubSupporterAssetUsage' },
  )

  if (error) {
    logServiceError('get-asset-usage', error, 'Ifade kullanim analitigi yuklenemedi.', { fansubId })
    throw error
  }

  const payload = (Array.isArray(data) ? data[0] : data) as { items?: unknown } | null
  const rawItems = payload && Array.isArray(payload.items) ? payload.items : []
  return rawItems
    .map((raw) => {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      return {
        shortcode: String(row.shortcode ?? ''),
        assetKind: row.assetKind === 'sticker' ? 'sticker' as const : 'emoji' as const,
        uses: Number(row.uses) || 0,
      }
    })
    .filter((item) => item.shortcode.length > 0)
}

export async function createFansubSupporterAsset(
  input: CreateFansubSupporterAssetInput,
): Promise<FansubSupporterAssetCatalogItem> {
  const normalizedShortcode = normalizeShortcode(input.shortcode)
  const normalizedLabel = normalizeLabel(input.label, normalizedShortcode)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_supporter_assets')
        .insert({
          fansub_id: input.fansubId,
          asset_kind: input.assetKind,
          shortcode: normalizedShortcode,
          label: normalizedLabel,
          asset_ref: input.assetRef,
          mime_type: input.mimeType,
          width: input.width ?? null,
          height: input.height ?? null,
          size_bytes: input.sizeBytes ?? null,
          presentation: normalizeFansubSupporterAssetPresentation(input.presentation, input.assetKind),
          is_active: true,
        })
        .select('id')
        .single(),
      signal,
    ),
    { label: 'fansubSupporterAssetService.createFansubSupporterAsset' },
  )

  if (error) {
    logServiceError('create-asset', error, 'Supporter asseti kaydedilemedi.', {
      fansubId: input.fansubId,
      assetKind: input.assetKind,
      shortcode: normalizedShortcode,
    })
    throw error
  }

  const assetId = toSafeString((data as { id?: unknown } | null | undefined)?.id)
  if (!assetId) {
    throw new Error('Supporter asset yaniti bos dondu.')
  }

  return fetchAssetById(input.fansubId, assetId, input.assetKind)
}

export async function updateFansubSupporterAsset(
  input: UpdateFansubSupporterAssetInput,
): Promise<FansubSupporterAssetCatalogItem> {
  const patch: Record<string, unknown> = {}

  if (typeof input.isActive === 'boolean') {
    patch.is_active = input.isActive
  }
  if (typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)) {
    patch.sort_order = Math.max(0, Math.trunc(input.sortOrder))
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('Guncellenecek alan bulunamadi.')
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_supporter_assets')
        .update(patch)
        .eq('id', input.id)
        .eq('fansub_id', input.fansubId)
        .is('deleted_at', null)
        .select('id')
        .single(),
      signal,
    ),
    { label: 'fansubSupporterAssetService.updateFansubSupporterAsset' },
  )

  if (error || !data?.id) {
    logServiceError('update-asset', error, 'Supporter asseti guncellenemedi.', {
      assetId: input.id,
      fansubId: input.fansubId,
    })
    throw error || new Error('Supporter asseti guncellenemedi.')
  }

  return fetchAssetById(input.fansubId, input.id)
}

export async function editFansubSupporterAssetPresentation(
  fansubId: string,
  assetId: string,
  assetKind: FansubSupporterAssetKind,
  presentation: Partial<FansubSupporterAssetPresentation> | null,
): Promise<FansubSupporterAssetCatalogItem> {
  const normalizedPresentation = normalizeFansubSupporterAssetPresentation(presentation, assetKind)
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('edit_fansub_supporter_asset_presentation', {
        p_asset_id: assetId,
        p_fansub_id: fansubId,
        p_presentation: normalizedPresentation,
      }),
      signal,
    ),
    { label: 'fansubSupporterAssetService.editFansubSupporterAssetPresentation' },
  )

  if (error) {
    logServiceError('edit-asset-presentation', error, 'Supporter asset duzenlenemedi.', {
      fansubId,
      assetId,
      assetKind,
    })
    throw error
  }

  const mapped = mapCatalogRow(normalizeRpcPayload<RpcFansubSupporterAssetCatalogRow>(data))
  if (!mapped) {
    throw new Error('Supporter asset duzenleme yaniti bos dondu.')
  }

  return mapped
}

export async function archiveFansubSupporterAsset(
  fansubId: string,
  assetId: string,
): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('soft_delete_fansub_supporter_asset', {
        p_asset_id: assetId,
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubSupporterAssetService.archiveFansubSupporterAsset' },
  )

  if (error) {
    logServiceError('archive-asset', error, 'Supporter asset silinemedi.', { fansubId, assetId })
    throw error
  }
}

export async function reorderFansubSupporterAssets(
  fansubId: string,
  items: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  for (const item of items) {
    await updateFansubSupporterAsset({
      id: item.id,
      fansubId,
      sortOrder: item.sortOrder,
    })
  }
}

export async function buildFansubSupporterAssetCreatePayload(
  input: Omit<CreateFansubSupporterAssetInput, 'shortcode' | 'label' | 'mimeType' | 'width' | 'height' | 'sizeBytes'> & {
    shortcode: string
    label: string
    file: File
  },
): Promise<CreateFansubSupporterAssetInput> {
  const normalizedShortcode = normalizeShortcode(input.shortcode)
  const normalizedLabel = normalizeLabel(input.label, normalizedShortcode)
  const dimensions = await getImageDimensions(input.file)

  return {
    fansubId: input.fansubId,
    assetKind: input.assetKind,
    shortcode: normalizedShortcode,
    label: normalizedLabel,
    assetRef: input.assetRef,
    mimeType: input.file.type,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: input.file.size,
    presentation: normalizeFansubSupporterAssetPresentation(input.presentation, input.assetKind),
  }
}
