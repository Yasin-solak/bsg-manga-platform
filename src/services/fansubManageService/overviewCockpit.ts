import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import type {
  FansubManageOverviewCockpit,
  FansubOverviewCommunity,
  FansubOverviewPipeline,
  FansubOverviewQueueItem,
  FansubOverviewTeam,
  FansubOverviewUpcoming,
} from './types'

type JsonObject = Record<string, unknown>

const cockpitLogger = createScopedLogger('fansubManageService/overviewCockpit')

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function str(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function obj(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function mapPipeline(value: JsonObject): FansubOverviewPipeline {
  return {
    draft: num(value.draft),
    pending: num(value.pending),
    scheduled: num(value.scheduled),
    published: num(value.published),
    problem: num(value.problem),
  }
}

function mapQueueItem(value: JsonObject): FansubOverviewQueueItem | null {
  const id = str(value.id)
  const kind = value.kind
  if (!id || (kind !== 'chapter' && kind !== 'manga')) return null
  return {
    kind,
    id,
    title: str(value.title) || 'Baslıksiz',
    subtitle: str(value.subtitle) || '',
    at: str(value.at),
  }
}

function mapUpcoming(value: JsonObject): FansubOverviewUpcoming | null {
  const id = str(value.id)
  if (!id) return null
  return {
    id,
    mangaTitle: str(value.mangaTitle) || 'Adsiz manga',
    mangaSlug: str(value.mangaSlug) || '',
    coverImageUrl: str(value.coverImageUrl),
    chapterNumber: num(value.chapterNumber),
    title: str(value.title),
    publishAt: str(value.publishAt),
  }
}

function mapTeam(value: JsonObject): FansubOverviewTeam {
  const rawTags = Array.isArray(value.tags) ? value.tags : []
  const tags = rawTags
    .map((entry) => obj(entry))
    .map((entry) => ({ tag: str(entry.tag) || '', count: num(entry.count) }))
    .filter((entry) => entry.tag.length > 0)
  return {
    total: num(value.total),
    admins: num(value.admins),
    moderators: num(value.moderators),
    members: num(value.members),
    tags,
  }
}

function mapCommunity(value: JsonObject): FansubOverviewCommunity {
  return {
    commentsToday: num(value.commentsToday),
  }
}

/**
 * getFansubManageOverviewCockpit: single-call data for the Overview cockpit.
 *
 * Gathers surfaces beyond the analytics summary (publishing line, approval queue, upcoming
 * releases, team breakdown, daily community summary) with one RPC. The permission
 * gate is the same as the summary: site admin or fansub staff.
 */
export async function getFansubManageOverviewCockpit(
  fansubId: string,
): Promise<FansubManageOverviewCockpit> {
  const requestContext = createRequestContext(
    'fansubManageService/overviewCockpit',
    'getFansubManageOverviewCockpit',
    { fansubId },
  )

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_overview_cockpit', { p_fansub_id: fansubId }),
      signal,
    ),
    { label: 'fansubManageService.getFansubManageOverviewCockpit' },
  )

  if (error) {
    cockpitLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Genel bakis kokpiti yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = obj(Array.isArray(data) ? data[0] : data)

  return {
    pipeline: mapPipeline(obj(payload.pipeline)),
    approvalQueue: (Array.isArray(payload.approvalQueue) ? payload.approvalQueue : [])
      .map((entry) => mapQueueItem(obj(entry)))
      .filter((entry): entry is FansubOverviewQueueItem => entry !== null),
    upcoming: (Array.isArray(payload.upcoming) ? payload.upcoming : [])
      .map((entry) => mapUpcoming(obj(entry)))
      .filter((entry): entry is FansubOverviewUpcoming => entry !== null),
    team: mapTeam(obj(payload.team)),
    community: mapCommunity(obj(payload.community)),
  }
}
