import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import {
  FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY,
  writeStoredColumnCapability,
} from '../dbSchemaCapability'
import { buildFansubCardCosmeticMap } from '../fansubCosmeticService'
import { createScopedLogger } from '../logger'
import { getPublicChapterUnlockCutoffIso } from '../premiumPackagePublicService'
import { createRequestContext, toRequestContextLogContext, type RequestContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getE2EMockFansubMangas, getE2EMockFansubs } from '@/testing/e2eMocks'
import {
  type DbFansub,
  type DbManga,
  type FansubChapterMangaLookupRow,
  type FansubMangaListResult,
  type ListFansubMangasOptions,
  mapDbFansub,
  mapDbManga,
} from './shared'

const FANSUB_MANGA_SELECT = `
  id,
  fansub_id,
  title,
  slug,
  cover_image_url,
  description,
  status,
  rating,
  total_ratings,
  total_views,
  is_new,
  last_chapter_number,
  is_approved,
  is_active
`

const fansubCatalogLogger = createScopedLogger('fansubService/catalog')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Displayable avatar map for the given fansub ids (avatar_url ?? dicebear fallback).
// Used to show the sending fansub's avatar in the notification panel.
export async function getFansubAvatarMap(fansubIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(fansubIds.filter((id) => typeof id === 'string' && UUID_PATTERN.test(id))))
  if (ids.length === 0) return {}

  const { data, error } = await supabase
    .from('fansubs')
    .select('id, slug, avatar_url')
    .in('id', ids)

  if (error || !data) return {}

  const map: Record<string, string> = {}
  for (const row of data as { id: string; slug: string; avatar_url: string | null }[]) {
    map[row.id] = row.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${row.slug}`
  }
  return map
}
// Without hover_theme the detail page did not see the theme, and edit > save sent it empty and deleted it.
const FANSUB_PUBLIC_STATE_SELECT = `
  id,
  name,
  slug,
  avatar_url,
  description,
  discord_invite_url,
  frame_type,
  primary_color,
  secondary_color,
  custom_background_asset_url,
  active_name_style,
  hover_theme,
  active_frame_id,
  active_background_id,
  active_pattern_id,
  active_profile_effect_id,
  vanity_slug_changed_at,
  created_at,
  updated_at
`

export interface FansubRecentChapterActivityItem {
  fansubId: string
  mangaId?: string
  mangaTitle?: string
  mangaSlug?: string
  chapterNumber?: number
  chapterTitle?: string
  publishedAt: string
}

export interface FansubRecentActivitySummary {
  fansubId: string
  weeklyChapterCount: number
  monthlyChapterCount: number
  totalChapterCount: number
  translatedMangaCount: number
  latestActivityAt?: string
  latestChapter?: FansubRecentChapterActivityItem
}

type FansubChapterTotalRow = {
  fansub_id: string | null
  manga_id: string | null
}

type FansubChapterActivityRow = {
  fansub_id: string | null
  manga_id: string | null
  chapter_number: number | string | null
  title: string | null
  publish_at: string | null
  created_at: string | null
  mangas?:
    | {
        id?: string | null
        title?: string | null
        slug?: string | null
      }
    | Array<{
        id?: string | null
        title?: string | null
        slug?: string | null
      }>
    | null
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function logFansubCatalogError(
  level: 'warn' | 'error',
  requestContext: RequestContext,
  message: string,
  error: unknown,
  extraContext?: Record<string, unknown>,
) {
  fansubCatalogLogger[level]({
    event: requestContext.event,
    message: toUserFacingErrorMessage(error, message),
    context: toRequestContextLogContext(requestContext, extraContext),
    error,
  })
}

function getSingleChapterMangaRow(
  value: FansubChapterMangaLookupRow['mangas'],
): Pick<DbManga, 'id' | 'title' | 'slug' | 'cover_image_url' | 'is_active' | 'is_approved'> | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function getSingleActivityMangaRow(value: FansubChapterActivityRow['mangas']) {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function normalizeChapterNumber(value: FansubChapterActivityRow['chapter_number']) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined
}

function createEmptyActivitySummary(fansubId: string): FansubRecentActivitySummary {
  return {
    fansubId,
    weeklyChapterCount: 0,
    monthlyChapterCount: 0,
    totalChapterCount: 0,
    translatedMangaCount: 0,
  }
}

function toIsoDaysAgo(days: number) {
  const normalizedDays = Number.isFinite(days) && days > 0 ? days : 7
  const date = new Date()
  date.setDate(date.getDate() - normalizedDays)
  return date.toISOString()
}

async function fetchFansubRawStateByIds(
  fansubIds: string[],
  requestContext: RequestContext,
) {
  if (fansubIds.length === 0) return new Map<string, Record<string, unknown>>()

  const response = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select(FANSUB_PUBLIC_STATE_SELECT)
        .in('id', fansubIds)
        .eq('is_active', true),
      signal,
    ),
    { label: 'fansubService.fetchFansubRawStateByIds' },
  )

  if (response.error) {
    logFansubCatalogError('warn', requestContext, 'Fansub ham katalog kayitlari yuklenemedi.', response.error, {
      stage: 'raw-state-list',
    })
    return new Map<string, Record<string, unknown>>()
  }

  return new Map(
    ((response.data || []) as Array<Record<string, unknown>>)
      .filter((row) => typeof row.id === 'string')
      .map((row) => [row.id as string, row]),
  )
}

async function fetchFansubRawState(
  column: 'id' | 'slug',
  value: string,
  requestContext: RequestContext,
) {
  const response = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select(FANSUB_PUBLIC_STATE_SELECT)
        .eq(column, value)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.fetchFansubRawState' },
  )

  if (response.error) {
    logFansubCatalogError('warn', requestContext, 'Fansub ham durum kaydi yuklenemedi.', response.error, {
      stage: 'raw-state',
    })
  } else {
    writeStoredColumnCapability(FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY, true)
  }

  return response
}

async function getFansubByColumn(
  column: 'id' | 'slug',
  value: string,
  requestContext: RequestContext,
) {
  const statsQuery = withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .rpc('get_fansubs_with_stats')
        .eq(column, value)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.getFansubByColumn.stats' },
  )

  const rawQuery = fetchFansubRawState(column, value, requestContext)
  const [statsRes, rawRes] = await Promise.all([statsQuery, rawQuery])

  if (statsRes.error) {
    logFansubCatalogError('error', requestContext, 'Fansub istatistik kaydi yuklenemedi.', statsRes.error, {
      stage: `stats-${column}`,
    })
    throw statsRes.error
  }

  if (!statsRes.data) {
    return null
  }

  const rawStateData = (rawRes.data || {}) as Record<string, unknown>
  const mergedData = {
    ...(statsRes.data as Record<string, unknown>),
    ...rawStateData,
  }

  const mergedFansub = mergedData as unknown as DbFansub
  const cosmeticMap = await buildFansubCardCosmeticMap([mergedFansub])
  return mapDbFansub(mergedFansub, cosmeticMap.get(mergedFansub.id))
}

export async function listFansubs() {
  const e2eFansubs = getE2EMockFansubs()
  if (e2eFansubs) return { data: e2eFansubs }

  const requestContext = createRequestContext('fansubService/catalog', 'listFansubs')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansubs_with_stats'),
      signal,
    ),
    { label: 'fansubService.listFansubs' },
  )

  if (error) {
    logFansubCatalogError('error', requestContext, 'Fansub listesi yuklenemedi.', error)
    throw error
  }

  const rows = (data as DbFansub[]) || []
  const rawStateMap = await fetchFansubRawStateByIds(rows.map((row) => row.id), requestContext)
  const mergedRows = rows.map((row) => ({
    ...row,
    ...(rawStateMap.get(row.id) || {}),
  })) as unknown as DbFansub[]
  const cosmeticMap = await buildFansubCardCosmeticMap(mergedRows)
  const items = mergedRows.map((row) => mapDbFansub(row, cosmeticMap.get(row.id)))
  return { data: items }
}

export async function listFansubRecentChapterActivity(
  fansubIds: string[],
  options: { days?: number; limit?: number; totalLimit?: number } = {},
) {
  const uniqueFansubIds = Array.from(new Set(fansubIds.map((id) => id.trim()).filter(Boolean)))
  const activityMap = new Map<string, FansubRecentActivitySummary>()

  if (uniqueFansubIds.length === 0) return activityMap

  const e2eFansubs = getE2EMockFansubs()
  if (e2eFansubs) {
    const e2eIndexByFansubId = new Map(e2eFansubs.map((fansub, index) => [fansub.id, index]))
    const nowMs = Date.now()
    uniqueFansubIds.forEach((fansubId) => {
      const fansub = e2eFansubs.find((item) => item.id === fansubId)
      const index = e2eIndexByFansubId.get(fansubId) ?? 0
      const mangaCount = Math.max(0, fansub?.mangaCount ?? 0)
      const weeklySeed = index === 0
        ? 42
        : Math.max(0, Math.round((mangaCount * ((index % 5) + 2)) / 4) - (index % 4))
      const weeklyChapterCount = mangaCount === 0 ? 0 : Math.min(Math.max(1, weeklySeed), Math.max(1, mangaCount * 3))
      const totalChapterCount = mangaCount === 0
        ? 0
        : Math.max(weeklyChapterCount, mangaCount * (index % 6 + 3) + (index % 7))
      const monthlyChapterCount = totalChapterCount === 0
        ? 0
        : Math.min(totalChapterCount, Math.max(weeklyChapterCount, weeklyChapterCount * 2 + (index % 9)))
      const latestDate = new Date(nowMs - (index % 30) * 3_600_000).toISOString()
      const hasPublishedChapter = totalChapterCount > 0
      activityMap.set(fansubId, {
        fansubId,
        weeklyChapterCount,
        monthlyChapterCount,
        totalChapterCount,
        translatedMangaCount: mangaCount,
        latestActivityAt: hasPublishedChapter ? latestDate : undefined,
        latestChapter: hasPublishedChapter
          ? {
              fansubId,
              mangaId: `e2e-latest-${fansubId}`,
              mangaTitle: `${fansub?.name || 'E2E'} Vitrin Serisi`,
              mangaSlug: 'e2e-vitrin-serisi',
              chapterNumber: Math.max(1, totalChapterCount),
              chapterTitle: index % 3 === 0 ? 'Dolu aciklama kart testi' : 'Senaryo bolumu',
              publishedAt: latestDate,
            }
          : undefined,
      })
    })
    return activityMap
  }

  const requestContext = createRequestContext('fansubService/catalog', 'listFansubRecentChapterActivity', {
    fansubCount: uniqueFansubIds.length,
  })
  const weeklyStartIso = toIsoDaysAgo(options.days ?? 7)
  const monthlyStartIso = toIsoDaysAgo(30)
  const nowIso = new Date().toISOString()
  const limit = Math.max(50, Math.min(Number(options.limit) || 600, 1200))
  const totalLimit = Math.max(200, Math.min(Number(options.totalLimit) || 5000, 10000))

  const totalStatsQuery = withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select('fansub_id, manga_id, mangas:manga_id!inner(id)')
        .in('fansub_id', uniqueFansubIds)
        .eq('is_active', true)
        .eq('is_approved', true)
        .eq('mangas.is_active', true)
        .eq('mangas.is_approved', true)
        .lte('publish_at', nowIso)
        .order('publish_at', { ascending: false })
        .limit(totalLimit),
      signal,
    ),
    { label: 'fansubService.listFansubRecentChapterActivity.totalStats' },
  )

  const recentActivityQuery = withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select('fansub_id, manga_id, chapter_number, title, publish_at, created_at, mangas:manga_id!inner(id, title, slug)')
        .in('fansub_id', uniqueFansubIds)
        .eq('is_active', true)
        .eq('is_approved', true)
        .eq('mangas.is_active', true)
        .eq('mangas.is_approved', true)
        .lte('publish_at', nowIso)
        .gte('publish_at', monthlyStartIso)
        .order('publish_at', { ascending: false })
        .limit(limit),
      signal,
    ),
    { label: 'fansubService.listFansubRecentChapterActivity' },
  )

  const [
    { data: totalData, error: totalError },
    { data, error },
  ] = await Promise.all([totalStatsQuery, recentActivityQuery])

  const translatedMangaIdsByFansubId = new Map<string, Set<string>>()
  const shouldBackfillTotalsFromRecent = Boolean(totalError)

  if (totalError) {
    logFansubCatalogError('warn', requestContext, 'Fansub toplam bolum istatistigi yuklenemedi.', totalError, {
      stage: 'total-chapter-stats',
    })
  } else {
    ;((totalData as FansubChapterTotalRow[]) || []).forEach((row) => {
      const fansubId = (row.fansub_id || '').trim()
      if (!fansubId) return

      const summary = activityMap.get(fansubId) || createEmptyActivitySummary(fansubId)
      summary.totalChapterCount += 1

      const mangaId = (row.manga_id || '').trim()
      if (mangaId) {
        const mangaIds = translatedMangaIdsByFansubId.get(fansubId) || new Set<string>()
        mangaIds.add(mangaId)
        translatedMangaIdsByFansubId.set(fansubId, mangaIds)
        summary.translatedMangaCount = mangaIds.size
      }

      activityMap.set(fansubId, summary)
    })
  }

  if (error) {
    logFansubCatalogError('warn', requestContext, 'Fansub bolum aktivitesi yuklenemedi.', error)
    return activityMap
  }

  ;((data as FansubChapterActivityRow[]) || []).forEach((row) => {
    const fansubId = (row.fansub_id || '').trim()
    if (!fansubId) return

    const summary = activityMap.get(fansubId) || createEmptyActivitySummary(fansubId)
    const publishedAt = row.publish_at || row.created_at
    if (!publishedAt) return

    if (shouldBackfillTotalsFromRecent) {
      summary.totalChapterCount += 1
      const mangaId = (row.manga_id || '').trim()
      if (mangaId) {
        const mangaIds = translatedMangaIdsByFansubId.get(fansubId) || new Set<string>()
        mangaIds.add(mangaId)
        translatedMangaIdsByFansubId.set(fansubId, mangaIds)
        summary.translatedMangaCount = mangaIds.size
      }
    }

    summary.monthlyChapterCount += 1
    if (publishedAt >= weeklyStartIso) {
      summary.weeklyChapterCount += 1
    }

    const mangaRow = getSingleActivityMangaRow(row.mangas)
    if (!summary.latestActivityAt || publishedAt > summary.latestActivityAt) {
      summary.latestActivityAt = publishedAt
      summary.latestChapter = {
        fansubId,
        mangaId: row.manga_id || mangaRow?.id || undefined,
        mangaTitle: mangaRow?.title || undefined,
        mangaSlug: mangaRow?.slug || undefined,
        chapterNumber: normalizeChapterNumber(row.chapter_number),
        chapterTitle: row.title || undefined,
        publishedAt,
      }
    }

    activityMap.set(fansubId, summary)
  })

  return activityMap
}

export async function getFansubById(id: string) {
  const requestContext = createRequestContext('fansubService/catalog', 'getFansubById', { fansubId: id })
  const fansub = await getFansubByColumn('id', id, requestContext)
  if (!fansub) throw new Error('FANSUB_NOT_FOUND')
  return fansub
}

export async function getFansubByIdentifier(identifier: string) {
  const normalized = identifier.trim()
  if (!normalized) throw new Error('FANSUB_NOT_FOUND')

  const requestContext = createRequestContext('fansubService/catalog', 'getFansubByIdentifier', {
    identifier: normalized,
    mode: isUuid(normalized) ? 'id-or-slug' : 'slug',
  })

  if (isUuid(normalized)) {
    const idResult = await getFansubByColumn('id', normalized, requestContext)
    if (!idResult) throw new Error('FANSUB_NOT_FOUND')
    return idResult
  }

  const slugResult = await getFansubByColumn('slug', normalized, requestContext)
  if (slugResult) return slugResult
  throw new Error('FANSUB_NOT_FOUND')
}

export async function listMangasForFansub(
  fansubId: string,
  options: ListFansubMangasOptions = {},
): Promise<FansubMangaListResult> {
  const e2eMangas = getE2EMockFansubMangas(fansubId)
  if (e2eMangas) {
    return {
      data: e2eMangas,
      pendingOwnedMangaIds: [],
    }
  }

  const requestContext = createRequestContext('fansubService/catalog', 'listMangasForFansub', {
    fansubId,
    includePending: options.includePending === true,
  })
  const includePending = options.includePending === true
  const translatedOnly = options.translatedOnly === true
  const nowIso = await getPublicChapterUnlockCutoffIso()

  let ownedRows: DbManga[] = []
  if (!translatedOnly) {
    const { data: ownedMangas, error: ownedError } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('mangas')
          .select(FANSUB_MANGA_SELECT)
          .eq('fansub_id', fansubId)
          .eq('is_active', true),
        signal,
      ),
      { label: 'fansubService.listMangasForFansub.owned' },
    )

    if (ownedError) {
      logFansubCatalogError('error', requestContext, 'Fansub manga sahipligi yuklenemedi.', ownedError, {
        stage: 'owned',
      })
      throw ownedError
    }

    ownedRows = (ownedMangas as DbManga[]) || []
  }

  const providedChapterRows = Array.isArray(options.chapterRows) ? options.chapterRows : null
  let chapterMangas = providedChapterRows

  if (!chapterMangas) {
    let chapterMangasQuery = supabase
      .from('chapters')
      .select('manga_id, mangas:manga_id!inner(id, title, slug, cover_image_url, is_active, is_approved)')
      .eq('fansub_id', fansubId)
      .eq('is_active', true)

    if (!includePending) {
      chapterMangasQuery = chapterMangasQuery
        .eq('is_approved', true)
        .eq('mangas.is_active', true)
        .eq('mangas.is_approved', true)
        .lte('publish_at', nowIso)
    }

    const { data, error: chapterError } = await withServiceTimeout(
      (signal) => withAbortSignal(chapterMangasQuery, signal),
      { label: 'fansubService.listMangasForFansub.chapters' },
    )

    if (chapterError) {
      logFansubCatalogError('warn', requestContext, 'Fansub chapter manga baglantisi yuklenemedi.', chapterError, {
        stage: 'chapters',
      })
      const pendingOwnedRows = includePending
        ? ownedRows.filter((row) => row.is_approved !== true)
        : []
      return {
        data: ownedRows
          .filter((row) => includePending || row.is_approved === true)
          .map(mapDbManga),
        pendingOwnedMangaIds: pendingOwnedRows.map((row) => row.id),
      }
    }

    chapterMangas = (data as FansubChapterMangaLookupRow[]) || []
  }

  const mangaIds = new Set([
    ...ownedRows.map((manga) => manga.id),
    ...chapterMangas.map((chapter) => chapter.manga_id),
  ])

  if (mangaIds.size === 0) {
    const pendingOwnedRows = includePending
      ? ownedRows.filter((row) => row.is_approved !== true)
      : []
    return {
      data: includePending ? pendingOwnedRows.map(mapDbManga) : [],
      pendingOwnedMangaIds: pendingOwnedRows.map((row) => row.id),
    }
  }

  const mergedById = new Map<string, ReturnType<typeof mapDbManga>>()
  ownedRows
    .filter((row) => includePending || row.is_approved === true)
    .forEach((row) => {
      mergedById.set(row.id, mapDbManga(row))
    })

  chapterMangas.forEach((chapter) => {
    const mangaRow = getSingleChapterMangaRow(chapter.mangas)
    if (!mangaRow?.id) return
    if (mangaRow.is_active === false) return
    if (mangaRow.is_approved !== true) return
    if (mergedById.has(mangaRow.id)) return

    mergedById.set(mangaRow.id, mapDbManga({
      id: mangaRow.id,
      fansub_id: null,
      title: mangaRow.title,
      slug: mangaRow.slug || '',
      cover_image_url: mangaRow.cover_image_url ?? null,
      description: null,
      status: null,
      rating: null,
      total_ratings: null,
      total_views: null,
      is_new: null,
      last_chapter_number: null,
      is_approved: mangaRow.is_approved,
      is_active: mangaRow.is_active,
    }))
  })

  const pendingOwnedRows = includePending
    ? ownedRows.filter((row) => row.is_approved !== true)
    : []

  pendingOwnedRows.forEach((row) => {
    if (!mergedById.has(row.id)) {
      mergedById.set(row.id, mapDbManga(row))
    }
  })

  return {
    data: Array.from(mergedById.values()),
    pendingOwnedMangaIds: pendingOwnedRows.map((row) => row.id),
  }
}
