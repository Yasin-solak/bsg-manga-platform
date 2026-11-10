import { supabase } from './supabase'

import { getE2EMockReleaseScheduleEntries } from '@/testing/e2eMocks'

const DEFAULT_DAYS_AHEAD = 30
const DEFAULT_LIMIT = 120
const MAX_DAYS_AHEAD = 120
const MAX_LIMIT = 300

export type ListReleaseScheduleOptions = {
  from?: string
  daysAhead?: number
  limit?: number
}

export type ReleaseScheduleEntry = {
  chapterId: string
  mangaId: string
  mangaTitle: string
  mangaSlug: string
  mangaCoverImageUrl?: string
  fansubId?: string
  fansubName?: string
  fansubSlug?: string
  chapterNumber: number
  chapterTitle?: string
  publishAt: string
  isUpcoming: boolean
}

type DbReleaseScheduleRow = {
  chapter_id: string
  manga_id: string
  manga_title: string
  manga_slug: string
  manga_cover_image_url: string | null
  fansub_id: string | null
  fansub_name: string | null
  fansub_slug: string | null
  chapter_number: number | string
  chapter_title: string | null
  publish_at: string
  is_upcoming: boolean | null
}

type SupabaseErrorLike = {
  message?: string
  details?: string
  hint?: string
}

function normalizeLimit(limit?: number) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT)
}

function normalizeDaysAhead(daysAhead?: number) {
  if (typeof daysAhead !== 'number' || !Number.isFinite(daysAhead)) return DEFAULT_DAYS_AHEAD
  return Math.min(Math.max(Math.floor(daysAhead), 1), MAX_DAYS_AHEAD)
}

function normalizeFromIso(from?: string) {
  if (typeof from !== 'string' || !from.trim()) return null
  const date = new Date(from)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function getErrorText(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const typed = error as SupabaseErrorLike
  return [typed.message, typed.details, typed.hint]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

function isMissingScheduleFunctionError(error: unknown) {
  const text = getErrorText(error)
  return text.includes('list_public_release_schedule')
    && (text.includes('could not find the function') || text.includes('does not exist'))
}

function mapScheduleRow(row: DbReleaseScheduleRow): ReleaseScheduleEntry {
  const parsedChapterNumber = Number(row.chapter_number)
  return {
    chapterId: row.chapter_id,
    mangaId: row.manga_id,
    mangaTitle: row.manga_title,
    mangaSlug: row.manga_slug,
    mangaCoverImageUrl: row.manga_cover_image_url || undefined,
    fansubId: row.fansub_id || undefined,
    fansubName: row.fansub_name || undefined,
    fansubSlug: row.fansub_slug || undefined,
    chapterNumber: Number.isFinite(parsedChapterNumber) ? parsedChapterNumber : 0,
    chapterTitle: row.chapter_title || undefined,
    publishAt: row.publish_at,
    isUpcoming: row.is_upcoming === true,
  }
}

async function listReleaseScheduleInternal(
  fansubId: string | null,
  options: ListReleaseScheduleOptions = {},
): Promise<ReleaseScheduleEntry[]> {
  const safeLimit = normalizeLimit(options.limit)
  const safeDaysAhead = normalizeDaysAhead(options.daysAhead)
  const fromIso = normalizeFromIso(options.from)
  const e2eEntries = getE2EMockReleaseScheduleEntries({
    fansubId,
    from: fromIso,
    daysAhead: safeDaysAhead,
    limit: safeLimit,
  })

  if (e2eEntries) return e2eEntries

  const { data, error } = await supabase.rpc('list_public_release_schedule', {
    p_fansub_id: fansubId,
    p_from: fromIso,
    p_days_ahead: safeDaysAhead,
    p_limit: safeLimit,
  })

  if (error) {
    if (isMissingScheduleFunctionError(error)) {
      throw new Error(
        'Yayin takvimi fonksiyonu bulunamadi. 20260304235902_public_release_schedule.sql migrationini calistir.',
      )
    }

    console.error('[releaseScheduleService] listReleaseScheduleInternal error', error)
    throw error
  }

  return ((data || []) as DbReleaseScheduleRow[]).map(mapScheduleRow)
}

export async function listPublicReleaseSchedule(
  options: ListReleaseScheduleOptions = {},
): Promise<ReleaseScheduleEntry[]> {
  return listReleaseScheduleInternal(null, options)
}

export async function listFansubReleaseSchedule(
  fansubId: string,
  options: ListReleaseScheduleOptions = {},
): Promise<ReleaseScheduleEntry[]> {
  if (!fansubId || !fansubId.trim()) return []
  return listReleaseScheduleInternal(fansubId, options)
}
