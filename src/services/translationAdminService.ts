import { z } from 'zod'
import { supabase } from '@/services/supabase'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { txa } from '@/i18n/activeLocale'

/*
 * Translation Studio admin panel: AI usage, cost, daily page limits
 * and content review (see admin_translation_studio_overview).
 */

const num = z.coerce.number()

const overviewSchema = z.object({
  days: num,
  defaultLimit: num,
  totals: z.object({
    costUsd: num, inputTokens: num, outputTokens: num, jobs: num, failed: num, blocked: num,
    pages: num, todayPages: num, activeFansubs: num, projects: num, published: num, pendingDrafts: num,
  }),
  daily: z.array(z.object({ day: z.string(), pages: num, costUsd: num })),
  stages: z.record(num),
  errors: z.record(num),
  models: z.array(z.object({ task: z.string(), provider: z.string(), model: z.string(), jobs: num, costUsd: num })),
  fansubs: z.array(z.object({
    id: z.string().uuid(), name: z.string(), dailyLimit: num, customLimit: z.boolean(), todayPages: num,
    periodPages: num, costUsd: num, jobs: num, failed: num, blocked: num, projects: num, published: num,
    lastActivity: z.string().nullable(),
  })),
  flags: z.array(z.object({
    projectId: z.string().uuid(), fansubId: z.string().uuid(), fansubName: z.string().nullable(), title: z.string(),
    chapter: num, blocked: num, pages: num, lastAt: z.string(),
  })),
})

export type TranslationStudioOverview = z.infer<typeof overviewSchema>
export type TranslationStudioFansubRow = TranslationStudioOverview['fansubs'][number]
export type TranslationStudioFlag = TranslationStudioOverview['flags'][number]

export async function getTranslationStudioOverview(days: number, signal?: AbortSignal): Promise<TranslationStudioOverview> {
  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.rpc('admin_translation_studio_overview', { p_days: days }), requestSignal),
    { label: txa('Çeviri Stüdyosu özeti'), signal },
  )
  if (error) throw new Error(txa('Çeviri Stüdyosu özeti okunamadı.'))
  const parsed = overviewSchema.safeParse(data)
  if (!parsed.success) throw new Error(txa('Çeviri Stüdyosu özeti beklenmeyen biçimde geldi.'))
  return parsed.data
}

/** Fansub daily page limit; null = back to default, 0 = AI off. */
export async function setFansubDailyLimit(fansubId: string, limit: number | null): Promise<void> {
  const { error } = await supabase.rpc('tl_set_fansub_daily_limit', { p_fansub_id: fansubId, p_limit: limit })
  if (error) throw new Error(txa('Limit kaydedilemedi.'))
}

export async function setDefaultDailyLimit(limit: number): Promise<void> {
  const { error } = await supabase.rpc('admin_set_translation_default_limit', { p_limit: limit })
  if (error) throw new Error(txa('Varsayılan limit kaydedilemedi.'))
}

/** Content review: 'mature' makes the series 18+ (AI turns off), 'ok' dismisses the warning. */
export async function reviewTranslationContent(projectId: string, decision: 'mature' | 'ok'): Promise<void> {
  const { error } = await supabase.rpc('admin_review_translation_content', { p_project_id: projectId, p_decision: decision })
  if (error) throw new Error(txa('Karar kaydedilemedi.'))
}

/** Hata kodlarinin okunur karsiliklari (functions/_shared/translation-ai.js). */
export const TRANSLATION_ERROR_LABELS: Record<string, string> = {
  get content_blocked() { return txa('İçerik politikası engeli') },
  get provider_busy() { return txa('Servis yoğun (dakikalık sınır)') },
  get quota_exhausted() { return txa('Kota / bakiye bitti') },
  get provider_auth() { return txa('Anahtar geçersiz') },
  get not_configured() { return txa('Yapılandırılmamış') },
  get timeout() { return txa('Zaman aşımı') },
  get network() { return txa('Bağlantı hatası') },
  get truncated() { return txa('Yanıt yarıda kesildi') },
  get invalid_response() { return txa('Geçersiz yanıt') },
  get empty() { return txa('Boş yanıt') },
  get provider_error() { return txa('Servis hatası') },
  get processing_failed() { return txa('İşlem başarısız') },
}

export const TRANSLATION_TASK_LABELS: Record<string, string> = {
  get detect() { return txa('Tarama (alan + metin)') },
  get ocr() { return txa('Yeniden okuma') },
  get translate_draft() { return txa('Çeviri önerisi') },
  get translate_reader() { return txa('Okuyucu dilleri') },
}

export const TRANSLATION_STAGE_LABELS: Record<string, string> = {
  get upload() { return txa('Yükleme') }, get scan() { return txa('Tarama') }, get edit() { return txa('Düzenleme') }, get publish() { return txa('Yayına hazır') }, get scheduled() { return txa('Zamanlandı') }, get published() { return txa('Yayında') }, get archived() { return txa('Arşiv') },
}
