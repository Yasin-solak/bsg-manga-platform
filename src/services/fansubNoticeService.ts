import {
  FANSUB_PINNED_NOTICE_BODY_MAX,
  FANSUB_PINNED_NOTICE_MAX_COUNT,
  FANSUB_PINNED_NOTICE_TITLE_MAX,
  FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX,
  FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX,
  normalizeFansubNoticeActionTarget,
  type FansubNoticeActionTarget,
} from '@/lib/fansubNotices'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'
import { getCurrentUserIdentity } from './userService/selfIdentity'

type DbFansubPinnedNoticeRow = {
  id: string
  fansub_id: string
  slot_index: number
  title: string
  body: string
  action_target: string
  target_entity_id: string | null
  action_label: string | null
  action_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type DbFansubNotificationBroadcastRow = {
  id: string
  fansub_id: string
  title: string
  message: string
  route_target: string
  target_entity_id: string | null
  route_label: string | null
  route_hint: string | null
  recipient_count: number
  created_at: string
  users:
    | {
      id: string
      username: string
      avatar_url: string | null
    }
    | Array<{
      id: string
      username: string
      avatar_url: string | null
    }>
    | null
}

type FansubSpecialNotificationRpcResult = {
  success: boolean
  broadcast_id: string
  fansub_id: string
  title: string
  message: string
  route_target: string
  target_entity_id: string | null
  route_label: string | null
  route_hint: string | null
  recipient_count: number
  created_at: string
}

export interface FansubPinnedNotice {
  id: string
  fansubId: string
  slotIndex: number
  title: string
  body: string
  actionTarget: FansubNoticeActionTarget
  targetEntityId: string | null
  actionLabel: string | null
  actionUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface FansubNotificationBroadcast {
  id: string
  fansubId: string
  title: string
  message: string
  routeTarget: FansubNoticeActionTarget
  targetEntityId: string | null
  routeLabel: string | null
  routeHint: string | null
  recipientCount: number
  createdAt: string
  createdBy: {
    id: string
    username: string
    avatarUrl: string | null
  } | null
}

export interface UpsertFansubPinnedNoticeInput {
  fansubId: string
  slotIndex: number
  title: string
  body: string
  actionTarget: FansubNoticeActionTarget
  targetEntityId: string
  isActive: boolean
}

export interface SendFansubSpecialNotificationInput {
  fansubId: string
  title: string
  message: string
  routeTarget: FansubNoticeActionTarget
  targetEntityId: string
}

const fansubNoticeLogger = createScopedLogger('fansubNoticeService')

const PINNED_NOTICE_SELECT = `
  id,
  fansub_id,
  slot_index,
  title,
  body,
  action_target,
  target_entity_id,
  action_label,
  action_url,
  is_active,
  created_at,
  updated_at
`

const BROADCAST_SELECT = `
  id,
  fansub_id,
  title,
  message,
  route_target,
  target_entity_id,
  route_label,
  route_hint,
  recipient_count,
  created_at,
  users:created_by (
    id,
    username,
    avatar_url
  )
`

function mapPinnedNoticeRow(row: DbFansubPinnedNoticeRow | null | undefined): FansubPinnedNotice | null {
  if (!row?.id || !row?.fansub_id) return null

  return {
    id: row.id,
    fansubId: row.fansub_id,
    slotIndex: Number(row.slot_index || 0),
    title: row.title?.trim() || 'Duyuru',
    body: row.body?.trim() || '',
    actionTarget: normalizeFansubNoticeActionTarget(row.action_target),
    targetEntityId: row.target_entity_id || null,
    actionLabel: typeof row.action_label === 'string' ? row.action_label : null,
    actionUrl: typeof row.action_url === 'string' ? row.action_url : null,
    isActive: row.is_active === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBroadcastRow(row: DbFansubNotificationBroadcastRow | null | undefined): FansubNotificationBroadcast | null {
  if (!row?.id || !row?.fansub_id) return null
  const creator = Array.isArray(row.users) ? row.users[0] : row.users

  return {
    id: row.id,
    fansubId: row.fansub_id,
    title: row.title?.trim() || 'Ozel bildirim',
    message: row.message?.trim() || '',
    routeTarget: normalizeFansubNoticeActionTarget(row.route_target),
    targetEntityId: row.target_entity_id || null,
    routeLabel: typeof row.route_label === 'string' ? row.route_label : null,
    routeHint: typeof row.route_hint === 'string' ? row.route_hint : null,
    recipientCount: Number(row.recipient_count || 0),
    createdAt: row.created_at,
    createdBy: creator?.id
      ? {
          id: creator.id,
          username: creator.username || 'Bilinmeyen kullanici',
          avatarUrl: creator.avatar_url || null,
        }
      : null,
  }
}

function normalizeTitle(value: string, label: string, maxLength: number) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} bos olamaz.`)
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} en fazla ${maxLength} karakter olabilir.`)
  }
  return normalized
}

