import { z } from 'zod'
import { studioAccessToken } from '@/services/studioAuth'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'

/*
 * Reader languages (Translation Studio V3). Turkish is inside the chapter images;
 * picking another language shows the clean base + that language's text layer. Missing
 * texts are generated once with /api/ceviri/reader-translate and stay the same for everyone.
 */

export const READER_LANGUAGES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'id', label: 'Indonesia' },
] as const

export type ReaderLanguage = typeof READER_LANGUAGES[number]['code']

const itemSchema = z.object({
  id: z.string().uuid(),
  page_index: z.number().int(),
  type: z.enum(['balon', 'anlatim', 'sfx', 'tabela']),
  shape: z.enum(['elips', 'kutu', 'yok']),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  rotation: z.coerce.number(),
  style: z.record(z.string(), z.unknown()).nullable(),
  font_suggestion: z.object({ font: z.string(), size: z.number(), reason: z.string().optional() }).nullable(),
  text: z.string().nullable(),
  fallback_text: z.string().nullable(),
})

const overlaySchema = z.object({
  project_id: z.string().uuid(),
  language: z.string(),
  pages: z.array(z.object({ index: z.number().int(), width: z.number().int(), height: z.number().int() })),
  items: z.array(itemSchema),
  missing_count: z.coerce.number(),
})

export type ReaderOverlay = z.infer<typeof overlaySchema>
export type ReaderOverlayItem = z.infer<typeof itemSchema>

export async function getReaderOverlay(chapterId: string, language: string, signal?: AbortSignal): Promise<ReaderOverlay | null> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('tl_reader_overlay', { p_chapter_id: chapterId, p_language: language }), requestSignal),
    { label: 'Okuyucu dili', signal },
  )
  if (error) throw new Error('Çeviri katmanı okunamadı.')
  if (!data) return null
  const parsed = overlaySchema.safeParse(data)
  if (!parsed.success) throw new Error('Çeviri katmanı okunamadı.')
  return parsed.data
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await studioAccessToken().catch(() => null)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function requestReaderTranslation(chapterId: string, language: string, signal?: AbortSignal): Promise<{ translated: number, remaining: number }> {
  const response = await withServiceTimeout(
    async (requestSignal) => fetch('/api/ceviri/reader-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ chapter_id: chapterId, language }),
      signal: requestSignal,
    }),
    { label: 'Okuyucu çevirisi', timeoutMs: 120_000, signal },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(payload)
    throw Object.assign(new Error(parsed.success ? parsed.data.error : 'Çeviri hazırlanamadı.'), { status: response.status })
  }
  return z.object({ translated: z.number(), remaining: z.number() }).parse(payload)
}

export async function fetchReaderCleanPage(chapterId: string, index: number, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`/api/ceviri/reader-page?chapter_id=${encodeURIComponent(chapterId)}&index=${index}`, {
    headers: await authHeader(),
    signal,
  })
  if (!response.ok) throw new Error('Sayfa yüklenemedi.')
  return response.blob()
}
