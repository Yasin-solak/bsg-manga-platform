import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'

/** Admin-written public texts and their English equivalents. */
const rowSchema = z.object({
  source_table: z.string(),
  field: z.string(),
  source_text: z.string(),
  en_text: z.string().nullable(),
  updated_at: z.string().nullable(),
})

export type AdminI18nTextRow = z.infer<typeof rowSchema>

export async function listAdminI18nTexts(): Promise<AdminI18nTextRow[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_i18n_source_texts'), signal),
    { label: 'adminI18nTextService.list' },
  )
  if (error) throw new Error('Metinler yüklenemedi.')
  return z.array(rowSchema).parse(data ?? [])
}

/** An empty text deletes the record; the reader falls back to the dictionary or Turkish text. */
export async function saveAdminI18nText(sourceText: string, enText: string): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_i18n_save_text', { p_source_text: sourceText, p_en_text: enText }), signal),
    { label: 'adminI18nTextService.save' },
  )
  if (error) throw new Error(error.message || 'Çeviri kaydedilemedi.')
}
