import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import type {
  FansubManageActivityTimeseries,
  FansubManageAnalyticsActivityActor,
  FansubManageAnalyticsActivityItem,
  FansubManageAnalyticsChapterStatusGroup,
  FansubManageAnalyticsMangaStatusGroup,
  FansubManageAnalyticsMomentum,
  FansubManageAnalyticsOverview,
  FansubManageAnalyticsSummary,
  FansubManageAnalyticsTopManga,
} from './types'

type JsonObject = Record<string, unknown>

type RpcAnalyticsPayload = {
  overview?: JsonObject | null
  momentum?: JsonObject | null
  statuses?: {
    mangas?: JsonObject | null
    chapters?: JsonObject | null
  } | null
  topMangas?: Array<JsonObject | null> | null
  recentActivity?: Array<JsonObject | null> | null
} | null

const fansubManageStatsLogger = createScopedLogger('fansubManageService/stats')

function normalizeRpcPayload<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] ?? null) as T | null
  }
  return (data || null) as T | null
}

function toSafeNumber(value: unknown) {
  return Number.isFinite(value) ? Number(value) : Number(value || 0) || 0
}

function toSafeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function toSafeBoolean(value: unknown) {
  return value === true
}

function mapOverview(value: JsonObject | null | undefined): FansubManageAnalyticsOverview {
  return {
    followerCount: toSafeNumber(value?.followerCount),
    totalViews: toSafeNumber(value?.totalViews),
    totalDonationAmount: toSafeNumber(value?.totalDonationAmount),
    totalDonationCount: toSafeNumber(value?.totalDonationCount),
    totalMangaCount: toSafeNumber(value?.totalMangaCount),
    totalChapterCount: toSafeNumber(value?.totalChapterCount),
    lastDonationAt: toSafeString(value?.lastDonationAt),
  }
}

function mapMomentum(value: JsonObject | null | undefined): FansubManageAnalyticsMomentum {
  return {
    newFollowers7d: toSafeNumber(value?.newFollowers7d),
    newFollowers30d: toSafeNumber(value?.newFollowers30d),
    newChapters7d: toSafeNumber(value?.newChapters7d),
    newChapters30d: toSafeNumber(value?.newChapters30d),
    donationCount7d: toSafeNumber(value?.donationCount7d),
    donationCount30d: toSafeNumber(value?.donationCount30d),
    donationAmount7d: toSafeNumber(value?.donationAmount7d),
    donationAmount30d: toSafeNumber(value?.donationAmount30d),
  }
}

function mapMangaStatuses(value: JsonObject | null | undefined): FansubManageAnalyticsMangaStatusGroup {
  return {
    approved: toSafeNumber(value?.approved),
    pending: toSafeNumber(value?.pending),
    active: toSafeNumber(value?.active),
    inactive: toSafeNumber(value?.inactive),
  }
}

function mapChapterStatuses(value: JsonObject | null | undefined): FansubManageAnalyticsChapterStatusGroup {
  return {
    approved: toSafeNumber(value?.approved),
    pending: toSafeNumber(value?.pending),
    scheduled: toSafeNumber(value?.scheduled),
  }
}

function mapTopManga(value: JsonObject | null | undefined): FansubManageAnalyticsTopManga | null {
  if (!value?.id || typeof value.title !== 'string' || typeof value.slug !== 'string') {
    return null
  }

  return {
    id: String(value.id),
    title: value.title,
    slug: value.slug,
    totalViews: toSafeNumber(value.totalViews),
    followerCount: toSafeNumber(value.followerCount),
    lastChapterNumber: value.lastChapterNumber == null ? null : toSafeNumber(value.lastChapterNumber),
    isApproved: toSafeBoolean(value.isApproved),
    isActive: toSafeBoolean(value.isActive),
  }
}

function toSafeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function mapActivityActor(value: JsonObject | null | undefined): FansubManageAnalyticsActivityActor {
  return {
    id: toSafeString(value?.id),
    username: toSafeString(value?.username),
    avatarUrl: toSafeString(value?.avatarUrl),
    role: toSafeString(value?.role) || 'system',
  }
}

