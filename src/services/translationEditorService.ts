import { z } from 'zod'
import { studioAccessToken } from '@/services/studioAuth'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'
import type { TlItemType } from '@/services/translationStudioService'
import { txa } from '@/i18n/activeLocale'

/**
 * Translation Studio V3 editor data.
 *
 * Each row carries `version`; updates use `eq('version', v)` and
 * a trigger increments the version. If no row returns, another session changed it.
 * Coordinates are the page's natural pixels.
 */

export type TlShape = 'elips' | 'kutu' | 'yok'
export type TlCleanup = 'beyaz' | 'onarim'
export type TlTextStatus = 'eksik' | 'oneri' | 'onayli'
export type TlAlign = 'left' | 'center' | 'right'

export interface TlStyle {
  font?: string
  size?: number
  lineHeight?: number
  letterSpacing?: number
  align?: TlAlign
  color?: string
  stroke?: boolean
  strokeColor?: string
  /** Kontur kalinligi: yazi boyutunun yuzdesi. */
  strokeWidth?: number
  italic?: boolean
  /** If a second color is given the fill becomes a top-to-bottom gradient. */
  color2?: string
  shadow?: boolean
  shadowColor?: string
  /** Shadow blur and offsets: a percentage of text size. Offset 0 = glow. */
  shadowBlur?: number
  shadowX?: number
  shadowY?: number
  /** Kavis: -100 (asagi yay) .. 100 (yukari yay). */
  bend?: number
}

export interface TlFontSuggestion { font: string, size: number, reason?: string }

export interface TlItem {
  id: string
  pageId: string
  type: TlItemType
  shape: TlShape
  x: number
  y: number
  w: number
  h: number
  /** Freeform (lasso) polygon; otherwise the area is a rectangle. */
  polygon: TlPoint[] | null
  rotation: number
  readingOrder: number
  sourceText: string
  sourceOrigin: 'ocr' | 'manual'
  ocrConfidence: number | null
  sourceFontSize: number | null
  manual: boolean
  cleanup: TlCleanup
  style: TlStyle
  fontSuggestion: TlFontSuggestion | null
  version: number
  sourceVersion: number
  // TR metni (translation_item_texts)
  text: string
  status: TlTextStatus
  textOrigin: 'machine' | 'human' | null
  textVersion: number | null
}

export interface TlSuggestion { itemId: string, rank: number, text: string, provider: string, model: string }

export type TlStrokePoint = { x: number, y: number, /** Pen pressure 0-1 (pen only). */ p?: number }

export interface TlStroke {
  /**
   * brush: paints with color · heal: repairs by continuing texture · stamp: clone · restore: paints the
   * original back · selection: action on the selected area (fill / heal / restore) · eraser: old record compatibility
   */
  tool: 'firca' | 'onarim' | 'silgi' | 'damga' | 'geri' | 'secim'
  color?: string
  radius: number
  points: TlStrokePoint[]
  /** Clone stamp: offset of copied pixels from the trace point. */
  offset?: { x: number, y: number }
  /** 0.01-1 (firca, damga, geri). */
  opacity?: number
  /** 0 yumusak kenar - 1 sert kenar. */
  hardness?: number
  /** Secim islemi. */
  mode?: 'doldur' | 'onar' | 'geri'
  /** Secim bicimi: kutu (2 kose), kement (cokgen), degnek (1 tohum + tolerance). */
  shape?: 'kutu' | 'kement' | 'degnek'
  tolerance?: number
}

export type TlPoint = { x: number, y: number }

const itemRowSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().uuid(),
  type: z.enum(['balon', 'anlatim', 'sfx', 'tabela']),
  shape: z.enum(['elips', 'kutu', 'yok']),
  bbox_x: z.number(),
  bbox_y: z.number(),
  bbox_w: z.number(),
  bbox_h: z.number(),
  polygon: z.array(z.object({ x: z.number(), y: z.number() })).nullable(),
  rotation: z.coerce.number(),
  reading_order: z.number(),
  source_text: z.string(),
  source_origin: z.enum(['ocr', 'manual']),
  ocr_confidence: z.coerce.number().nullable(),
  source_font_size: z.coerce.number().nullable(),
  manual: z.boolean(),
  cleanup: z.enum(['beyaz', 'onarim']),
  style: z.record(z.string(), z.unknown()).default({}),
  font_suggestion: z.object({ font: z.string(), size: z.number(), reason: z.string().optional() }).nullable(),
  version: z.coerce.number(),
  source_version: z.coerce.number(),
  translation_item_texts: z.array(z.object({
    language: z.string(),
    text: z.string(),
    status: z.enum(['eksik', 'oneri', 'onayli']),
    origin: z.enum(['machine', 'human']),
    version: z.coerce.number(),
  })).default([]),
})

