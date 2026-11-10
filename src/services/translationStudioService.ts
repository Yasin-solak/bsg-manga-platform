import { z } from 'zod'
import { studioAccessToken } from '@/services/studioAuth'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { uploadMangaCover } from '@/services/storageService'
import { supabase } from '@/services/supabase'
import { txa } from '@/i18n/activeLocale'

/**
 * Translation Studio V3 client service.
 *
 * Tables (translation_*) are protected by RLS; machine output and raw keys are
 * written only by the /api/ceviri/* Workers (service role).
 */

export type TlSourceLanguage = 'ja' | 'ko' | 'zh'
export type TlItemType = 'balon' | 'anlatim' | 'sfx' | 'tabela'
export type TlProjectStage = 'upload' | 'scan' | 'edit' | 'publish' | 'scheduled' | 'published' | 'archived'
export type TlScanStage = 'none' | 'uploaded' | 'detected' | 'read' | 'suggested' | 'cleaned' | 'failed'

export const TL_SOURCE_LANGUAGES: Record<TlSourceLanguage, { code: string, label: string }> = {
  ja: { code: 'JA', get label() { return txa('Japonca') } },
  ko: { code: 'KO', get label() { return txa('Korece') } },
  zh: { code: 'ZH', get label() { return txa('Çince') } },
}

const uuid = z.string().uuid()

/** Unexpected data shape is not shown to the user as raw validation text. */
function parseRows<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(txa('{v1} okunamadı.', { v1: label }))
  return result.data
}

// mangas.original_lang historically also contains 'jp'.
export function normalizeSourceLanguage(value: string | null | undefined): TlSourceLanguage | null {
  if (value === 'ja' || value === 'jp') return 'ja'
  if (value === 'ko' || value === 'zh') return value
  return null
}

// ---------------------------------------------------------------------------
// Seri
// ---------------------------------------------------------------------------

const seriesRowSchema = z.object({
  id: uuid,
  title: z.string(),
  slug: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  genres: z.array(z.string()).nullable(),
  original_lang: z.string().nullable(),
  fansub_id: z.string().nullable(),
  is_mature: z.boolean().nullable().optional(),
})

export interface TlSeries {
  id: string
  title: string
  coverUrl: string | null
  genres: string[]
  sourceLanguage: TlSourceLanguage
  isMine: boolean
  /** 18+ (adult) series: AI is off in the studio. */
  isMature: boolean
}

export async function listStudioSeries(fansubId: string, query: string, signal?: AbortSignal): Promise<TlSeries[]> {
  const term = query.trim().slice(0, 80)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => {
      let builder = supabase.from('mangas')
        .select('id,title,slug,cover_image_url,genres,original_lang,fansub_id,is_mature')
        .eq('is_active', true)
        .in('original_lang', ['ja', 'jp', 'ko', 'zh'])
        .order('updated_at', { ascending: false })
        .limit(64)
      if (term) {
        // Comma and parenthesis are delimiters in a PostgREST or() filter; cleaned in search.
        const safe = term.replace(/[,()*%]/g, ' ').trim()
        if (safe) builder = builder.or(`title.ilike.%${safe}%,slug.ilike.%${safe}%`)
      }
      return withAbortSignal(builder, requestSignal)
    },
    { label: txa('Stüdyo seri listesi'), signal },
  )
  if (error) throw error
  const rows = z.array(seriesRowSchema).parse(data ?? [])
  const series = rows.flatMap((row) => {
    const sourceLanguage = normalizeSourceLanguage(row.original_lang)
    if (!sourceLanguage) return []
    return [{
      id: row.id,
      title: row.title,
      coverUrl: row.cover_image_url,
      genres: row.genres ?? [],
      sourceLanguage,
      isMine: row.fansub_id === fansubId,
      isMature: row.is_mature === true,
    }]
  })
  // Ekibin kendi serileri once gelir.
  return series.sort((a, b) => Number(b.isMine) - Number(a.isMine))
}

export interface TlSeriesDraftInput {
  fansubId: string
  title: string
  originalTitle: string
  sourceLanguage: TlSourceLanguage
  genres: string[]
  cover: File | null
  isMature: boolean
}

