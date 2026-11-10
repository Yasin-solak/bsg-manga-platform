import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { studioAccessToken } from '@/services/studioAuth'
import { uploadMangaCover } from '@/services/storageService'
import { supabase } from '@/services/supabase'
import { normalizeSourceLanguage, StudioCodedError, type TlSeries, type TlSourceLanguage } from '@/services/translationStudioService'
import { txa } from '@/i18n/activeLocale'

/**
 * Translation Studio "My series": the team's series on the site, their chapters and revisions
 * of published chapters. Reads use tl_fansub_series* RPCs ("ceviri.gor"); writes go to the
 * existing revision system (pending_content_revisions), and the live record does not change
 * until approved.
 */

const uuid = z.string().uuid()

const seriesSchema = z.object({
  kind: z.enum(['manga', 'draft']),
  id: uuid,
  title: z.string(),
  slug: z.string().nullable(),
  description: z.string().nullable(),
  cover_url: z.string().nullable(),
  genres: z.array(z.string()).nullable(),
  original_lang: z.string().nullable(),
  is_mature: z.boolean(),
  is_approved: z.boolean(),
  is_active: z.boolean(),
  is_mine: z.boolean(),
  chapter_count: z.coerce.number(),
  live_chapter_count: z.coerce.number(),
  open_project_count: z.coerce.number(),
  last_update: z.string().nullable(),
  pending_revision: z.boolean(),
})

export interface TlFansubSeries {
  kind: 'manga' | 'draft'
  id: string
  title: string
  slug: string | null
  description: string
  coverUrl: string | null
  genres: string[]
  sourceLanguage: TlSourceLanguage
  isMature: boolean
  isApproved: boolean
  isActive: boolean
  isMine: boolean
  chapterCount: number
  liveChapterCount: number
  openProjectCount: number
  lastUpdate: string | null
  pendingRevision: boolean
}

function toSeries(row: z.infer<typeof seriesSchema>): TlFansubSeries {
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description ?? '',
    coverUrl: row.cover_url,
    genres: row.genres ?? [],
    sourceLanguage: normalizeSourceLanguage(row.original_lang) ?? 'ja',
    isMature: row.is_mature,
    isApproved: row.is_approved,
    isActive: row.is_active,
    isMine: row.is_mine,
    chapterCount: row.chapter_count,
    liveChapterCount: row.live_chapter_count,
    openProjectCount: row.open_project_count,
    lastUpdate: row.last_update,
    pendingRevision: row.pending_revision,
  }
}

/** The new chapter wizard expects the same object as an existing series selection. */
export function toWizardSeries(series: TlFansubSeries): TlSeries {
  return {
    id: series.id,
    title: series.title,
    coverUrl: series.coverUrl,
    genres: series.genres,
    sourceLanguage: series.sourceLanguage,
    isMine: series.isMine,
    isMature: series.isMature,
  }
}

export async function listFansubSeries(fansubId: string, signal?: AbortSignal): Promise<TlFansubSeries[]> {
  uuid.parse(fansubId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_fansub_series', { p_fansub_id: fansubId }), requestSignal),
    { label: txa('Serilerimiz'), signal },
  )
  if (error) throw new Error(txa('Seriler okunamadı.'))
  const parsed = z.array(seriesSchema).safeParse(data ?? [])
  if (!parsed.success) throw new Error(txa('Seriler okunamadı.'))
  return parsed.data.map(toSeries)
}

const chapterSchema = z.object({
  id: uuid,
  chapter_number: z.coerce.number(),
  title: z.string().nullable(),
  page_count: z.coerce.number(),
  is_approved: z.boolean(),
  is_active: z.boolean(),
  publish_at: z.string().nullable(),
  updated_at: z.string(),
  project_id: uuid.nullable(),
  revision_project_id: uuid.nullable(),
  revision_stage: z.string().nullable(),
  pending_revision: z.boolean(),
})

const seriesChaptersSchema = z.object({
  chapters: z.array(chapterSchema),
  projects: z.array(z.object({ id: uuid, chapter_number: z.coerce.number(), stage: z.string(), updated_at: z.string() })),
})

export interface TlSeriesChapter {
  id: string
  chapterNumber: number
  title: string | null
  pageCount: number
  isApproved: boolean
  isActive: boolean
  publishAt: string | null
  updatedAt: string
  /** The live project of a chapter published with the studio. */
  projectId: string | null
  /** Open revision project (if any). */
  revisionProjectId: string | null
  revisionStage: string | null
  pendingRevision: boolean
}

export interface TlSeriesProjectBrief {
  id: string
  chapterNumber: number
  stage: string
  updatedAt: string
}

