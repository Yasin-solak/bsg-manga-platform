import {
  FANSUB_CHAPTER_CREDIT_BODY_MAX,
  FANSUB_CHAPTER_CREDIT_CTA_LABEL_MAX,
  FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT,
  FANSUB_CHAPTER_CREDIT_MAX_SUPPORTER_COUNT,
  FANSUB_CHAPTER_CREDIT_MIN_SUPPORTER_COUNT,
  FANSUB_CHAPTER_CREDIT_TITLE_MAX,
  clampFansubChapterCreditSupporterCount,
  normalizeFansubChapterCreditCtaTarget,
  normalizeFansubChapterCreditOverrideMode,
  resolveFansubChapterCreditFallbackCopy,
  type FansubChapterCreditCtaTarget,
  type FansubChapterCreditOverrideMode,
} from '@/lib/fansubChapterCredit'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

type JsonObject = Record<string, unknown>

type RpcChapterCreditSettingsPayload = {
  fansubId?: unknown
  isEnabled?: unknown
  title?: unknown
  body?: unknown
  ctaLabel?: unknown
  ctaTarget?: unknown
  showMetrics?: unknown
  showSupporters?: unknown
  maxSupporterCount?: unknown
  createdAt?: unknown
  updatedAt?: unknown
} | null

type RpcChapterCreditOverridePayload = {
  chapterId?: unknown
  fansubId?: unknown
  mangaId?: unknown
  mangaTitle?: unknown
  mangaSlug?: unknown
  chapterNumber?: unknown
  chapterTitle?: unknown
  publishAt?: unknown
  chapterCreatedAt?: unknown
  overrideMode?: unknown
  title?: unknown
  body?: unknown
  ctaLabel?: unknown
  ctaTarget?: unknown
  showMetrics?: unknown
  showSupporters?: unknown
  maxSupporterCount?: unknown
  createdAt?: unknown
  updatedAt?: unknown
} | null

type RpcChapterCreditOverrideListPayload = {
  items?: Array<JsonObject | null> | null
} | null

type RpcEffectiveChapterCreditPayload = {
  fansubId?: unknown
  chapterId?: unknown
  overrideMode?: unknown
  source?: unknown
  title?: unknown
  body?: unknown
  ctaLabel?: unknown
  ctaTarget?: unknown
  showMetrics?: unknown
  showSupporters?: unknown
  maxSupporterCount?: unknown
} | null

export interface FansubChapterCreditSettings {
  fansubId: string
  isEnabled: boolean
  title: string | null
  body: string | null
  ctaLabel: string | null
  ctaTarget: FansubChapterCreditCtaTarget | null
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: number
  createdAt: string | null
  updatedAt: string | null
}

export interface FansubChapterCreditOverride {
  chapterId: string
  fansubId: string
  mangaId: string
  mangaTitle: string
  mangaSlug: string | null
  chapterNumber: number
  chapterTitle: string | null
  publishAt: string | null
  chapterCreatedAt: string | null
  overrideMode: FansubChapterCreditOverrideMode
  title: string | null
  body: string | null
  ctaLabel: string | null
  ctaTarget: FansubChapterCreditCtaTarget | null
  showMetrics: boolean | null
  showSupporters: boolean | null
  maxSupporterCount: number | null
  createdAt: string | null
  updatedAt: string | null
}

export interface EffectivePublicFansubChapterCreditConfig {
  fansubId: string
  chapterId: string
  overrideMode: FansubChapterCreditOverrideMode
  source: 'default' | 'override'
  title: string | null
  body: string | null
  ctaLabel: string | null
  ctaTarget: FansubChapterCreditCtaTarget | null
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: number
}

export interface ResolvedPublicFansubChapterCreditConfig extends EffectivePublicFansubChapterCreditConfig {
  title: string
  body: string
  ctaLabel: string
}

export interface UpsertFansubChapterCreditSettingsInput {
  fansubId: string
  isEnabled: boolean
  title?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaTarget?: FansubChapterCreditCtaTarget | null
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: number
}

export interface UpsertFansubChapterCreditOverrideInput {
  fansubId: string
  chapterId: string
  overrideMode: FansubChapterCreditOverrideMode
  title?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaTarget?: FansubChapterCreditCtaTarget | null
  showMetrics?: boolean | null
  showSupporters?: boolean | null
  maxSupporterCount?: number | null
}

