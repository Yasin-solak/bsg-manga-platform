import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { normalizeChapterPageRef } from '../assetUrlService'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  mergeChapterPageDimensionMap,
  pruneChapterPageDimensionMap,
  toStorableChapterPageDimensions,
} from '@/lib/chapterPageDimensions'
import {
  mapChapterEditRow,
  mapChapterRow,
  normalizeLimit,
  normalizePage,
  parseRpcPagedResult,
  type FansubManageChapterEditRow,
  type FansubManageChapterRow,
} from './shared'
import type {
  FansubManageChapter,
  FansubManageChapterStatusFilter,
  FansubManageListParams,
} from './types'

const fansubManageChaptersLogger = createScopedLogger('fansubManageService/chapters')

export async function listFansubManageChapters(
  fansubId: string,
  params: FansubManageListParams<FansubManageChapterStatusFilter> = {},
) {
  const requestContext = createRequestContext('fansubManageService/chapters', 'listFansubManageChapters', {
    fansubId,
    page: params.page ?? null,
    limit: params.limit ?? null,
    status: params.status ?? 'all',
  })
  const page = normalizePage(params.page)
  const limit = normalizeLimit(params.limit)
  const status = params.status || 'all'
  const search = params.search?.trim() || null

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('list_fansub_manage_chapters', {
        p_fansub_id: fansubId,
        p_page: page,
        p_limit: limit,
        p_search: search,
        p_status: status,
      }),
      signal,
    ),
    { label: 'fansubManageService.listFansubManageChapters' },
  )

  if (error) {
    fansubManageChaptersLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bolumleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return parseRpcPagedResult<FansubManageChapterRow, FansubManageChapter>(data, mapChapterRow)
}

export async function updateFansubChapterForReview(
  fansubId: string,
  chapterId: string,
  title?: string,
  publishAt?: string | null,
) {
  const requestContext = createRequestContext('fansubManageService/chapters', 'updateFansubChapterForReview', {
    fansubId,
    chapterId,
  })
  // A published chapter is not hidden: the change goes to approval as a revision, the old version stays live.
  if (await isChapterLive(fansubId, chapterId)) {
    return submitLiveChapterRevision({ chapterId, title, publishAt: publishAt || null, requestContext })
  }
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('update_fansub_chapter_for_review', {
        p_fansub_id: fansubId,
        p_chapter_id: chapterId,
        p_title: title?.trim() || null,
        p_publish_at: publishAt || null,
      }),
      signal,
    ),
    { label: 'fansubManageService.updateFansubChapterForReview' },
  )

  if (error) {
    fansubManageChaptersLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bolumu inceleme icin guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    chapter_id: string
    fansub_id: string
    publish_at?: string | null
    status: 'pending_admin_review' | 'pending_revision'
  }
}

/** An approved + active chapter is live in the reader; edits are not written to the live row. */
async function isChapterLive(fansubId: string, chapterId: string) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select('is_approved, is_active')
        .eq('id', chapterId)
        .eq('fansub_id', fansubId)
        .maybeSingle<{ is_approved: boolean | null; is_active: boolean | null }>(),
      signal,
    ),
    { label: 'fansubManageService.isChapterLive' },
  )
  if (error) throw error
  return data?.is_approved === true && data?.is_active !== false
}

async function submitLiveChapterRevision(input: {
  chapterId: string
  title?: string
  pages?: string[]
  pageDimensions?: unknown
  publishAt?: string | null
  requestContext: ReturnType<typeof createRequestContext>
}) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('submit_chapter_revision', {
        p_chapter_id: input.chapterId,
        p_title: input.title?.trim() || null,
        p_pages: input.pages ?? null,
        p_page_dimensions: input.pages ? input.pageDimensions ?? null : null,
        p_publish_at: input.publishAt ?? null,
      }),
      signal,
    ),
    { label: 'fansubManageService.submitLiveChapterRevision' },
  )
  if (error) {
    fansubManageChaptersLogger.error({
      event: input.requestContext.event,
      message: toUserFacingErrorMessage(error, 'Bolum revizyonu gonderilemedi.'),
      context: toRequestContextLogContext(input.requestContext),
      error,
    })
    throw error
  }
  return data as {
    success: boolean
    chapter_id: string
    fansub_id: string
    revision_id: string
    status: 'pending_revision'
  }
}