export async function listSeriesChapters(fansubId: string, seriesId: string, signal?: AbortSignal): Promise<{ chapters: TlSeriesChapter[], projects: TlSeriesProjectBrief[] }> {
  uuid.parse(fansubId)
  uuid.parse(seriesId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_fansub_series_chapters', { p_fansub_id: fansubId, p_manga_id: seriesId }), requestSignal),
    { label: txa('Seri bölümleri'), signal },
  )
  if (error) throw new Error(txa('Bölümler okunamadı.'))
  const parsed = seriesChaptersSchema.safeParse(data)
  if (!parsed.success) throw new Error(txa('Bölümler okunamadı.'))
  return {
    chapters: parsed.data.chapters.map((row) => ({
      id: row.id,
      chapterNumber: row.chapter_number,
      title: row.title,
      pageCount: row.page_count,
      isApproved: row.is_approved,
      isActive: row.is_active,
      publishAt: row.publish_at,
      updatedAt: row.updated_at,
      projectId: row.project_id,
      revisionProjectId: row.revision_project_id,
      revisionStage: row.revision_stage,
      pendingRevision: row.pending_revision,
    })),
    projects: parsed.data.projects.map((row) => ({ id: row.id, chapterNumber: row.chapter_number, stage: row.stage, updatedAt: row.updated_at })),
  }
}

/** Opens a published chapter as a revision project (returns the existing revision if any). */
export async function openChapterRevision(chapterId: string): Promise<string> {
  uuid.parse(chapterId)
  const { data, error } = await supabase.rpc('tl_open_chapter_revision', { p_chapter_id: chapterId })
  if (error?.code === '42501') throw new Error(txa('Revizyon açmak için proje yönetimi izni gerekir.'))
  if (error?.code === 'PT409') throw new Error(txa('Onay bekleyen bölüm revizyonla değil, bölümler sekmesinden düzenlenir.'))
  if (error) throw new Error(txa('Revizyon açılamadı.'))
  return uuid.parse(data)
}

/** Takes a classic chapter's page into the revision project as raw (copied on the server). */
export async function importRevisionPage(pageId: string, signal?: AbortSignal): Promise<{ width: number, height: number }> {
  uuid.parse(pageId)
  const token = await studioAccessToken()
  if (!token) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  const response = await withServiceTimeout(
    (requestSignal) => fetch('/api/ceviri/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ page_id: pageId }),
      signal: requestSignal,
    }),
    { label: txa('Sayfa içe aktarma'), timeoutMs: 120_000, signal },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(payload)
    const message = parsed.success ? parsed.data.error : txa('Sayfa içe aktarılamadı ({v1}).', { v1: response.status })
    if (parsed.success && parsed.data.code) throw new StudioCodedError(message, parsed.data.code)
    throw new Error(message)
  }
  return z.object({ width: z.number().int(), height: z.number().int() }).parse(payload)
}

/** Republish: new pages go to approval as a revision; the old version stays live until approved. */
export async function submitChapterRevision(projectId: string, pages: string[], pageDimensions: Record<string, unknown> | null): Promise<string> {
  uuid.parse(projectId)
  if (!pages.length) throw new Error(txa('Revizyon en az bir sayfa içermeli.'))
  const { data, error } = await supabase.rpc('tl_submit_chapter_revision', {
    p_project_id: projectId, p_pages: pages, p_page_dimensions: pageDimensions,
  })
  if (error?.code === '42501') throw new Error(txa('Revizyonu göndermek için yayınlama izni gerekir.'))
  if (error) throw new Error(txa('Revizyon onaya gönderilemedi.'))
  return uuid.parse(data)
}

export interface TlSeriesEditInput {
  fansubId: string
  seriesId: string
  title: string
  description: string
  genres: string[]
  isMature: boolean
  cover: File | null
}

/** A series info change goes to approval; only changed fields are sent. */
export async function submitSeriesRevision(current: TlFansubSeries, input: TlSeriesEditInput): Promise<string> {
  uuid.parse(input.fansubId)
  uuid.parse(input.seriesId)
  const changes: Record<string, unknown> = {}
  const title = input.title.trim()
  if (!title) throw new Error(txa('Seri adı gerekli.'))
  if (title !== current.title) changes.title = title
  if (input.description.trim() !== current.description.trim()) changes.description = input.description.trim()
  const genres = input.genres.slice(0, 12)
  if (genres.join('|') !== current.genres.join('|')) changes.genres = genres
  if (input.isMature !== current.isMature) changes.is_mature = input.isMature
  if (input.cover) {
    changes.cover_image_url = await uploadMangaCover(input.cover, {
      fansubId: input.fansubId, mangaId: input.seriesId, draftKey: `revizyon-${crypto.randomUUID()}`,
    })
  }
  if (!Object.keys(changes).length) throw new Error(txa('Değişiklik yok.'))
  const { data, error } = await supabase.rpc('tl_submit_manga_revision', {
    p_fansub_id: input.fansubId, p_manga_id: input.seriesId, p_changes: changes,
  })
  if (error?.code === '42501') throw new Error(txa('Seri bilgilerini düzenlemek için izin gerekir.'))
  if (error?.code === 'PT409') throw new Error(txa('Seri henüz onay bekliyor; onaydan sonra düzenlenebilir.'))
  if (error) throw new Error(txa('Değişiklik onaya gönderilemedi.'))
  return uuid.parse(data)
}