const fansubChapterCreditLogger = createScopedLogger('fansubChapterCreditService')

function normalizeRpcPayload<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null
  }
  return (data || null) as T | null
}

function toSafeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toSafeNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toSafeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeOptionalText(value: string | null | undefined, label: string, maxLength: number) {
  const normalized = value?.trim() || ''
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw new Error(`${label} en fazla ${maxLength} karakter olabilir.`)
  }
  return normalized
}

function mapSettingsPayload(payload: RpcChapterCreditSettingsPayload, fansubIdFallback: string): FansubChapterCreditSettings {
  return {
    fansubId: toSafeString(payload?.fansubId) || fansubIdFallback,
    isEnabled: toSafeBoolean(payload?.isEnabled, false),
    title: toSafeString(payload?.title),
    body: toSafeString(payload?.body),
    ctaLabel: toSafeString(payload?.ctaLabel),
    ctaTarget: normalizeFansubChapterCreditCtaTarget(toSafeString(payload?.ctaTarget)),
    showMetrics: toSafeBoolean(payload?.showMetrics, true),
    showSupporters: toSafeBoolean(payload?.showSupporters, true),
    maxSupporterCount: clampFansubChapterCreditSupporterCount(toSafeNumber(payload?.maxSupporterCount)),
    createdAt: toSafeString(payload?.createdAt),
    updatedAt: toSafeString(payload?.updatedAt),
  }
}

function mapOverridePayload(payload: RpcChapterCreditOverridePayload): FansubChapterCreditOverride | null {
  const chapterId = toSafeString(payload?.chapterId)
  const fansubId = toSafeString(payload?.fansubId)
  const mangaId = toSafeString(payload?.mangaId)
  const mangaTitle = toSafeString(payload?.mangaTitle)
  const chapterNumber = toSafeNumber(payload?.chapterNumber)

  if (!chapterId || !fansubId || !mangaId || !mangaTitle || chapterNumber == null) {
    return null
  }

  return {
    chapterId,
    fansubId,
    mangaId,
    mangaTitle,
    mangaSlug: toSafeString(payload?.mangaSlug),
    chapterNumber,
    chapterTitle: toSafeString(payload?.chapterTitle),
    publishAt: toSafeString(payload?.publishAt),
    chapterCreatedAt: toSafeString(payload?.chapterCreatedAt),
    overrideMode: normalizeFansubChapterCreditOverrideMode(toSafeString(payload?.overrideMode)),
    title: toSafeString(payload?.title),
    body: toSafeString(payload?.body),
    ctaLabel: toSafeString(payload?.ctaLabel),
    ctaTarget: normalizeFansubChapterCreditCtaTarget(toSafeString(payload?.ctaTarget)),
    showMetrics: typeof payload?.showMetrics === 'boolean' ? payload.showMetrics : null,
    showSupporters: typeof payload?.showSupporters === 'boolean' ? payload.showSupporters : null,
    maxSupporterCount: payload?.maxSupporterCount == null
      ? null
      : clampFansubChapterCreditSupporterCount(toSafeNumber(payload?.maxSupporterCount)),
    createdAt: toSafeString(payload?.createdAt),
    updatedAt: toSafeString(payload?.updatedAt),
  }
}

function mapEffectivePayload(
  payload: RpcEffectiveChapterCreditPayload,
  fansubId: string,
  chapterId: string,
): EffectivePublicFansubChapterCreditConfig | null {
  if (!payload) return null

  return {
    fansubId: toSafeString(payload.fansubId) || fansubId,
    chapterId: toSafeString(payload.chapterId) || chapterId,
    overrideMode: normalizeFansubChapterCreditOverrideMode(toSafeString(payload.overrideMode)),
    source: payload.source === 'override' ? 'override' : 'default',
    title: toSafeString(payload.title),
    body: toSafeString(payload.body),
    ctaLabel: toSafeString(payload.ctaLabel),
    ctaTarget: normalizeFansubChapterCreditCtaTarget(toSafeString(payload.ctaTarget)),
    showMetrics: toSafeBoolean(payload.showMetrics, true),
    showSupporters: toSafeBoolean(payload.showSupporters, true),
    maxSupporterCount: clampFansubChapterCreditSupporterCount(toSafeNumber(payload.maxSupporterCount)),
  }
}

