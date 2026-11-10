import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import {
  type DbAdminMangaControlRow,
  fetchChapterStatsByMangaIds,
  fetchFansubAdminUsersByFansubIds,
  fetchMangaFollowerCountsByMangaIds,
  findFansubIdsBySearch,
  mapDbAdminMangaControl,
  normalizePageAndLimit,
  sanitizeSearchTerm,
} from './shared'
import type {
  AdminMangaControlItem,
  AdminMangaListParams,
  AdminPagedResult,
} from './types'

/** Yetki reddi: hem fonksiyon grant'i hem fonksiyon icindeki admin kapisi. */
function isAdminAccessError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42501'
    || error?.message?.includes('permission denied') === true
    || error?.message?.includes('admin yetkisi') === true
}

/** RPC henuz uygulanmamis olabilir (migration/dagitim sirasi). */
function isMissingRpcError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42883'
    || error?.code === 'PGRST202'
    || error?.message?.includes('Could not find the function') === true
}

/**
 * Page-scoped ids for computed views.
 *
 * "Series with no chapters" is an anti-join, "series with pending chapters" an EXISTS;
 * PostgREST can express neither. Since sorting and pagination are on the server,
 * only that page's ids go over the wire, which also fits the URL
 * as the catalog grows.
 */
async function fetchComputedViewPage(input: {
  view: 'without-chapters' | 'pending-chapters'
  search: string
  visibility: string
  approval: string
  status: string
  limit: number
  offset: number
}): Promise<{ ids: string[]; total: number }> {
  // Timeout guard: a hung request would lock the panel indefinitely.
  const { data, error } = await withServiceTimeout(
    () => supabase.rpc('get_admin_manga_control_view_page', {
      p_view: input.view,
      p_search: input.search || null,
      p_visibility: input.visibility,
      p_approval: input.approval,
      p_status: input.status,
      p_limit: input.limit,
      p_offset: input.offset,
    }),
    { label: 'Hesaplanmis manga gorunumunu yukleme' },
  )
  if (error) {
    // Raw Postgres text ("permission denied for function ...") should not be
    // shown to the user; in a non-admin session this is an expected result and is
    // turned into a readable sentence.
    if (isAdminAccessError(error)) {
      throw new Error('Bu gorunum icin admin yetkisi gerekiyor.')
    }
    if (isMissingRpcError(error)) {
      throw new Error('Bu gorunum henuz kullanilamiyor; veritabani guncellemesi bekleniyor.')
    }
    throw error
  }

  const payload = (Array.isArray(data) && data.length === 1 ? data[0] : data) as
    | { ids?: unknown; total?: unknown }
    | null
  const ids = Array.isArray(payload?.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : []
  const total = typeof payload?.total === 'number' ? payload.total : 0
  return { ids, total }
}

export async function listAdminMangasPage(params: AdminMangaListParams = {}): Promise<AdminPagedResult<AdminMangaControlItem>> {
  const { page, limit } = normalizePageAndLimit(params.page, params.limit)
  const search = sanitizeSearchTerm(params.search)
  const visibility = params.visibility || 'all'
  const approval = params.approval || 'all'
  const status = params.status || 'all'
  const view = params.view || 'all'
  const from = (page - 1) * limit
  const to = from + limit - 1

  // View presets apply to the server query; filtering on the client would make
  // pagination and the total a lie.
  const computedViewPage = view === 'without-chapters' || view === 'pending-chapters'
    ? await fetchComputedViewPage({ view, search: sanitizeSearchTerm(params.search), visibility, approval, status, limit, offset: from })
    : null

  if (computedViewPage && computedViewPage.ids.length === 0) {
    return { data: [], count: computedViewPage.total, page, limit }
  }

  let query = supabase
    .from('mangas')
    .select(`
      id,
      fansub_id,
      title,
      slug,
      cover_image_url,
      description,
      status,
      is_approved,
      is_active,
      is_new,
      total_views,
      total_ratings,
      rating,
      genres,
      series_type,
      is_mature,
      last_chapter_number,
      created_at,
      updated_at,
      fansub:fansub_id (
        id,
        name,
        slug
      )
    `, { count: 'exact' })
    .order('updated_at', { ascending: false })

  if (computedViewPage) {
    // Pagination was done in the server function; only those ids are fetched here.
    query = query.in('id', computedViewPage.ids)
  }

  if (view === 'pending') query = query.eq('is_approved', false)
  if (view === 'inactive') query = query.eq('is_active', false)
  if (view === 'incomplete-meta') {
    // Gaps that break card and SEO surfaces.
    query = query.or('cover_image_url.is.null,cover_image_url.eq.,description.is.null,description.eq.,genres.is.null')
  }

  if (visibility === 'active') query = query.eq('is_active', true)
  if (visibility === 'inactive') query = query.eq('is_active', false)
  if (approval === 'approved') query = query.eq('is_approved', true)
  if (approval === 'pending') query = query.eq('is_approved', false)
  if (status !== 'all') query = query.eq('status', status)

  if (search) {
    const matchedFansubIds = await findFansubIdsBySearch(search)
    const clauses = [
      `title.ilike.%${search}%`,
      `slug.ilike.%${search}%`,
      `description.ilike.%${search}%`,
    ]
    if (matchedFansubIds.length > 0) {
      clauses.push(`fansub_id.in.(${matchedFansubIds.join(',')})`)
    }
    query = query.or(clauses.join(','))
  }

  // In a computed view the range was already applied on the server; applying it again would
  // return nothing on the second page.
  const { data, error, count } = computedViewPage
    ? await query
    : await query.range(from, to)

  if (error) {
    console.error('[adminService] listAdminMangasPage error', error)
    throw error
  }

  const rows = (data || []) as DbAdminMangaControlRow[]
  const chapterStatsByMangaId = await fetchChapterStatsByMangaIds(rows.map((row) => row.id))
  const followerCountByMangaId = await fetchMangaFollowerCountsByMangaIds(rows.map((row) => row.id))
  const creatorByFansubId = await fetchFansubAdminUsersByFansubIds(
    rows
      .map((row) => row.fansub_id || '')
      .filter(Boolean),
  )

  const mapped = rows.map((row) => mapDbAdminMangaControl(row, chapterStatsByMangaId, followerCountByMangaId, creatorByFansubId))

  if (computedViewPage) {
    // Sunucu sirasi korunmali: `.in()` siralamayi garanti etmiyor.
    const order = new Map(computedViewPage.ids.map((id, index) => [id, index]))
    mapped.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    return { data: mapped, count: computedViewPage.total, page, limit }
  }

  return {
    data: mapped,
    count: count || 0,
    page,
    limit,
  }
}