export async function createSeriesDraft(input: TlSeriesDraftInput): Promise<{ id: string, coverUrl: string | null }> {
  uuid.parse(input.fansubId)
  const title = input.title.trim()
  if (!title) throw new Error(txa('Seri adı gerekli.'))
  let coverUrl: string | null = null
  if (input.cover) {
    coverUrl = await uploadMangaCover(input.cover, { fansubId: input.fansubId, draftKey: `ceviri-${crypto.randomUUID()}` })
  }
  const { data, error } = await supabase.from('translation_series_drafts').insert({
    fansub_id: input.fansubId,
    title,
    original_title: input.originalTitle.trim() || null,
    source_language: input.sourceLanguage,
    genres: input.genres.slice(0, 12),
    is_mature: input.isMature,
    // Although the column is named "key", it holds the public cover URL; moved to mangas on admin approval.
    cover_object_key: coverUrl,
  }).select('id').single()
  if (error) throw new Error(txa('Seri taslağı kaydedilemedi.'))
  return { id: uuid.parse(data.id), coverUrl }
}

// ---------------------------------------------------------------------------
// Proje
// ---------------------------------------------------------------------------

const projectRowSchema = z.object({
  id: uuid,
  fansub_id: uuid,
  manga_id: uuid.nullable(),
  series_draft_id: uuid.nullable(),
  chapter_number: z.coerce.number(),
  chapter_title: z.string().nullable(),
  source_language: z.enum(['ja', 'ko', 'zh']),
  target_language: z.string(),
  stage: z.enum(['upload', 'scan', 'edit', 'publish', 'scheduled', 'published', 'archived']),
  version: z.coerce.number(),
  updated_at: z.string(),
  revision_of: uuid.nullable().optional(),
  mangas: z.object({ title: z.string(), cover_image_url: z.string().nullable(), is_mature: z.boolean().nullable().optional() }).nullable().optional(),
  translation_series_drafts: z.object({ title: z.string(), cover_object_key: z.string().nullable(), is_mature: z.boolean().nullable().optional() }).nullable().optional(),
  translation_pages: z.array(z.object({ count: z.number() })).optional(),
})

export interface TlProject {
  id: string
  fansubId: string
  mangaId: string | null
  seriesDraftId: string | null
  seriesTitle: string
  coverUrl: string | null
  chapterNumber: number
  chapterTitle: string | null
  sourceLanguage: TlSourceLanguage
  targetLanguage: string
  stage: TlProjectStage
  version: number
  updatedAt: string
  pageCount: number
  /** 18+ series: AI scan/translation is off (the server rejects too). */
  isMature: boolean
  /** Revision of a published chapter: republishing goes to approval, the old version stays live. */
  revisionOf: string | null
}

const PROJECT_COLUMNS = 'id,fansub_id,manga_id,series_draft_id,chapter_number,chapter_title,source_language,target_language,stage,version,updated_at,revision_of,mangas(title,cover_image_url,is_mature),translation_series_drafts(title,cover_object_key,is_mature),translation_pages(count)'

function toProject(row: z.infer<typeof projectRowSchema>): TlProject {
  return {
    id: row.id,
    fansubId: row.fansub_id,
    mangaId: row.manga_id,
    seriesDraftId: row.series_draft_id,
    seriesTitle: row.mangas?.title ?? row.translation_series_drafts?.title ?? txa('Adsız seri'),
    coverUrl: row.mangas?.cover_image_url ?? row.translation_series_drafts?.cover_object_key ?? null,
    chapterNumber: row.chapter_number,
    chapterTitle: row.chapter_title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    stage: row.stage,
    version: row.version,
    updatedAt: row.updated_at,
    pageCount: row.translation_pages?.[0]?.count ?? 0,
    isMature: row.mangas?.is_mature === true || row.translation_series_drafts?.is_mature === true,
    revisionOf: row.revision_of ?? null,
  }
}

export async function listOpenProjects(fansubId: string, signal?: AbortSignal): Promise<TlProject[]> {
  uuid.parse(fansubId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_projects')
      .select(PROJECT_COLUMNS)
      .eq('fansub_id', fansubId)
      .not('stage', 'in', '(published,archived)')
      .order('updated_at', { ascending: false })
      .limit(12), requestSignal),
    { label: txa('Yarım kalan çeviriler'), signal },
  )
  if (error) throw error
  return parseRows(z.array(projectRowSchema), data ?? [], txa('Çeviri projeleri')).map(toProject)
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<TlProject> {
  uuid.parse(projectId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_projects')
      .select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle(), requestSignal),
    { label: txa('Çeviri projesi'), signal },
  )
  if (error) throw error
  if (!data) throw new Error(txa('Çeviri projesi bulunamadı ya da erişimin yok.'))
  return toProject(parseRows(projectRowSchema, data, txa('Çeviri projesi')))
}