function logServiceError(event: string, error: unknown, message: string, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('fansubChapterCreditService', event, context)
  fansubChapterCreditLogger.error({
    event: requestContext.event,
    message: toUserFacingErrorMessage(error, message),
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

export function resolvePublicFansubChapterCreditConfig(
  config: EffectivePublicFansubChapterCreditConfig,
  fansubName: string,
): ResolvedPublicFansubChapterCreditConfig {
  const fallback = resolveFansubChapterCreditFallbackCopy(fansubName)

  return {
    ...config,
    title: config.title?.trim() || fallback.title,
    body: config.body?.trim() || fallback.body,
    ctaLabel: config.ctaTarget ? (config.ctaLabel?.trim() || fallback.ctaLabel) : '',
  }
}

export async function getFansubManageChapterCreditSettings(
  fansubId: string,
): Promise<FansubChapterCreditSettings> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_chapter_credit_settings', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubChapterCreditService.getFansubManageChapterCreditSettings' },
  )

  if (error) {
    logServiceError('get-manage-settings', error, 'Kapanis kredisi ayarlari yuklenemedi.', { fansubId })
    throw error
  }

  return mapSettingsPayload(normalizeRpcPayload<RpcChapterCreditSettingsPayload>(data), fansubId)
}

export async function upsertFansubChapterCreditSettings(
  input: UpsertFansubChapterCreditSettingsInput,
): Promise<FansubChapterCreditSettings> {
  const title = normalizeOptionalText(input.title ?? null, 'Kapanis kredisi basligi', FANSUB_CHAPTER_CREDIT_TITLE_MAX)
  const body = normalizeOptionalText(input.body ?? null, 'Kapanis kredisi aciklamasi', FANSUB_CHAPTER_CREDIT_BODY_MAX)
  const ctaLabel = normalizeOptionalText(input.ctaLabel ?? null, 'CTA metni', FANSUB_CHAPTER_CREDIT_CTA_LABEL_MAX)
  const ctaTarget = input.ctaTarget ? normalizeFansubChapterCreditCtaTarget(input.ctaTarget) : null

  if (ctaLabel && !ctaTarget) {
    throw new Error('CTA metni girildiginde hedef secilmelidir.')
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('upsert_fansub_chapter_credit_settings', {
        p_fansub_id: input.fansubId,
        p_is_enabled: input.isEnabled,
        p_title: title,
        p_body: body,
        p_cta_label: ctaLabel,
        p_cta_target: ctaTarget,
        p_show_metrics: input.showMetrics,
        p_show_supporters: input.showSupporters,
        p_max_supporter_count: clampFansubChapterCreditSupporterCount(input.maxSupporterCount),
      }),
      signal,
    ),
    { label: 'fansubChapterCreditService.upsertFansubChapterCreditSettings' },
  )

  if (error) {
    logServiceError('upsert-settings', error, 'Kapanis kredisi ayarlari kaydedilemedi.', {
      fansubId: input.fansubId,
    })
    throw error
  }

  return mapSettingsPayload(normalizeRpcPayload<RpcChapterCreditSettingsPayload>(data), input.fansubId)
}

export async function listFansubManageChapterCreditOverrides(
  fansubId: string,
): Promise<FansubChapterCreditOverride[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_fansub_manage_chapter_credit_overrides', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubChapterCreditService.listFansubManageChapterCreditOverrides' },
  )

  if (error) {
    logServiceError('list-manage-overrides', error, 'Kapanis kredisi override kayitlari yuklenemedi.', {
      fansubId,
    })
    throw error
  }

  const payload = normalizeRpcPayload<RpcChapterCreditOverrideListPayload>(data)
  return (payload?.items || [])
    .map((row) => mapOverridePayload(row as RpcChapterCreditOverridePayload))
    .filter((row): row is FansubChapterCreditOverride => row !== null)
}