const ITEM_COLUMNS = 'id,page_id,type,shape,bbox_x,bbox_y,bbox_w,bbox_h,polygon,rotation,reading_order,source_text,source_origin,ocr_confidence,source_font_size,manual,cleanup,style,font_suggestion,version,source_version,translation_item_texts(language,text,status,origin,version)'

function toItem(row: z.infer<typeof itemRowSchema>, language: string): TlItem {
  const text = row.translation_item_texts.find((entry) => entry.language === language)
  return {
    id: row.id,
    pageId: row.page_id,
    type: row.type,
    shape: row.shape,
    x: row.bbox_x,
    y: row.bbox_y,
    w: row.bbox_w,
    h: row.bbox_h,
    polygon: row.polygon,
    rotation: row.rotation,
    readingOrder: row.reading_order,
    sourceText: row.source_text,
    sourceOrigin: row.source_origin,
    ocrConfidence: row.ocr_confidence,
    sourceFontSize: row.source_font_size,
    manual: row.manual,
    cleanup: row.cleanup,
    style: row.style as TlStyle,
    fontSuggestion: row.font_suggestion,
    version: row.version,
    sourceVersion: row.source_version,
    text: text?.text ?? '',
    status: text ? (text.text.trim() ? text.status : 'eksik') : 'eksik',
    textOrigin: text?.origin ?? null,
    textVersion: text?.version ?? null,
  }
}

export async function loadPageItems(pageId: string, language: string, signal?: AbortSignal): Promise<TlItem[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_items')
      .select(ITEM_COLUMNS).eq('page_id', pageId)
      .order('reading_order').order('id'), requestSignal),
    { label: txa('Sayfa ögeleri'), signal },
  )
  if (error) throw error
  const parsed = z.array(itemRowSchema).safeParse(data ?? [])
  if (!parsed.success) throw new Error(txa('Sayfa öğeleri okunamadı.'))
  return parsed.data.map((row) => toItem(row, language))
}

/** Bulk review: items on all pages of the chapter (by page and reading order). */
export async function loadProjectItems(pageIds: string[], language: string, signal?: AbortSignal): Promise<TlItem[]> {
  if (!pageIds.length) return []
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_items')
      .select(ITEM_COLUMNS).in('page_id', pageIds)
      .order('reading_order').order('id').limit(5000), requestSignal),
    { label: txa('Bölüm öğeleri'), signal },
  )
  if (error) throw error
  const parsed = z.array(itemRowSchema).safeParse(data ?? [])
  if (!parsed.success) throw new Error(txa('Bölüm öğeleri okunamadı.'))
  const pageOrder = new Map(pageIds.map((id, index) => [id, index]))
  return parsed.data.map((row) => toItem(row, language))
    .sort((a, b) => (pageOrder.get(a.pageId) ?? 0) - (pageOrder.get(b.pageId) ?? 0) || a.readingOrder - b.readingOrder)
}

export async function loadSuggestions(itemIds: string[], language: string, signal?: AbortSignal): Promise<TlSuggestion[]> {
  if (!itemIds.length) return []
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_suggestions')
      .select('item_id,rank,text,provider,model,source_version')
      .in('item_id', itemIds).eq('language', language)
      .order('source_version', { ascending: false }).order('rank'), requestSignal),
    { label: txa('Çeviri önerileri'), signal },
  )
  if (error) throw error
  const rows = z.array(z.object({
    item_id: z.string().uuid(), rank: z.number(), text: z.string(), provider: z.string(), model: z.string(), source_version: z.coerce.number(),
  })).parse(data ?? [])
  // Yalniz ogenin en guncel kaynak surumune ait adaylar.
  const latest = new Map<string, number>()
  for (const row of rows) if (!latest.has(row.item_id)) latest.set(row.item_id, row.source_version)
  return rows.filter((row) => latest.get(row.item_id) === row.source_version)
    .map((row) => ({ itemId: row.item_id, rank: row.rank, text: row.text, provider: row.provider, model: row.model }))
}

