import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import type {
  FansubReportedContentFilter,
  FansubReportedContentItem,
  FansubReportedContentStatus,
  FansubReportedContentTargetType,
} from './types'

type JsonObject = Record<string, unknown>

const reportedContentLogger = createScopedLogger('fansubManageService/reportedContent')

function obj(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function str(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function mapItem(raw: unknown): FansubReportedContentItem | null {
  const row = obj(raw)
  const id = String(row.id ?? '')
  const targetType = row.targetType
  if (!id || (targetType !== 'manga' && targetType !== 'chapter')) return null
  const status = row.status
  const safeStatus: FansubReportedContentStatus =
    status === 'fix_submitted' || status === 'resolved' || status === 'dismissed' ? status : 'awaiting_fix'

  return {
    id,
    targetType: targetType as FansubReportedContentTargetType,
    targetId: String(row.targetId ?? ''),
    reportId: str(row.reportId),
    reason: str(row.reason),
    adminNote: str(row.adminNote),
    status: safeStatus,
    removedAt: typeof row.removedAt === 'string' ? row.removedAt : new Date().toISOString(),
    fixNote: str(row.fixNote),
    fixedAt: str(row.fixedAt),
    resolvedAt: str(row.resolvedAt),
    title: str(row.title) || 'Adsiz icerik',
    mangaSlug: str(row.mangaSlug),
    chapterNumber: num(row.chapterNumber),
    preview: str(row.preview),
    category: str(row.category),
    contentIsActive: Boolean(row.contentIsActive),
    contentIsApproved: Boolean(row.contentIsApproved),
    contentExists: row.contentExists !== false,
  }
}

export async function listFansubReportedContent(
  fansubId: string,
  status: FansubReportedContentFilter = 'open',
): Promise<FansubReportedContentItem[]> {
  const requestContext = createRequestContext('fansubManageService/reportedContent', 'listFansubReportedContent', {
    fansubId,
    status,
  })

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_fansub_reported_content', { p_fansub_id: fansubId, p_status: status }),
      signal,
    ),
    { label: 'fansubManageService.listFansubReportedContent' },
  )

  if (error) {
    reportedContentLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Raporlanan icerik kuyrugu yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = obj(Array.isArray(data) ? data[0] : data)
  const items = Array.isArray(payload.items) ? payload.items : []
  return items.map(mapItem).filter((item): item is FansubReportedContentItem => item !== null)
}

export async function submitFansubContentFix(id: string, note?: string): Promise<void> {
  const requestContext = createRequestContext('fansubManageService/reportedContent', 'submitFansubContentFix', { id })

  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('fansub_submit_content_fix', { p_id: id, p_note: note ?? null }),
      signal,
    ),
    { label: 'fansubManageService.submitFansubContentFix' },
  )

  if (error) {
    reportedContentLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Duzeltme gonderilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
}

/**
 * Edits the pages/title of a reported and removed chapter and resubmits it for review in the
 * same step. Only a fansub admin (or site admin) is authorized.
 */
export async function fixReportedChapter(
  id: string,
  input: { title?: string; pages: string[]; note?: string },
): Promise<void> {
  const requestContext = createRequestContext('fansubManageService/reportedContent', 'fixReportedChapter', { id })

  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('fansub_fix_reported_chapter', {
        p_id: id,
        p_title: input.title ?? null,
        p_pages: input.pages,
        p_note: input.note ?? null,
      }),
      signal,
    ),
    { label: 'fansubManageService.fixReportedChapter' },
  )

  if (error) {
    reportedContentLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Bolum duzeltilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
}
