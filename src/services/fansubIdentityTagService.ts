import { withAbortSignal, withServiceTimeout } from './apiResilience'
import {
  parseFansubIdentityTag,
  type FansubIdentityBadgeKey,
  type FansubIdentityTagPresentation,
} from '@/lib/fansubIdentityTags'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { toUserFacingErrorMessage } from './userFacingError'

type JsonRecord = Record<string, unknown>

export interface FansubIdentityBadgeCatalogItem {
  badgeKey: FansubIdentityBadgeKey | string
  label: string
  sortOrder: number
}

export interface FansubIdentityTagManagementItem extends FansubIdentityTagPresentation {
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
  governanceChangedAt: string | null
  cooldownEndsAt: string | null
  canChangeIdentity: boolean
}

const fansubIdentityTagLogger = createScopedLogger('fansubIdentityTagService')

function normalizeRpcPayload<T>(data: unknown): T | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] ?? null) as T | null
  return data as T
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readBoolean(value: unknown) {
  return value === true
}

function readNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : Number(value || 0) || 0
}

function mapBadgeCatalogItem(value: unknown): FansubIdentityBadgeCatalogItem | null {
  const row = asRecord(value)
  if (!row) return null

  const badgeKey = readString(row.badgeKey ?? row.badge_key)
  const label = readString(row.label)
  if (!badgeKey || !label) return null

  return {
    badgeKey,
    label,
    sortOrder: readNumber(row.sortOrder ?? row.sort_order),
  }
}

function mapManagementItem(value: unknown): FansubIdentityTagManagementItem | null {
  const base = parseFansubIdentityTag(value)
  const row = asRecord(value)
  if (!base || !row) return null

  return {
    ...base,
    isActive: readBoolean(row.isActive ?? row.is_active),
    createdAt: readString(row.createdAt ?? row.created_at) || null,
    updatedAt: readString(row.updatedAt ?? row.updated_at) || null,
    governanceChangedAt: readString(row.governanceChangedAt ?? row.governance_changed_at) || null,
    cooldownEndsAt: readString(row.cooldownEndsAt ?? row.cooldown_ends_at) || null,
    canChangeIdentity: readBoolean(row.canChangeIdentity ?? row.can_change_identity) || false,
  }
}

export interface MySelectableFansubIdentityTag extends FansubIdentityTagPresentation {
  isSelected: boolean
}

function mapSelectableItem(value: unknown): MySelectableFansubIdentityTag | null {
  const base = parseFansubIdentityTag(value)
  const row = asRecord(value)
  if (!base || !row) return null

  return {
    ...base,
    isSelected: readBoolean(row.isSelected ?? row.is_selected),
  }
}

function getE2ESelectableFansubIdentityTags(): MySelectableFansubIdentityTag[] {
  return [
    {
      id: 'e2e-identity-tag',
      fansubId: 'e2e-fansub-1',
      fansubName: 'E2E Fansub',
      fansubSlug: 'e2e-fansub',
      audience: 'supporter',
      shortcode: 'MZ',
      badgeKey: 'bolt',
      isSelected: true,
    },
    {
      id: 'e2e-identity-tag-reader',
      fansubId: 'e2e-fansub-2',
      fansubName: 'Azure Scans',
      fansubSlug: 'azure-scans',
      audience: 'member',
      shortcode: 'AZR',
      badgeKey: 'gem',
      isSelected: false,
    },
  ]
}

export async function listFansubIdentityBadgeCatalog(signal?: AbortSignal) {
  const requestContext = createRequestContext('fansubIdentityTagService', 'listFansubIdentityBadgeCatalog')
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase.rpc('list_fansub_identity_badge_catalog'),
      nextSignal,
    ),
    { label: 'fansubIdentityTagService.listFansubIdentityBadgeCatalog', signal },
  )

  if (error) {
    fansubIdentityTagLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Etiket rozet katalogu yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as unknown[])
    .map(mapBadgeCatalogItem)
    .filter((item): item is FansubIdentityBadgeCatalogItem => item !== null)
}

export async function listFansubIdentityTagsForManagement(fansubId: string) {
  const requestContext = createRequestContext('fansubIdentityTagService', 'listFansubIdentityTagsForManagement', {
    fansubId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_fansub_identity_tags_for_management', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubIdentityTagService.listFansubIdentityTagsForManagement' },
  )

  if (error) {
    fansubIdentityTagLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub etiketleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as unknown[])
    .map(mapManagementItem)
    .filter((item): item is FansubIdentityTagManagementItem => item !== null)
}

export async function upsertFansubIdentityTag(input: {
  fansubId: string
  shortcode: string
  badgeKey: string
  isActive: boolean
}) {
  const requestContext = createRequestContext('fansubIdentityTagService', 'upsertFansubIdentityTag', {
    fansubId: input.fansubId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('upsert_fansub_identity_tag', {
        p_fansub_id: input.fansubId,
        p_shortcode: input.shortcode,
        p_badge_key: input.badgeKey,
        p_is_active: input.isActive,
      }),
      signal,
    ),
    { label: 'fansubIdentityTagService.upsertFansubIdentityTag' },
  )

  if (error) {
    fansubIdentityTagLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub etiketi kaydedilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = mapManagementItem(normalizeRpcPayload(data))
  if (!payload) {
    throw new Error('Fansub etiketi yaniti bos dondu.')
  }

  return payload
}

export async function listMySelectableFansubIdentityTags(signal?: AbortSignal) {
  if (isE2EModeEnabled()) return getE2ESelectableFansubIdentityTags()

  const requestContext = createRequestContext('fansubIdentityTagService', 'listMySelectableFansubIdentityTags')
  const { data, error } = await withServiceTimeout(
    (nextSignal) => withAbortSignal(
      supabase.rpc('list_my_selectable_fansub_identity_tags'),
      nextSignal,
    ),
    { label: 'fansubIdentityTagService.listMySelectableFansubIdentityTags', signal },
  )

  if (error) {
    fansubIdentityTagLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Secilebilir fansub etiketleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return ((data || []) as unknown[])
    .map(mapSelectableItem)
    .filter((item): item is MySelectableFansubIdentityTag => item !== null)
}

export async function setMyActiveFansubIdentityTag(tagId: string | null) {
  const requestContext = createRequestContext('fansubIdentityTagService', 'setMyActiveFansubIdentityTag', {
    hasTagId: Boolean(tagId),
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_my_active_fansub_identity_tag', {
        p_tag_id: tagId,
      }),
      signal,
    ),
    { label: 'fansubIdentityTagService.setMyActiveFansubIdentityTag' },
  )

  if (error) {
    fansubIdentityTagLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Aktif fansub etiketi guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = asRecord(normalizeRpcPayload<JsonRecord>(data))
  return {
    success: readBoolean(payload?.success),
    activeTag: parseFansubIdentityTag(payload?.activeTag ?? null),
  }
}