export interface TlPageStatus { pageId: string, total: number, approved: number, missing: number }

/** Project-wide counts for status icons in the page strip. */
export async function loadPageStatuses(pageIds: string[], language: string, signal?: AbortSignal): Promise<Record<string, TlPageStatus>> {
  const result: Record<string, TlPageStatus> = {}
  for (const pageId of pageIds) result[pageId] = { pageId, total: 0, approved: 0, missing: 0 }
  if (!pageIds.length) return result
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_items')
      .select('page_id,translation_item_texts(language,text,status)').in('page_id', pageIds).limit(20_000), requestSignal),
    { label: txa('Sayfa durumları'), signal },
  )
  if (error) throw error
  for (const row of z.array(z.object({
    page_id: z.string().uuid(),
    translation_item_texts: z.array(z.object({ language: z.string(), text: z.string(), status: z.string() })).default([]),
  })).parse(data ?? [])) {
    const entry = result[row.page_id]
    if (!entry) continue
    const text = row.translation_item_texts.find((item) => item.language === language)
    entry.total += 1
    if (text?.status === 'onayli') entry.approved += 1
    else if (!text?.text.trim()) entry.missing += 1
  }
  return result
}

export class TlConflictError extends Error {
  constructor() { super('Bu öğe başka bir oturumda değişti; güncel hâli yüklendi.') }
}

function styleForDb(style: TlStyle): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(style)) if (value !== undefined) out[key] = value
  return out
}

export type TlItemPatch = Partial<Pick<TlItem, 'type' | 'shape' | 'x' | 'y' | 'w' | 'h' | 'polygon' | 'rotation' | 'sourceText' | 'cleanup' | 'style' | 'readingOrder'>>

/** Writes an item's geometry/style fields with version control; returns the new version. */
export async function saveItem(item: TlItem, patch: TlItemPatch): Promise<{ version: number, sourceVersion: number }> {
  const row: Record<string, unknown> = {}
  if (patch.type !== undefined) row.type = patch.type
  if (patch.shape !== undefined) row.shape = patch.shape
  if (patch.x !== undefined) row.bbox_x = Math.max(0, Math.round(patch.x))
  if (patch.y !== undefined) row.bbox_y = Math.max(0, Math.round(patch.y))
  if (patch.w !== undefined) row.bbox_w = Math.max(1, Math.round(patch.w))
  if (patch.h !== undefined) row.bbox_h = Math.max(1, Math.round(patch.h))
  if (patch.polygon !== undefined) row.polygon = patch.polygon?.map((point) => ({ x: Math.max(0, Math.round(point.x)), y: Math.max(0, Math.round(point.y)) })) ?? null
  if (patch.rotation !== undefined) row.rotation = Math.max(-180, Math.min(180, patch.rotation))
  if (patch.sourceText !== undefined) {
    row.source_text = patch.sourceText.slice(0, 5000)
    row.source_origin = 'manual'
  }
  if (patch.cleanup !== undefined) row.cleanup = patch.cleanup
  if (patch.style !== undefined) row.style = styleForDb(patch.style)
  if (patch.readingOrder !== undefined) row.reading_order = patch.readingOrder
  const { data, error } = await supabase.from('translation_items').update(row)
    .eq('id', item.id).eq('version', item.version).select('version,source_version')
  if (error) throw new Error(error.code === 'PT422' ? txa('Alan sayfa sınırının dışına çıkamaz.') : txa('Öğe kaydedilemedi.'))
  if (!data?.length) throw new TlConflictError()
  return { version: Number(data[0].version), sourceVersion: Number(data[0].source_version) }
}

