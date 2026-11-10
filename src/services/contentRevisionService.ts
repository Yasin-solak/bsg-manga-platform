import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/**
 * Content revisions (pending_content_revisions): changes to a published series/chapter are not written
 * to the live row until approved; on approval they apply, the previous version stays archived as
 * before_data and a site admin can revert.
 */

const uuid = z.string().uuid()
const snapshot = z.record(z.string(), z.unknown()).nullable().transform((value) => value ?? {})

const revisionSchema = z.object({
  id: uuid,
  target_type: z.enum(['manga', 'chapter']),
  target_id: uuid,
  status: z.enum(['pending', 'approved', 'rejected']),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  review_note: z.string().nullable(),
  before_data: snapshot,
  after_data: snapshot,
  meta: snapshot,
  requested_by: z.string().nullable(),
  reviewed_by: z.string().nullable(),
  fansub_name: z.string().nullable(),
  manga_id: uuid.nullable(),
  manga_title: z.string().nullable(),
  manga_slug: z.string().nullable(),
  manga_cover: z.string().nullable(),
  chapter_number: z.coerce.number().nullable(),
  restored: z.boolean(),
})

export type ContentRevisionScope = 'pending' | 'archive'

export interface ContentRevision {
  id: string
  targetType: 'manga' | 'chapter'
  targetId: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  source: string | null
  restoredFrom: string | null
  /** The team's correction reason (requests from the fansub panel). */
  note: string | null
  requestedBy: string | null
  reviewedBy: string | null
  fansubName: string | null
  mangaId: string | null
  mangaTitle: string | null
  mangaSlug: string | null
  mangaCover: string | null
  chapterNumber: number | null
  /** Was a revert done after this archive record? */
  restored: boolean
}

function toRevision(row: z.infer<typeof revisionSchema>): ContentRevision {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    before: row.before_data,
    after: row.after_data,
    source: typeof row.meta.source === 'string' ? row.meta.source : null,
    restoredFrom: typeof row.meta.restored_from === 'string' ? row.meta.restored_from : null,
    note: typeof row.meta.note === 'string' && row.meta.note.trim() ? row.meta.note.trim() : null,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    fansubName: row.fansub_name,
    mangaId: row.manga_id,
    mangaTitle: row.manga_title,
    mangaSlug: row.manga_slug,
    mangaCover: row.manga_cover,
    chapterNumber: row.chapter_number,
    restored: row.restored,
  }
}

export async function listContentRevisions(scope: ContentRevisionScope, signal?: AbortSignal): Promise<ContentRevision[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('admin_list_content_revisions', { p_scope: scope, p_limit: 150 }), requestSignal),
    { label: 'Revizyon listesi', signal },
  )
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Revizyonlar okunamadı.'))
  const parsed = z.array(revisionSchema).safeParse(data ?? [])
  if (!parsed.success) throw new Error('Revizyonlar okunamadı.')
  return parsed.data.map(toRevision)
}

export async function approveContentRevision(revisionId: string, note?: string) {
  uuid.parse(revisionId)
  const { error } = await supabase.rpc('approve_content_revision', { p_revision_id: revisionId, p_note: note?.trim() || null })
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Revizyon onaylanamadı.'))
}

export async function rejectContentRevision(revisionId: string, note?: string) {
  uuid.parse(revisionId)
  const { error } = await supabase.rpc('reject_content_revision', { p_revision_id: revisionId, p_note: note?.trim() || null })
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Revizyon reddedilemedi.'))
}

/** Site admin only: the archived previous version returns to publication as a new approved revision. */
export async function restoreContentRevision(revisionId: string) {
  uuid.parse(revisionId)
  const { error } = await supabase.rpc('restore_content_revision', { p_revision_id: revisionId })
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Arşivden geri alınamadı.'))
}

/** Revision diff: only changed keys (the UI shows them side by side). */
export function changedRevisionKeys(revision: Pick<ContentRevision, 'before' | 'after'>): string[] {
  const keys = new Set([...Object.keys(revision.before), ...Object.keys(revision.after)])
  return [...keys].filter((key) => JSON.stringify(revision.before[key] ?? null) !== JSON.stringify(revision.after[key] ?? null))
}

export function revisionPages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}