export interface TlProjectInput {
  fansubId: string
  mangaId: string | null
  seriesDraftId: string | null
  chapterNumber: number
  chapterTitle: string
  sourceLanguage: TlSourceLanguage
}

export class TlProjectExistsError extends Error {
  constructor(readonly projectId: string | null) {
    super('Bu bölüm için ekibinin zaten bir çalışması var.')
  }
}

export async function createProject(input: TlProjectInput): Promise<TlProject> {
  uuid.parse(input.fansubId)
  if (!Number.isFinite(input.chapterNumber) || input.chapterNumber <= 0) throw new Error(txa('Bölüm numarası geçersiz.'))
  const { data, error } = await supabase.from('translation_projects').insert({
    fansub_id: input.fansubId,
    manga_id: input.mangaId,
    series_draft_id: input.seriesDraftId,
    chapter_number: input.chapterNumber,
    chapter_title: input.chapterTitle.trim() || null,
    source_language: input.sourceLanguage,
  }).select(PROJECT_COLUMNS).single()
  if (error?.code === '23505') {
    // Revision and archive projects are outside the uniqueness rule (translation_projects_manga_unique).
    let lookup = supabase.from('translation_projects').select('id')
      .eq('fansub_id', input.fansubId).eq('chapter_number', input.chapterNumber)
      .is('revision_of', null).neq('stage', 'archived')
    lookup = input.mangaId ? lookup.eq('manga_id', input.mangaId) : lookup.eq('series_draft_id', input.seriesDraftId ?? '')
    const { data: existing } = await lookup.maybeSingle()
    throw new TlProjectExistsError(existing?.id ?? null)
  }
  if (error) throw new Error(txa('Çeviri projesi oluşturulamadı.'))
  return toProject(projectRowSchema.parse(data))
}

export async function setProjectStage(projectId: string, stage: TlProjectStage): Promise<void> {
  uuid.parse(projectId)
  const { error } = await supabase.from('translation_projects').update({ stage }).eq('id', projectId)
  if (error) throw new Error(txa('Proje durumu güncellenemedi.'))
}

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------

const pageRowSchema = z.object({
  id: uuid,
  page_index: z.number().int(),
  file_name: z.string().nullable(),
  raw_status: z.enum(['empty', 'pending', 'ready']),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  scan_stage: z.enum(['none', 'uploaded', 'detected', 'read', 'suggested', 'cleaned', 'failed']),
  scan_error: z.string().nullable(),
  version: z.coerce.number(),
})

export interface TlPage {
  id: string
  pageIndex: number
  fileName: string | null
  rawStatus: 'empty' | 'pending' | 'ready'
  width: number | null
  height: number | null
  scanStage: TlScanStage
  scanError: string | null
  version: number
}

function toPage(row: z.infer<typeof pageRowSchema>): TlPage {
  return {
    id: row.id,
    pageIndex: row.page_index,
    fileName: row.file_name,
    rawStatus: row.raw_status,
    width: row.width,
    height: row.height,
    scanStage: row.scan_stage,
    scanError: row.scan_error,
    version: row.version,
  }
}

const PAGE_COLUMNS = 'id,page_index,file_name,raw_status,width,height,scan_stage,scan_error,version'

export async function listPages(projectId: string, signal?: AbortSignal): Promise<TlPage[]> {
  uuid.parse(projectId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_pages')
      .select(PAGE_COLUMNS).eq('project_id', projectId).order('page_index'), requestSignal),
    { label: txa('Proje sayfaları'), signal },
  )
  if (error) throw error
  return parseRows(z.array(pageRowSchema), data ?? [], txa('Proje sayfaları')).map(toPage)
}

/** Dosya adindaki sayilar sayisal siralanir: ham_2 < ham_10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' })
}

export const TL_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const
export const TL_MAX_PAGE_BYTES = 20 * 1024 * 1024

/** Opens empty page rows after existing pages for new files. */
export async function createPages(projectId: string, fileNames: string[], startIndex: number): Promise<TlPage[]> {
  uuid.parse(projectId)
  if (!fileNames.length) return []
  if (startIndex + fileNames.length > 1000) throw new Error(txa('Bir bölüm en fazla 1000 sayfa olabilir.'))
  const { data, error } = await supabase.from('translation_pages').insert(fileNames.map((fileName, offset) => ({
    project_id: projectId,
    page_index: startIndex + offset,
    file_name: fileName.slice(0, 255),
  }))).select(PAGE_COLUMNS)
  if (error) throw new Error(txa('Sayfa kayıtları açılamadı.'))
  return z.array(pageRowSchema).parse(data ?? []).map(toPage).sort((a, b) => a.pageIndex - b.pageIndex)
}