export async function insertItem(input: {
  pageId: string, type: TlItemType, x: number, y: number, w: number, h: number,
  style?: TlStyle, readingOrder: number, shape?: TlShape, polygon?: TlPoint[] | null,
}, language: string): Promise<TlItem> {
  const { data, error } = await supabase.from('translation_items').insert({
    page_id: input.pageId,
    type: input.type,
    shape: input.shape ?? 'yok',
    bbox_x: Math.max(0, Math.round(input.x)),
    bbox_y: Math.max(0, Math.round(input.y)),
    bbox_w: Math.max(1, Math.round(input.w)),
    bbox_h: Math.max(1, Math.round(input.h)),
    polygon: input.polygon?.map((point) => ({ x: Math.max(0, Math.round(point.x)), y: Math.max(0, Math.round(point.y)) })) ?? null,
    manual: true,
    source_origin: 'manual',
    reading_order: input.readingOrder,
    style: styleForDb(input.style ?? {}),
  }).select(ITEM_COLUMNS).single()
  if (error) throw new Error(error.code === 'PT422' ? txa('Alan sayfa sınırının dışına çıkamaz.') : txa('Alan eklenemedi.'))
  return toItem(itemRowSchema.parse(data), language)
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('translation_items').delete().eq('id', itemId)
  if (error) throw new Error(txa('Alan silinemedi.'))
}

/**
 * Human text: a new row or a version-controlled update of an existing row.
 * Overwriting a machine row sets origin to 'human'; the trigger does not allow the reverse.
 */
export async function saveHumanText(item: TlItem, language: string, text: string, status: TlTextStatus): Promise<number> {
  const normalizedStatus: TlTextStatus = text.trim() ? status : 'eksik'
  if (item.textVersion === null) {
    const { data, error } = await supabase.from('translation_item_texts').insert({
      item_id: item.id, language, text: text.slice(0, 10000), status: normalizedStatus,
      origin: 'human', source_version: item.sourceVersion,
    }).select('version').single()
    if (error?.code === '23505') throw new TlConflictError()
    if (error) throw new Error(txa('Çeviri kaydedilemedi.'))
    return Number(data.version)
  }
  const { data, error } = await supabase.from('translation_item_texts').update({
    text: text.slice(0, 10000), status: normalizedStatus, origin: 'human', source_version: item.sourceVersion,
    provider: null, model: null,
  }).eq('item_id', item.id).eq('language', language).eq('version', item.textVersion).select('version')
  if (error) throw new Error(txa('Çeviri kaydedilemedi.'))
  if (!data?.length) throw new TlConflictError()
  return Number(data[0].version)
}

export async function loadItem(itemId: string, language: string): Promise<TlItem | null> {
  const { data, error } = await supabase.from('translation_items').select(ITEM_COLUMNS).eq('id', itemId).maybeSingle()
  if (error) throw new Error(txa('Öğe okunamadı.'))
  return data ? toItem(itemRowSchema.parse(data), language) : null
}

// ---------------------------------------------------------------------------
// Temizleme katmani
// ---------------------------------------------------------------------------

export async function loadCleanup(pageId: string, signal?: AbortSignal): Promise<{ strokes: TlStroke[], version: number | null }> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_page_cleanup')
      .select('strokes,version').eq('page_id', pageId).maybeSingle(), requestSignal),
    { label: txa('Temizleme katmanı'), signal },
  )
  if (error) throw error
  if (!data) return { strokes: [], version: null }
  return { strokes: (data.strokes ?? []) as TlStroke[], version: Number(data.version) }
}

