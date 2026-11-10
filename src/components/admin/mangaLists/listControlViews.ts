import type { AdminMangaListView } from '@/services/adminMangaListService'
import { txa } from '@/i18n/activeLocale'

/**
 * List management view presets.
 *
 * Same role as in user and manga management: not page tabs but
 * presets applied to the SERVER QUERY.
 *
 * The queues were chosen by measurement: in live data 7 of 23 lists are empty and
 * 7 have no cover. An empty public list is a dead end for visitors,
 * but it was not visible in the old panel.
 */
export interface ListControlViewOption {
  id: AdminMangaListView
  label: string
  description: string
}

export const LIST_CONTROL_VIEW_OPTIONS: ListControlViewOption[] = [
  {
    id: 'all',
    get label() { return txa('Tümü') },
    get description() { return txa('Tüm kullanıcı listelerini göster.') },
  },
  {
    id: 'empty',
    get label() { return txa('Boş Liste') },
    get description() { return txa('Hiç mangası olmayan listeler — ziyaretçi için çıkmaz sokak.') },
  },
  {
    id: 'without-cover',
    get label() { return txa('Kapaksız') },
    get description() { return txa('Kapak seçilmemiş listeler — kart yüzeyi eksik görünür.') },
  },
  {
    id: 'private',
    get label() { return txa('Özel') },
    get description() { return txa('Sahibi dışında kimsenin göremediği listeler.') },
  },
  {
    id: 'moderation',
    get label() { return txa('Moderasyon') },
    get description() { return txa('En az bir yorumu gizlenmiş listeler.') },
  },
]

export const DEFAULT_LIST_CONTROL_VIEW: AdminMangaListView = 'all'

export function listControlViewOption(view: AdminMangaListView) {
  return LIST_CONTROL_VIEW_OPTIONS.find((option) => option.id === view) ?? LIST_CONTROL_VIEW_OPTIONS[0]
}