function normalizeBody(value: string, label: string, maxLength: number) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} bos olamaz.`)
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} en fazla ${maxLength} karakter olabilir.`)
  }
  return normalized
}

function normalizeSlotIndex(value: number) {
  const normalized = Number.isFinite(value) ? Math.floor(value) : -1
  if (normalized < 0 || normalized >= FANSUB_PINNED_NOTICE_MAX_COUNT) {
    throw new Error(`Sabitlenmis duyuru slotu 1 ile ${FANSUB_PINNED_NOTICE_MAX_COUNT} arasinda olmalidir.`)
  }
  return normalized
}

function normalizeTargetEntityId(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${label} secilmelidir.`)
  }
  return normalized
}

function logServiceError(event: string, error: unknown, message: string, context?: Record<string, unknown>) {
  const requestContext = createRequestContext('fansubNoticeService', event, context)
  fansubNoticeLogger.error({
    event: requestContext.event,
    message: toUserFacingErrorMessage(error, message),
    context: toRequestContextLogContext(requestContext),
    error,
  })
}

export async function listPublicFansubPinnedNotices(fansubId: string): Promise<FansubPinnedNotice[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_pinned_notices')
        .select(PINNED_NOTICE_SELECT)
        .eq('fansub_id', fansubId)
        .eq('is_active', true)
        .order('slot_index', { ascending: true })
        .limit(FANSUB_PINNED_NOTICE_MAX_COUNT),
      signal,
    ),
    { label: 'fansubNoticeService.listPublicFansubPinnedNotices' },
  )

  if (error) {
    logServiceError('list-public-pinned-notices', error, 'Sabitlenmis duyurular yuklenemedi.', { fansubId })
    throw error
  }

  return ((data || []) as DbFansubPinnedNoticeRow[])
    .map(mapPinnedNoticeRow)
    .filter((row): row is FansubPinnedNotice => row !== null)
}

export async function listManageFansubPinnedNotices(fansubId: string): Promise<FansubPinnedNotice[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_pinned_notices')
        .select(PINNED_NOTICE_SELECT)
        .eq('fansub_id', fansubId)
        .order('slot_index', { ascending: true })
        .limit(FANSUB_PINNED_NOTICE_MAX_COUNT),
      signal,
    ),
    { label: 'fansubNoticeService.listManageFansubPinnedNotices' },
  )

  if (error) {
    logServiceError('list-manage-pinned-notices', error, 'Yonetim duyurulari yuklenemedi.', { fansubId })
    throw error
  }

  return ((data || []) as DbFansubPinnedNoticeRow[])
    .map(mapPinnedNoticeRow)
    .filter((row): row is FansubPinnedNotice => row !== null)
}

export async function upsertFansubPinnedNotice(input: UpsertFansubPinnedNoticeInput): Promise<FansubPinnedNotice> {
  const actor = await getCurrentUserIdentity({ required: true })
  const slotIndex = normalizeSlotIndex(input.slotIndex)
  const title = normalizeTitle(input.title, 'Duyuru basligi', FANSUB_PINNED_NOTICE_TITLE_MAX)
  const body = normalizeBody(input.body, 'Duyuru metni', FANSUB_PINNED_NOTICE_BODY_MAX)
  const actionTarget = normalizeFansubNoticeActionTarget(input.actionTarget)
  const targetEntityId = normalizeTargetEntityId(input.targetEntityId, 'Duyuru hedefi')

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('upsert_fansub_pinned_notice', {
        p_fansub_id: input.fansubId,
        p_slot_index: slotIndex,
        p_title: title,
        p_body: body,
        p_action_target: actionTarget,
        p_target_entity_id: targetEntityId,
        p_is_active: input.isActive,
      }),
      signal,
    ),
    { label: 'fansubNoticeService.upsertFansubPinnedNotice' },
  )

  if (error) {
    logServiceError('upsert-pinned-notice', error, 'Sabitlenmis duyuru kaydedilemedi.', {
      fansubId: input.fansubId,
      slotIndex,
      actorId: actor?.id || null,
      targetEntityId,
      isActive: input.isActive,
    })
    throw error
  }

  const notice = mapPinnedNoticeRow((Array.isArray(data) ? data[0] : data) as DbFansubPinnedNoticeRow | null)
  if (!notice) {
    throw new Error('Sabitlenmis duyuru yaniti bos dondu.')
  }
  return notice
}

export async function listFansubSpecialNotificationBroadcasts(
  fansubId: string,
  limit = 10,
): Promise<FansubNotificationBroadcast[]> {
  const normalizedLimit = Math.min(Math.max(Math.floor(limit || 10), 1), 30)
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_special_notification_broadcasts')
        .select(BROADCAST_SELECT)
        .eq('fansub_id', fansubId)
        .order('created_at', { ascending: false })
        .limit(normalizedLimit),
      signal,
    ),
    { label: 'fansubNoticeService.listFansubSpecialNotificationBroadcasts' },
  )

  if (error) {
    logServiceError('list-special-notification-broadcasts', error, 'Ozel bildirim gecmisi yuklenemedi.', {
      fansubId,
      limit: normalizedLimit,
    })
    throw error
  }

  return ((data || []) as DbFansubNotificationBroadcastRow[])
    .map(mapBroadcastRow)
    .filter((row): row is FansubNotificationBroadcast => row !== null)
}

export async function sendFansubSpecialNotification(
  input: SendFansubSpecialNotificationInput,
): Promise<FansubNotificationBroadcast> {
  const actor = await getCurrentUserIdentity({ required: true })
  const title = normalizeTitle(input.title, 'Bildirim basligi', FANSUB_SPECIAL_NOTIFICATION_TITLE_MAX)
  const message = normalizeBody(input.message, 'Bildirim metni', FANSUB_SPECIAL_NOTIFICATION_MESSAGE_MAX)
  const routeTarget = normalizeFansubNoticeActionTarget(input.routeTarget)
  const targetEntityId = normalizeTargetEntityId(input.targetEntityId, 'Bildirim hedefi')

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('send_fansub_special_notification', {
        p_fansub_id: input.fansubId,
        p_title: title,
        p_message: message,
        p_route_target: routeTarget,
        p_target_entity_id: targetEntityId,
      }),
      signal,
    ),
    { label: 'fansubNoticeService.sendFansubSpecialNotification' },
  )

  if (error) {
    logServiceError('send-special-notification', error, 'Ozel bildirim gonderilemedi.', {
      fansubId: input.fansubId,
      actorId: actor?.id || null,
      routeTarget,
      targetEntityId,
    })
    throw error
  }

  const payload = (Array.isArray(data) ? data[0] : data) as FansubSpecialNotificationRpcResult | null
  if (!payload?.broadcast_id) {
    throw new Error('Ozel bildirim yaniti bos dondu.')
  }

  return {
    id: payload.broadcast_id,
    fansubId: payload.fansub_id,
    title: payload.title,
    message: payload.message,
    routeTarget: normalizeFansubNoticeActionTarget(payload.route_target),
    targetEntityId: payload.target_entity_id || null,
    routeLabel: typeof payload.route_label === 'string' ? payload.route_label : null,
    routeHint: payload.route_hint,
    recipientCount: Number(payload.recipient_count || 0),
    createdAt: payload.created_at,
    createdBy: actor
      ? {
          id: actor.id,
          username: actor.username || 'Bilinmeyen kullanici',
          avatarUrl: actor.avatar_url || null,
        }
      : null,
  }
}

/**
 * Removes a pinned notice from publication or republishes it. Removal is not blocked by boost and
 * target checks; republishing needs a Level 1 boost and a valid target.
 */
export async function setFansubPinnedNoticeActive(fansubId: string, slotIndex: number, isActive: boolean): Promise<boolean> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_fansub_pinned_notice_active', {
        p_fansub_id: fansubId,
        p_slot_index: normalizeSlotIndex(slotIndex),
        p_is_active: isActive,
      }),
      signal,
    ),
    { label: 'fansubNoticeService.setFansubPinnedNoticeActive' },
  )
  if (error) {
    logServiceError('set-pinned-notice-active', error, 'Duyuru durumu degistirilemedi.', { fansubId, slotIndex, isActive })
    throw error
  }
  return data === true
}

export async function deleteFansubPinnedNotice(fansubId: string, slotIndex: number): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('delete_fansub_pinned_notice', { p_fansub_id: fansubId, p_slot_index: normalizeSlotIndex(slotIndex) }),
      signal,
    ),
    { label: 'fansubNoticeService.deleteFansubPinnedNotice' },
  )
  if (error) {
    logServiceError('delete-pinned-notice', error, 'Duyuru silinemedi.', { fansubId, slotIndex })
    throw error
  }
}