export async function saveCleanup(pageId: string, strokes: TlStroke[], version: number | null): Promise<number> {
  const round2 = (value: number) => Math.round(value * 100) / 100
  const payload = strokes.map((stroke) => ({
    tool: stroke.tool,
    radius: Math.max(1, Math.min(200, Math.round(stroke.radius))),
    points: stroke.points.slice(0, 4096).map((point) => ({
      x: Math.round(point.x), y: Math.round(point.y),
      ...(typeof point.p === 'number' ? { p: round2(Math.max(0, Math.min(1, point.p))) } : {}),
    })),
    ...(stroke.color && (stroke.tool !== 'secim' || stroke.mode === 'doldur') ? { color: stroke.color } : {}),
    ...(stroke.tool === 'damga' && stroke.offset ? { offset: { x: Math.round(stroke.offset.x), y: Math.round(stroke.offset.y) } } : {}),
    ...(typeof stroke.opacity === 'number' && stroke.opacity < 1 ? { opacity: round2(Math.max(0.01, stroke.opacity)) } : {}),
    ...(typeof stroke.hardness === 'number' && stroke.hardness < 1 ? { hardness: round2(Math.max(0, stroke.hardness)) } : {}),
    ...(stroke.tool === 'secim' ? { mode: stroke.mode ?? 'onar', shape: stroke.shape ?? 'kutu' } : {}),
    ...(stroke.tool === 'secim' && stroke.shape === 'degnek' ? { tolerance: Math.round(Math.max(0, Math.min(255, stroke.tolerance ?? 32))) } : {}),
  })).slice(-2000)
  if (version === null) {
    const { data, error } = await supabase.from('translation_page_cleanup')
      .insert({ page_id: pageId, strokes: payload }).select('version').single()
    if (error?.code === '23505') throw new TlConflictError()
    if (error) throw new Error(txa('Temizleme izleri kaydedilemedi.'))
    return Number(data.version)
  }
  const { data, error } = await supabase.from('translation_page_cleanup')
    .update({ strokes: payload }).eq('page_id', pageId).eq('version', version).select('version')
  if (error) throw new Error(txa('Temizleme izleri kaydedilemedi.'))
  if (!data?.length) throw new TlConflictError()
  return Number(data[0].version)
}

// ---------------------------------------------------------------------------
// Sozluk
// ---------------------------------------------------------------------------

export interface TlGlossaryTerm { source: string, target: string, note: string | null }

export async function loadGlossary(fansubId: string, mangaId: string | null, sourceLanguage: string, signal?: AbortSignal): Promise<TlGlossaryTerm[]> {
  let query = supabase.from('translation_glossary').select('source_term,target_term,note,manga_id')
    .eq('fansub_id', fansubId).eq('source_language', sourceLanguage).eq('target_language', 'tr').limit(1000)
  query = mangaId ? query.or(`manga_id.is.null,manga_id.eq.${mangaId}`) : query.is('manga_id', null)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(query, requestSignal),
    { label: txa('Sözlük'), signal },
  )
  if (error) return []
  return (data ?? []).map((row) => ({ source: String(row.source_term), target: String(row.target_term), note: row.note ? String(row.note) : null }))
}

// ---------------------------------------------------------------------------
// Single area re-read (OCR)
// ---------------------------------------------------------------------------

export async function rereadItem(itemId: string): Promise<{ sourceText: string, ocrConfidence: number | null, version: number, sourceVersion: number }> {
  const token = await studioAccessToken()
  if (!token) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  const response = await withServiceTimeout(
    (signal) => fetch('/api/ceviri/reread', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
      signal,
    }),
    { label: txa('Alan okuma'), timeoutMs: 90_000 },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(payload)
    throw new Error(parsed.success ? parsed.data.error : txa('Alan okunamadı.'))
  }
  const parsed = z.object({
    source_text: z.string(), ocr_confidence: z.number().nullable(), version: z.number(), source_version: z.number(),
  }).parse(payload)
  return { sourceText: parsed.source_text, ocrConfidence: parsed.ocr_confidence, version: parsed.version, sourceVersion: parsed.source_version }
}

// ---------------------------------------------------------------------------
// Sayfa surum gecmisi
// ---------------------------------------------------------------------------

export interface TlPageVersion { id: string, kind: 'manual' | 'auto', label: string, itemCount: number, createdAt: string, createdBy: string | null }

export async function listPageVersions(pageId: string, signal?: AbortSignal): Promise<TlPageVersion[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_page_versions', { p_page_id: pageId }), requestSignal),
    { label: txa('Sayfa sürümleri'), signal },
  )
  if (error) throw error
  return z.array(z.object({
    id: z.string(), kind: z.enum(['manual', 'auto']), label: z.string(), item_count: z.number(), created_at: z.string(), created_by: z.string().nullable(),
  })).parse(data ?? []).map((row) => ({ id: row.id, kind: row.kind, label: row.label, itemCount: row.item_count, createdAt: row.created_at, createdBy: row.created_by }))
}