/** Automatic service quota/load (429 provider_busy); the scan waits and repeats the same job. */
export class StudioBusyError extends Error {
  constructor(message: string, readonly retryAfterMs: number) {
    super(message)
    this.name = 'StudioBusyError'
  }
}

const abortableDelay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'))
    return
  }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
  const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
  signal?.addEventListener('abort', onAbort, { once: true })
})

/**
 * So a page does not fall to "error" when the per-minute limit fills on a free/low-quota key:
 * waits the server's suggested time (5-60 s) and retries the same job at most `attempts` times.
 */
export async function withBusyRetry<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
  onWait?: (ms: number) => void,
  attempts = 4,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      if (!(error instanceof StudioBusyError) || attempt >= attempts) throw error
      const wait = Math.min(60_000, Math.max(5_000, error.retryAfterMs))
      onWait?.(wait)
      await abortableDelay(wait, signal)
    }
  }
}

/** An error with a reason code from the server (content_blocked, quota_exhausted, ai_disabled_mature ...). */
export class StudioCodedError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'StudioCodedError'
  }
}

async function authorizedFetch(path: string, init: RequestInit, label: string, timeoutMs: number, signal?: AbortSignal) {
  const token = await studioAccessToken()
  if (!token) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  const response = await withServiceTimeout(
    (requestSignal) => fetch(path, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: requestSignal,
    }),
    { label, timeoutMs, signal },
  )
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(payload)
    const message = parsed.success ? parsed.data.error : txa('{v1} başarısız ({v2}).', { v1: label, v2: response.status })
    if (response.status === 429 && parsed.success && parsed.data.code === 'provider_busy') {
      const seconds = Number(response.headers.get('retry-after'))
      throw new StudioBusyError(message, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 20_000)
    }
    // Coded error: the UI explains the cause and what to do (studioErrors).
    if (parsed.success && parsed.data.code) throw new StudioCodedError(message, parsed.data.code)
    throw new Error(message)
  }
  return response.json() as Promise<unknown>
}

export async function uploadPageRaw(pageId: string, file: File, signal?: AbortSignal) {
  uuid.parse(pageId)
  const form = new FormData()
  form.set('page_id', pageId)
  form.set('file', file, file.name)
  const payload = await authorizedFetch('/api/ceviri/raw', { method: 'POST', body: form }, txa('Sayfa yükleme'), 120_000, signal)
  return z.object({ width: z.number().int(), height: z.number().int() }).parse(payload)
}

export function rawPageUrl(pageId: string) {
  return `/api/ceviri/raw?page_id=${encodeURIComponent(pageId)}`
}

// ---------------------------------------------------------------------------
// Tarama
// ---------------------------------------------------------------------------

export interface TlTile { x: number, y: number, width: number, height: number }

/** Same as planTiles in functions/api/ceviri/scan.js: at most 1024px tiles, at least 256px overlap, even spacing. */
export function planTiles(width: number, height: number, size = 1024, overlap = 256): TlTile[] {
  const axis = (length: number) => {
    if (length <= size) return [0]
    const count = Math.ceil((length - overlap) / (size - overlap))
    return Array.from({ length: count }, (_, index) => Math.round(index * (length - size) / (count - 1)))
  }
  const tiles: TlTile[] = []
  for (const y of axis(height)) {
    for (const x of axis(width)) tiles.push({ x, y, width: Math.min(size, width), height: Math.min(size, height) })
  }
  return tiles
}

export async function scanTile(pageId: string, tile: TlTile, signal?: AbortSignal) {
  uuid.parse(pageId)
  const payload = await authorizedFetch('/api/ceviri/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId, ...tile }),
  }, txa('Otomatik tarama'), 90_000, signal)
  return z.object({ items: z.array(z.object({ id: uuid })).default([]) }).parse(payload)
}

