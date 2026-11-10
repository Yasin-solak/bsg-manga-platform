import { supabase } from '../supabase'
import {
  type DbReadingHistoryRow,
  toPeriodStartIso,
} from './shared'
import type { WrappedPeriod } from './types'

export type WrappedSummaryCounts = {
  totalFollowedMangas: number
  mangaCommentsCount: number
}

export type WrappedSummaryFetchPayload = {
  readingRows: DbReadingHistoryRow[]
  counts: WrappedSummaryCounts
  periodStartIso: string | null
}

export async function fetchWrappedSummaryPayload(
  userId: string,
  period: WrappedPeriod,
): Promise<WrappedSummaryFetchPayload> {
  const normalizedUserId = userId.trim()
  if (!normalizedUserId) {
    throw new Error('Kullanici bulunamadi.')
  }

  const periodStartIso = toPeriodStartIso(period)

  let readingQuery = supabase
    .from('reading_history')
    .select(`
      id,
      manga_id,
      chapter_number,
      read_at,
      manga:mangas(
        id,
        title,
        slug,
        cover_image_url,
        genres,
        fansub_id,
        fansub:fansubs(
          id,
          name
        )
      )
    `)
    .eq('user_id', normalizedUserId)
    .order('read_at', { ascending: false })
    .limit(period === 'all' ? 1200 : 600)

  if (periodStartIso) {
    readingQuery = readingQuery.gte('read_at', periodStartIso)
  }

  let commentsCountQuery = supabase
    .from('manga_comments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', normalizedUserId)

  if (periodStartIso) {
    commentsCountQuery = commentsCountQuery.gte('created_at', periodStartIso)
  }

  const [readingResult, followedCountResult, commentsCountResult] = await Promise.all([
    readingQuery,
    supabase
      .from('manga_follows')
      .select('manga_id', { count: 'exact', head: true })
      .eq('user_id', normalizedUserId),
    commentsCountQuery,
  ])

  if (readingResult.error) {
    console.error('[wrappedService] listUserWrappedSummary reading error', readingResult.error)
    throw readingResult.error
  }
  if (followedCountResult.error) {
    console.error('[wrappedService] listUserWrappedSummary followed count error', followedCountResult.error)
    throw followedCountResult.error
  }
  if (commentsCountResult.error) {
    console.error('[wrappedService] listUserWrappedSummary comments count error', commentsCountResult.error)
    throw commentsCountResult.error
  }

  return {
    readingRows: (readingResult.data || []) as DbReadingHistoryRow[],
    counts: {
      totalFollowedMangas: followedCountResult.count || 0,
      mangaCommentsCount: commentsCountResult.count || 0,
    },
    periodStartIso,
  }
}