export async function getFansubManageChapterEditData(
  fansubId: string,
  chapterId: string,
) {
  const requestContext = createRequestContext('fansubManageService/chapters', 'getFansubManageChapterEditData', {
    fansubId,
    chapterId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select('id, fansub_id, manga_id, chapter_number, title, pages, is_approved, is_active, updated_at')
        .eq('id', chapterId)
        .eq('fansub_id', fansubId)
        .maybeSingle<FansubManageChapterEditRow>(),
      signal,
    ),
    { label: 'fansubManageService.getFansubManageChapterEditData' },
  )

  if (error) {
    fansubManageChaptersLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bolum duzenleme verisi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  if (!data) {
    throw new Error('Bolum bulunamadi veya bu bolumu duzenleme yetkiniz yok.')
  }

  return mapChapterEditRow(data)
}

export async function updateFansubChapterPagesForReview(input: {
  fansubId: string
  chapterId: string
  title?: string
  pages: string[]
  /** Measured dimensions of pages NEWLY uploaded in this save (if any). */
  uploadedPageDimensions?: Array<{ ref: string; width: number; height: number }>
}) {
  const requestContext = createRequestContext('fansubManageService/chapters', 'updateFansubChapterPagesForReview', {
    fansubId: input.fansubId,
    chapterId: input.chapterId,
    pageCount: input.pages.length,
  })
  const normalizedPages = (input.pages || [])
    .map((url) => normalizeChapterPageRef(url)?.trim() || '')
    .filter(Boolean)

  if (normalizedPages.length === 0) {
    throw new Error('Bolum en az bir sayfa icermelidir.')
  }

  // Existing dimensions are kept (so unchanged pages keep their info), newly
  // measured ones are added, those of deleted pages are cleaned. Dimensions are keyed by page
  // REFERENCE, so they do not shift even if the order changes.
  const { data: currentRow } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .select('page_dimensions, is_approved, is_active')
        .eq('id', input.chapterId)
        .eq('fansub_id', input.fansubId)
        .maybeSingle<{ page_dimensions: unknown; is_approved: boolean | null; is_active: boolean | null }>(),
      signal,
    ),
    { label: 'fansubManageService.readChapterPageDimensions' },
  )

  const nextPageDimensions = toStorableChapterPageDimensions(
    pruneChapterPageDimensionMap(
      mergeChapterPageDimensionMap(currentRow?.page_dimensions, input.uploadedPageDimensions || []),
      normalizedPages,
    ),
  )

  // Published chapter: pages go to approval as a revision; until then old pages stay in
  // the reader, on approval new ones take over and old ones are archived (not deleted).
  if (currentRow?.is_approved === true && currentRow?.is_active !== false) {
    const revision = await submitLiveChapterRevision({
      chapterId: input.chapterId,
      title: input.title,
      pages: normalizedPages,
      pageDimensions: nextPageDimensions,
      requestContext,
    })
    return {
      success: true,
      chapter_id: revision.chapter_id,
      fansub_id: revision.fansub_id,
      updated_at: new Date().toISOString(),
      status: 'pending_revision' as const,
    }
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('chapters')
        .update({
          title: input.title?.trim() || null,
          pages: normalizedPages,
          page_dimensions: nextPageDimensions,
          is_approved: false,
        })
        .eq('id', input.chapterId)
        .eq('fansub_id', input.fansubId)
        .select('id, fansub_id, updated_at, is_approved')
        .maybeSingle<{
          id: string
          fansub_id: string | null
          updated_at: string
          is_approved: boolean
        }>(),
      signal,
    ),
    { label: 'fansubManageService.updateFansubChapterPagesForReview' },
  )

  if (error) {
    fansubManageChaptersLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub bolum sayfalari guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  if (!data) {
    throw new Error('Bolum bulunamadi veya bu bolumu duzenleme yetkiniz yok.')
  }

  return {
    success: true,
    chapter_id: data.id,
    fansub_id: data.fansub_id,
    updated_at: data.updated_at,
    status: 'pending_admin_review' as 'pending_admin_review' | 'pending_revision',
  }
}