function mapActivityItem(value: JsonObject | null | undefined): FansubManageAnalyticsActivityItem | null {
  if (!value?.id || typeof value.action !== 'string' || typeof value.resourceType !== 'string') {
    return null
  }

  return {
    id: String(value.id),
    action: value.action,
    resourceType: value.resourceType,
    resourceId: toSafeString(value.resourceId),
    summary: toSafeString(value.summary) || value.action,
    metadata: toSafeObject(value.metadata),
    createdAt: toSafeString(value.createdAt),
    actor: mapActivityActor(toSafeObject(value.actor)),
  }
}

export async function getFansubManageAnalyticsSummary(
  fansubId: string,
): Promise<FansubManageAnalyticsSummary> {
  const requestContext = createRequestContext('fansubManageService/stats', 'getFansubManageAnalyticsSummary', {
    fansubId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_analytics_summary', {
        p_fansub_id: fansubId,
      }),
      signal,
    ),
    { label: 'fansubManageService.getFansubManageAnalyticsSummary' },
  )

  if (error) {
    fansubManageStatsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub analizleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = normalizeRpcPayload<RpcAnalyticsPayload>(data)

  return {
    overview: mapOverview(payload?.overview),
    momentum: mapMomentum(payload?.momentum),
    statuses: {
      mangas: mapMangaStatuses(payload?.statuses?.mangas),
      chapters: mapChapterStatuses(payload?.statuses?.chapters),
    },
    topMangas: (payload?.topMangas || [])
      .map(mapTopManga)
      .filter((row): row is FansubManageAnalyticsTopManga => row !== null),
    recentActivity: (payload?.recentActivity || [])
      .map(mapActivityItem)
      .filter((row): row is FansubManageAnalyticsActivityItem => row !== null),
  }
}

/** UTC gun anahtari (YYYY-MM-DD) uretir. */
function utcDayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * getFansubManageActivityTimeseries: produces the daily activity series.
 *
 * Why client-side aggregation: timestamped source tables (fansub_follows,
 * chapters, fansub_transactions) are readable by fansub staff through RLS.
 * Fetching within a date window keeps it light and produces a real series without extra
 * migrations/RPCs. It can move to a server RPC when it needs to scale.
 */
export async function getFansubManageActivityTimeseries(
  fansubId: string,
  days = 30,
): Promise<FansubManageActivityTimeseries> {
  const dayCount = Math.max(7, Math.min(90, Math.floor(days) || 30))
  const now = new Date()
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const startMs = todayUtcMs - (dayCount - 1) * 86_400_000
  const startIso = new Date(startMs).toISOString()

  const dayKeys: string[] = []
  const indexByDay = new Map<string, number>()
  for (let i = 0; i < dayCount; i += 1) {
    const key = utcDayKey(startMs + i * 86_400_000)
    dayKeys.push(key)
    indexByDay.set(key, i)
  }

  const followers = new Array<number>(dayCount).fill(0)
  const chapters = new Array<number>(dayCount).fill(0)
  const donationAmount = new Array<number>(dayCount).fill(0)

  const addRow = (bucket: number[], createdAt: unknown, weight = 1) => {
    if (typeof createdAt !== 'string' || !createdAt) return
    const slot = indexByDay.get(createdAt.slice(0, 10))
    if (slot != null) bucket[slot] += weight
  }

  const [followRes, chapterRes, donationRes] = await Promise.all([
    supabase.from('fansub_follows').select('created_at').eq('fansub_id', fansubId).gte('created_at', startIso).limit(5000),
    supabase.from('chapters').select('created_at').eq('fansub_id', fansubId).gte('created_at', startIso).limit(5000),
    supabase.from('fansub_transactions').select('created_at, amount').eq('fansub_id', fansubId).eq('type', 'donation').gte('created_at', startIso).limit(5000),
  ])

  for (const row of (followRes.data as Array<{ created_at?: string }> | null) || []) addRow(followers, row.created_at)
  for (const row of (chapterRes.data as Array<{ created_at?: string }> | null) || []) addRow(chapters, row.created_at)
  for (const row of (donationRes.data as Array<{ created_at?: string; amount?: number }> | null) || []) {
    addRow(donationAmount, row.created_at, Math.max(0, Number(row.amount) || 0))
  }

  return { days: dayKeys, followers, chapters, donationAmount }
}
