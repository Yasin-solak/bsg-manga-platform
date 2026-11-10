import type { AdminMangaControlView } from '@/services/adminService'
import { txa } from '@/i18n/activeLocale'

/**
 * Manga control view presets.
 *
 * Same role as `usersSectionViews` in user management: not page tabs but
 * presets applied to the SERVER QUERY. Not extra filters either:
 * shortcuts to the admin's real work queues.
 *
 * There is DELIBERATELY no `without-fansub` view. Manga is a shared catalog with
 * no ownership: any fansub can translate and upload a manga's chapters,
 * and the permission key is `chapters.fansub_id`. A "manga without a fansub" is not a
 * gap; showing it as a queue would point the admin at the wrong work.
 *
 * Instead the admin's real job: reviewing whether an uploaded chapter meets the criteria
 * ("Chapter Review").
 */
export interface MangaControlViewOption {
  id: AdminMangaControlView
  label: string
  description: string
}

export const MANGA_CONTROL_VIEW_OPTIONS: MangaControlViewOption[] = [
  {
    id: 'all',
    get label() { return txa('Tümü') },
    get description() { return txa('Katalogdaki tüm serileri göster.') },
  },
  {
    id: 'pending',
    get label() { return txa('Seri Onayı') },
    get description() { return txa('Henüz onaylanmamış serileri göster.') },
  },
  {
    id: 'without-chapters',
    get label() { return txa('Bölümsüz') },
    get description() { return txa('Hiç bölümü olmayan seriler — okuyucu için çıkmaz sokak.') },
  },
  {
    id: 'pending-chapters',
    get label() { return txa('Bölüm İncelemesi') },
    get description() { return txa('En az bir bölümü onay bekleyen seriler — kriter incelemesi gerekiyor.') },
  },
  {
    id: 'incomplete-meta',
    get label() { return txa('Eksik Künye') },
    get description() { return txa('Kapak, tür veya açıklaması eksik seriler.') },
  },
  {
    id: 'inactive',
    get label() { return txa('Pasif') },
    get description() { return txa('Yayından kaldırılmış serileri göster.') },
  },
]

export const DEFAULT_MANGA_CONTROL_VIEW: AdminMangaControlView = 'all'

export function mangaControlViewOption(view: AdminMangaControlView) {
  return MANGA_CONTROL_VIEW_OPTIONS.find((option) => option.id === view) ?? MANGA_CONTROL_VIEW_OPTIONS[0]
}