/** The page's current DB state is saved as a version (pending writes must be flushed first). */
export async function savePageVersion(pageId: string, label: string): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('tl_page_version_save', { p_page_id: pageId, p_label: label }), signal),
    { label: txa('Sürüm kaydı') },
  )
  if (error) throw error
}

/** Items in a version are converted to the editor's item format (restored as a snapshot). */
export async function getPageVersion(versionId: string, language: string): Promise<{ items: TlItem[], strokes: TlStroke[] }> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('tl_page_version_get', { p_version_id: versionId }), signal),
    { label: txa('Sürüm') },
  )
  if (error) throw error
  const parsed = z.object({ items: z.array(itemRowSchema), strokes: z.array(z.unknown()) }).parse(data)
  return { items: parsed.items.map((row) => toItem(row, language)), strokes: parsed.strokes as TlStroke[] }
}

export async function deletePageVersion(versionId: string): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('tl_page_version_delete', { p_version_id: versionId }), signal),
    { label: txa('Sürüm silme') },
  )
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Ekip stil kutuphanesi
// ---------------------------------------------------------------------------

export interface TlStylePreset { id: string, name: string, style: TlStyle }

const presetRowSchema = z.object({ id: z.string(), name: z.string(), style: z.record(z.string(), z.unknown()) })

export async function listStylePresets(fansubId: string, signal?: AbortSignal): Promise<TlStylePreset[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_style_presets')
      .select('id,name,style').eq('fansub_id', fansubId).order('name').limit(100), requestSignal),
    { label: txa('Stil kütüphanesi'), signal },
  )
  if (error) return []
  return z.array(presetRowSchema).parse(data ?? []).map((row) => ({ id: row.id, name: row.name, style: row.style as TlStyle }))
}

/** A style with the same name is overwritten (the team style is updated). */
export async function saveStylePreset(fansubId: string, name: string, style: TlStyle): Promise<TlStylePreset> {
  const clean = name.trim().slice(0, 40)
  if (!clean) throw new Error(txa('Stil adı boş olamaz.'))
  const body = styleForDb(style)
  const inserted = await supabase.from('translation_style_presets')
    .insert({ fansub_id: fansubId, name: clean, style: body }).select('id,name,style').single()
  let row = inserted.data
  if (inserted.error?.code === '23505') {
    const updated = await supabase.from('translation_style_presets')
      .update({ style: body }).eq('fansub_id', fansubId).eq('name', clean).select('id,name,style').single()
    if (updated.error) throw new Error(txa('Stil kaydedilemedi.'))
    row = updated.data
  } else if (inserted.error) {
    throw new Error(inserted.error.code === 'PT422' ? txa('Stil kütüphanesi dolu (en fazla 100).') : txa('Stil kaydedilemedi.'))
  }
  const parsed = presetRowSchema.parse(row)
  return { id: parsed.id, name: parsed.name, style: parsed.style as TlStyle }
}

export async function deleteStylePreset(presetId: string): Promise<void> {
  const { error } = await supabase.from('translation_style_presets').delete().eq('id', presetId)
  if (error) throw new Error(txa('Stil silinemedi.'))
}

// ---------------------------------------------------------------------------
// Ekibe ozel fontlar
// ---------------------------------------------------------------------------

export interface TlCustomFont { id: string, name: string }

export async function listCustomFonts(fansubId: string, signal?: AbortSignal): Promise<TlCustomFont[]> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('translation_fonts')
      .select('id,name').eq('fansub_id', fansubId).order('created_at', { ascending: false }).limit(50), requestSignal),
    { label: txa('Ekip fontları'), signal },
  )
  if (error) return []
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }))
}

export async function uploadCustomFont(fansubId: string, file: File): Promise<TlCustomFont> {
  const token = await studioAccessToken().catch(() => null)
  if (!token) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  const form = new FormData()
  form.set('fansub_id', fansubId)
  form.set('file', file, file.name)
  const response = await withServiceTimeout(
    (signal) => fetch('/api/ceviri/font', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal }),
    { label: txa('Font yükleme'), timeoutMs: 60_000 },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(payload)
    throw new Error(parsed.success ? parsed.data.error : txa('Font yüklenemedi.'))
  }
  const parsed = z.object({ id: z.string().uuid(), name: z.string() }).parse(payload)
  return { id: parsed.id, name: parsed.name }
}