export async function translatePage(pageId: string, signal?: AbortSignal) {
  uuid.parse(pageId)
  const payload = await authorizedFetch('/api/ceviri/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id: pageId }),
  }, txa('Çeviri önerisi'), 120_000, signal)
  return z.object({ translated: z.number().int().default(0) }).passthrough().parse(payload)
}

export interface TlScanSummary {
  total: number
  byType: Record<TlItemType, number>
  lowConfidence: number
  perPage: Record<string, number>
}

export async function getScanSummary(pageIds: string[], signal?: AbortSignal): Promise<TlScanSummary> {
  const summary: TlScanSummary = {
    total: 0, byType: { balon: 0, anlatim: 0, sfx: 0, tabela: 0 }, lowConfidence: 0, perPage: {},
  }
  if (!pageIds.length) return summary
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_items')
      .select('page_id,type,ocr_confidence').in('page_id', pageIds).limit(20_000), requestSignal),
    { label: txa('Tarama özeti'), signal },
  )
  if (error) throw error
  for (const row of z.array(z.object({
    page_id: uuid, type: z.enum(['balon', 'anlatim', 'sfx', 'tabela']), ocr_confidence: z.coerce.number().nullable(),
  })).parse(data ?? [])) {
    summary.total += 1
    summary.byType[row.type] += 1
    summary.perPage[row.page_id] = (summary.perPage[row.page_id] ?? 0) + 1
    if (row.ocr_confidence !== null && row.ocr_confidence < 0.8) summary.lowConfidence += 1
  }
  return summary
}

export async function setPageScanStage(pageId: string, stage: TlScanStage, scanError: string | null = null) {
  uuid.parse(pageId)
  const { error } = await supabase.from('translation_pages')
    .update({ scan_stage: stage, scan_error: scanError?.slice(0, 500) ?? null }).eq('id', pageId)
  if (error) throw new Error(txa('Sayfa durumu güncellenemedi.'))
}

export async function deletePage(pageId: string): Promise<void> {
  uuid.parse(pageId)
  const { error } = await supabase.from('translation_pages').delete().eq('id', pageId)
  if (error) throw new Error(txa('Sayfa kaldırılamadı.'))
}

/** Is the new chapter waiting for moderation approval? (a fansub admin opens the chapter with is_approved=false) */
export async function isChapterApproved(chapterId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('chapters').select('is_approved').eq('id', chapterId).maybeSingle()
  if (error || !data) return null
  return Boolean(data.is_approved)
}

/** After publish, links the project to the created chapter (a trigger verifies the chapter belongs to the project). */
export async function linkPublishedChapter(projectId: string, chapterId: string, publishAt: string | null): Promise<void> {
  uuid.parse(projectId)
  uuid.parse(chapterId)
  const scheduled = publishAt !== null && new Date(publishAt).getTime() > Date.now()
  const { error } = await supabase.from('translation_projects').update({
    chapter_id: chapterId,
    stage: scheduled ? 'scheduled' : 'published',
    publish_at: publishAt,
  }).eq('id', projectId)
  if (error) throw new Error(txa('Bölüm yayınlandı ama proje kaydı güncellenemedi.'))
}

/** Text-free clean page: when a reader picks another language, that language's text is laid on this base. */
export async function uploadCleanPage(pageId: string, file: File, signal?: AbortSignal): Promise<void> {
  uuid.parse(pageId)
  const form = new FormData()
  form.set('page_id', pageId)
  form.set('file', file, file.name)
  await authorizedFetch('/api/ceviri/clean', { method: 'POST', body: form }, txa('Temiz sayfa yükleme'), 120_000, signal)
}

/** Atomically writes the drag-and-drop order from the publish step (all page ids, in new order). */
export async function reorderPages(projectId: string, pageIds: string[]): Promise<void> {
  uuid.parse(projectId)
  const { error } = await supabase.rpc('tl_reorder_pages', { p_project_id: projectId, p_page_ids: pageIds })
  if (error) throw new Error(txa('Sayfa sırası kaydedilemedi.'))
}

// ---------------------------------------------------------------------------
// Seri taslagi onayi (site admini)
// ---------------------------------------------------------------------------

const draftRowSchema = z.object({
  id: uuid,
  fansub_id: uuid,
  title: z.string(),
  original_title: z.string().nullable(),
  source_language: z.enum(['ja', 'ko', 'zh']),
  genres: z.array(z.string()),
  cover_object_key: z.string().nullable(),
  created_at: z.string(),
  is_mature: z.boolean().nullable().optional(),
  fansubs: z.object({ name: z.string() }).nullable().optional(),
  translation_projects: z.array(z.object({ chapter_number: z.coerce.number() })).optional(),
})

