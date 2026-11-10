import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { studioAccessToken } from '@/services/studioAuth'
import { supabase } from '@/services/supabase'
import { READER_LANGUAGES } from '@/services/translationReaderService'
import { StudioBusyError, StudioCodedError } from '@/services/translationStudioService'
import { txa } from '@/i18n/activeLocale'

/**
 * Admin chapter review (site admin only): raw and translated pages of a studio-uploaded chapter,
 * page texts and reader language generation. Permission is on the server:
 * admin_chapter_studio_review / tl_admin_page_object_key / tl_admin_translation_source
 * require app_private.is_admin().
 */

const uuid = z.string().uuid()

const reviewSchema = z.object({
  chapter: z.object({
    id: uuid,
    chapter_number: z.coerce.number(),
    title: z.string().nullable(),
    pages: z.array(z.unknown()),
    is_approved: z.boolean(),
  }),
  project: z.object({
    id: uuid,
    stage: z.string(),
    source_language: z.string(),
    fansub_id: uuid,
    is_mature: z.boolean(),
    updated_at: z.string(),
  }).nullable(),
  pages: z.array(z.object({
    id: uuid,
    index: z.coerce.number(),
    file_name: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    raw_ready: z.boolean(),
    clean_ready: z.boolean(),
  })),
  languages: z.array(z.string()),
  items: z.array(z.object({
    id: uuid,
    page_id: uuid,
    reading_order: z.coerce.number(),
    type: z.string(),
    source_text: z.string(),
    texts: z.record(z.string(), z.object({ text: z.string(), status: z.string(), origin: z.string() })),
  })),
})

export type AdminChapterReview = z.infer<typeof reviewSchema>
export type AdminChapterReviewItem = AdminChapterReview['items'][number]

export const ADMIN_TRANSLATION_LANGUAGES = READER_LANGUAGES.filter((entry) => entry.code !== 'tr')

export const TL_ITEM_TYPE_LABEL: Record<string, string> = {
  get balon() { return txa('Balon') }, get anlatim() { return txa('Anlatım') }, sfx: 'SFX', get tabela() { return txa('Tabela') },
}

export async function getAdminChapterReview(chapterId: string, signal?: AbortSignal): Promise<AdminChapterReview> {
  uuid.parse(chapterId)
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('admin_chapter_studio_review', { p_chapter_id: chapterId }), requestSignal),
    { label: txa('Bölüm incelemesi'), signal },
  )
  if (error?.code === '42501') throw new Error(txa('Bölüm incelemesi yalnız site yöneticisine açık.'))
  if (error) throw new Error(txa('Bölüm incelemesi okunamadı.'))
  const parsed = reviewSchema.safeParse(data)
  if (!parsed.success) throw new Error(txa('Bölüm incelemesi okunamadı.'))
  return parsed.data
}

async function token() {
  const value = await studioAccessToken()
  if (!value) throw new Error(txa('Oturumun sona ermiş. Yeniden giriş yap.'))
  return value
}

/** Raw (or clean base) page in private R2: site admin only, permission on the server. */
export async function fetchAdminPageImage(pageId: string, kind: 'raw' | 'clean', signal?: AbortSignal): Promise<Blob> {
  uuid.parse(pageId)
  const response = await fetch(`/api/ceviri/admin-page?page_id=${encodeURIComponent(pageId)}&kind=${kind}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal,
  })
  if (!response.ok) throw new Error(response.status === 403 ? txa('Ham sayfa yalnız site yöneticisine açık.') : txa('Ham sayfa yüklenemedi.'))
  return response.blob()
}

/**
 * Reader language generation (reader-translate, scope=admin). Error codes are shown with studioErrors
 * (ai_disabled_mature, provider_busy, quota_exhausted ...).
 */
export async function requestAdminReaderTranslation(chapterId: string, language: string, signal?: AbortSignal): Promise<{ translated: number, remaining: number }> {
  uuid.parse(chapterId)
  const response = await withServiceTimeout(
    async (requestSignal) => fetch('/api/ceviri/reader-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ chapter_id: chapterId, language, scope: 'admin' }),
      signal: requestSignal,
    }),
    { label: txa('Okuyucu çevirisi'), timeoutMs: 120_000, signal },
  )
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), code: z.string().optional() }).safeParse(payload)
    const message = parsed.success ? parsed.data.error : txa('Çeviri başarısız ({v1}).', { v1: response.status })
    if (response.status === 429 && parsed.success && parsed.data.code === 'provider_busy') {
      const seconds = Number(response.headers.get('retry-after'))
      throw new StudioBusyError(message, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 20_000)
    }
    if (parsed.success && parsed.data.code) throw new StudioCodedError(message, parsed.data.code)
    throw new Error(message)
  }
  return z.object({ translated: z.number(), remaining: z.number() }).parse(payload)
}