export async function upsertFansubChapterCreditOverride(
  input: UpsertFansubChapterCreditOverrideInput,
): Promise<FansubChapterCreditOverride | { chapterId: string; fansubId: string; overrideMode: 'inherit' }> {
  const overrideMode = normalizeFansubChapterCreditOverrideMode(input.overrideMode)
  const title = normalizeOptionalText(input.title ?? null, 'Override basligi', FANSUB_CHAPTER_CREDIT_TITLE_MAX)
  const body = normalizeOptionalText(input.body ?? null, 'Override aciklamasi', FANSUB_CHAPTER_CREDIT_BODY_MAX)
  const ctaLabel = normalizeOptionalText(input.ctaLabel ?? null, 'CTA metni', FANSUB_CHAPTER_CREDIT_CTA_LABEL_MAX)
  const ctaTarget = input.ctaTarget ? normalizeFansubChapterCreditCtaTarget(input.ctaTarget) : null

  if (ctaLabel && !ctaTarget) {
    throw new Error('CTA metni girildiginde hedef secilmelidir.')
  }

  if (input.maxSupporterCount != null) {
    const normalizedCount = Number(input.maxSupporterCount)
    if (!Number.isFinite(normalizedCount)
      || normalizedCount < FANSUB_CHAPTER_CREDIT_MIN_SUPPORTER_COUNT
      || normalizedCount > FANSUB_CHAPTER_CREDIT_MAX_SUPPORTER_COUNT) {
      throw new Error(
        `Supporter sayisi ${FANSUB_CHAPTER_CREDIT_MIN_SUPPORTER_COUNT} ile ${FANSUB_CHAPTER_CREDIT_MAX_SUPPORTER_COUNT} arasinda olmalidir.`,
      )
    }
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('upsert_fansub_chapter_credit_override', {
        p_fansub_id: input.fansubId,
        p_chapter_id: input.chapterId,
        p_override_mode: overrideMode,
        p_title: title,
        p_body: body,
        p_cta_label: ctaLabel,
        p_cta_target: ctaTarget,
        p_show_metrics: input.showMetrics ?? null,
        p_show_supporters: input.showSupporters ?? null,
        p_max_supporter_count: input.maxSupporterCount == null
          ? null
          : clampFansubChapterCreditSupporterCount(input.maxSupporterCount),
      }),
      signal,
    ),
    { label: 'fansubChapterCreditService.upsertFansubChapterCreditOverride' },
  )

  if (error) {
    logServiceError('upsert-override', error, 'Kapanis kredisi override kaydi kaydedilemedi.', {
      fansubId: input.fansubId,
      chapterId: input.chapterId,
      overrideMode,
    })
    throw error
  }

  const payload = normalizeRpcPayload<RpcChapterCreditOverridePayload & {
    chapterId?: unknown
    fansubId?: unknown
    overrideMode?: unknown
  }>(data)

  if (normalizeFansubChapterCreditOverrideMode(toSafeString(payload?.overrideMode)) === 'inherit') {
    return {
      chapterId: toSafeString(payload?.chapterId) || input.chapterId,
      fansubId: toSafeString(payload?.fansubId) || input.fansubId,
      overrideMode: 'inherit',
    }
  }

  const mapped = mapOverridePayload(payload)
  if (!mapped) {
    throw new Error('Kapanis kredisi override yaniti bos dondu.')
  }
  return mapped
}

export async function getEffectivePublicFansubChapterCreditConfig(
  fansubId: string,
  chapterId: string,
): Promise<EffectivePublicFansubChapterCreditConfig | null> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_effective_public_chapter_credit_config', {
        p_fansub_id: fansubId,
        p_chapter_id: chapterId,
      }),
      signal,
    ),
    { label: 'fansubChapterCreditService.getEffectivePublicFansubChapterCreditConfig' },
  )

  if (error) {
    logServiceError('get-effective-public-config', error, 'Public kapanis kredisi ayarlari yuklenemedi.', {
      fansubId,
      chapterId,
    })
    throw error
  }

  return mapEffectivePayload(
    normalizeRpcPayload<RpcEffectiveChapterCreditPayload>(data),
    fansubId,
    chapterId,
  )
}

export function createDefaultFansubChapterCreditSettings(
  fansubId: string,
): FansubChapterCreditSettings {
  return {
    fansubId,
    isEnabled: false,
    title: null,
    body: null,
    ctaLabel: null,
    ctaTarget: null,
    showMetrics: true,
    showSupporters: true,
    maxSupporterCount: FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT,
    createdAt: null,
    updatedAt: null,
  }
}