export interface TlSeriesDraft {
  id: string
  fansubId: string
  fansubName: string
  title: string
  originalTitle: string | null
  sourceLanguage: TlSourceLanguage
  genres: string[]
  coverUrl: string | null
  createdAt: string
  chapters: number[]
  /** 18+: on approval the series is marked adult and AI is off in the studio. */
  isMature: boolean
}

const genreSuggestionSchema = z.object({ genre: z.string(), uses: z.coerce.number() })
export type TlGenreSuggestion = z.infer<typeof genreSuggestionSchema>

/** Tur secici: sitedeki serilerde kullanilan turler (kullanim sayisiyla). */
export async function getGenreSuggestions(signal?: AbortSignal): Promise<TlGenreSuggestion[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_genre_suggestions'), requestSignal),
    { label: txa('Tür önerileri'), signal },
  )
  if (error) throw new Error(txa('Tür önerileri okunamadı.'))
  return parseRows(z.array(genreSuggestionSchema), data ?? [], txa('Tür önerileri'))
}

/** Admin rozeti: bekleyen seri talebi sayisi. */
export async function countPendingSeriesDrafts(signal?: AbortSignal): Promise<number> {
  const { count, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_series_drafts')
      .select('id', { count: 'exact', head: true }).eq('status', 'pending'), requestSignal),
    { label: txa('Seri talepleri'), signal },
  )
  if (error) throw new Error(txa('Seri talepleri okunamadı.'))
  return count ?? 0
}

export async function listPendingSeriesDrafts(signal?: AbortSignal): Promise<TlSeriesDraft[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_series_drafts')
      .select('id,fansub_id,title,original_title,source_language,genres,cover_object_key,created_at,is_mature,fansubs(name),translation_projects(chapter_number)')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100), requestSignal),
    { label: txa('Seri talepleri'), signal },
  )
  if (error) throw new Error(txa('Seri talepleri okunamadı.'))
  return parseRows(z.array(draftRowSchema), data ?? [], txa('Seri talepleri')).map((row) => ({
    id: row.id,
    fansubId: row.fansub_id,
    fansubName: row.fansubs?.name ?? txa('Fansub'),
    title: row.title,
    originalTitle: row.original_title,
    sourceLanguage: row.source_language,
    genres: row.genres,
    coverUrl: row.cover_object_key,
    createdAt: row.created_at,
    chapters: (row.translation_projects ?? []).map((project) => project.chapter_number).sort((a, b) => a - b),
    isMature: row.is_mature === true,
  }))
}

/** Approval: creates a new series (links to an existing one if mangaId is given) and moves pending projects. */
export async function approveSeriesDraft(draftId: string, mangaId: string | null = null): Promise<string> {
  uuid.parse(draftId)
  const { data, error } = await supabase.rpc('tl_approve_series_draft', { p_draft_id: draftId, p_manga_id: mangaId })
  if (error?.code === '23505') throw new Error(txa('Bu seride aynı bölüm numarasıyla başka bir çalışma var.'))
  if (error) throw new Error(txa('Seri talebi onaylanamadı.'))
  return uuid.parse(data)
}

const aiUsageSchema = z.object({ used: z.number(), limit: z.number(), unlimited: z.boolean() })
export type TlAiUsage = z.infer<typeof aiUsageSchema>

/** Pilot: the team's AI page allowance today (a page counts once a day). */
export async function getAiUsageToday(fansubId: string): Promise<TlAiUsage> {
  uuid.parse(fansubId)
  const { data, error } = await supabase.rpc('tl_ai_usage_today', { p_fansub_id: fansubId })
  if (error) throw new Error(txa('Günlük kullanım okunamadı.'))
  return aiUsageSchema.parse(data)
}

/** The rejection reason (optional, at most 500) is stored and sent to the member who opened the request. */
export async function rejectSeriesDraft(draftId: string, note?: string): Promise<void> {
  uuid.parse(draftId)
  const reason = z.string().trim().max(500).parse(note ?? '')
  const { error } = await supabase.rpc('tl_reject_series_draft', { p_draft_id: draftId, p_note: reason || null })
  if (error) throw new Error(txa('Seri talebi reddedilemedi.'))
}
