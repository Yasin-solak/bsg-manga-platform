import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import {
  mapMangaRow,
  normalizeLimit,
  normalizePage,
  type FansubManageMangaRow,
} from './shared'
import type {
  FansubManageListParams,
  FansubManageManga,
  FansubManageMangaStatusFilter,
  FansubManageMangaVisibilityFilter,
  FansubManagePagedResult,
} from './types'

export async function listFansubManageMangas(
  fansubId: string,
  params: FansubManageListParams<FansubManageMangaStatusFilter> & {
    visibility?: FansubManageMangaVisibilityFilter
  } = {},
) {
  const page = normalizePage(params.page)
  const limit = normalizeLimit(params.limit)
  const status = params.status || 'all'
  const visibility = params.visibility || 'all'
  const search = params.search?.trim() || ''

  let query = supabase
    .from('mangas')
    .select(
      'id, fansub_id, title, slug, description, status, genres, cover_image_url, last_chapter_number, total_views, rating, total_ratings, is_approved, is_active, created_at, updated_at, author, artist, is_mature',
      { count: 'exact' },
    )
    .eq('fansub_id', fansubId)

  if (status === 'approved') query = query.eq('is_approved', true)
  if (status === 'pending') query = query.eq('is_approved', false)
  if (visibility === 'active') query = query.eq('is_active', true)
  if (visibility === 'inactive') query = query.eq('is_active', false)

  if (search) {
    const escaped = search.replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    query = query.or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%`)
  }

  const from = (page - 1) * limit
  const to = from + limit - 1
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[fansubManageService] listFansubManageMangas error', error)
    throw error
  }

  const rows = (data || []) as FansubManageMangaRow[]
  const mangaIds = rows.map((row) => row.id)
  const followerCountByManga = new Map<string, number>()

  if (mangaIds.length > 0) {
    const { data: followRows, error: followError } = await supabase
      .from('manga_follows')
      .select('manga_id')
      .in('manga_id', mangaIds)

    if (followError) {
      console.error('[fansubManageService] listFansubManageMangas follower query error', followError)
    } else {
      ;((followRows || []) as Array<{ manga_id: string }>).forEach((row) => {
        followerCountByManga.set(row.manga_id, (followerCountByManga.get(row.manga_id) || 0) + 1)
      })
    }
  }

  return {
    items: rows.map((row) => mapMangaRow(row, followerCountByManga.get(row.id) || 0)),
    total: count || 0,
    page,
    limit,
  } satisfies FansubManagePagedResult<FansubManageManga>
}

export async function updateFansubMangaForReview(input: {
  fansubId: string
  mangaId: string
  title: string
  description: string
  status: 'ongoing' | 'completed' | 'hiatus'
  genres: string[]
}) {
  void input
  throw new Error('Fansub tarafinda manga duzenleme yetkisi kapali.')
}

// ─── Series correction request (published series; the live row is unchanged until approved) ───

export type FansubMangaRevisionChanges = Partial<{
  title: string
  description: string
  genres: string[]
  cover_image_url: string
  is_mature: boolean
  status: 'ongoing' | 'completed' | 'hiatus'
  author: string
  artist: string
}>

export interface FansubMangaRevisionRequest {
  id: string
  mangaId: string
  status: 'pending' | 'approved' | 'rejected'
  changedFields: string[]
  note: string | null
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

const revisionRowSchema = z.object({
  id: z.string(),
  target_id: z.string(),
  status: z.string(),
  before_data: z.record(z.string(), z.unknown()).nullable(),
  after_data: z.record(z.string(), z.unknown()).nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  review_note: z.string().nullable(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
})

type RevisionRow = z.infer<typeof revisionRowSchema>

const REVISION_STATUSES = new Set(['pending', 'approved', 'rejected'])

export function mapFansubMangaRevisionRow(row: RevisionRow): FansubMangaRevisionRequest {
  const before = row.before_data || {}
  const after = row.after_data || {}
  const changedFields = Object.keys(after).filter((key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]))
  const note = typeof row.meta?.note === 'string' && row.meta.note.trim() ? row.meta.note.trim() : null
  return {
    id: row.id,
    mangaId: row.target_id,
    status: (REVISION_STATUSES.has(row.status) ? row.status : 'pending') as FansubMangaRevisionRequest['status'],
    changedFields,
    note,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

/** The team's series correction requests (last 60). RLS: the fansub team sees its own records. */
export async function listFansubMangaRevisions(fansubId: string): Promise<FansubMangaRevisionRequest[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('pending_content_revisions')
        .select('id, target_id, status, before_data, after_data, meta, review_note, created_at, reviewed_at')
        .eq('fansub_id', fansubId)
        .eq('target_type', 'manga')
        .eq('change_action', 'edit')
        .order('created_at', { ascending: false })
        .limit(60),
      signal,
    ),
    { label: 'fansubManageService.listFansubMangaRevisions' },
  )
  if (error) throw error
  return z.array(revisionRowSchema).parse(data || []).map(mapFansubMangaRevisionRow)
}

export async function submitFansubMangaRevision(input: {
  fansubId: string
  mangaId: string
  changes: FansubMangaRevisionChanges
  note?: string
}): Promise<string> {
  if (!Object.keys(input.changes).length) throw new Error('Değişiklik yok.')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('submit_fansub_manga_revision', {
      p_fansub_id: input.fansubId,
      p_manga_id: input.mangaId,
      p_changes: input.changes,
      p_note: input.note?.trim() || null,
    }), signal),
    { label: 'fansubManageService.submitFansubMangaRevision' },
  )
  if (error) {
    if (error.code === '42501') throw new Error('Seri düzeltmesi göndermek için izin gerekir.')
    if (error.code === 'PT409') throw new Error('Seri henüz onay bekliyor; onaydan sonra düzeltme gönderilebilir.')
    throw new Error(error.message || 'Düzeltme gönderilemedi.')
  }
  return z.string().parse(data)
}
