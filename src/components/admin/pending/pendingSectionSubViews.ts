import type { PendingItemType } from './pendingSectionUtils'
import { txa } from '@/i18n/activeLocale'

export type AdminPendingSubView =
  | 'tum-talepler'
  | 'manga-revizyon'
  | 'bolum-revizyon'
  | 'fansub-talep'

export interface PendingSubViewOption {
  id: AdminPendingSubView
  label: string
  description: string
  typeFilter: 'all' | PendingItemType
}

export const PENDING_SUB_VIEW_OPTIONS: PendingSubViewOption[] = [
  {
    id: 'tum-talepler',
    get label() { return txa('Tüm Talepler') },
    get description() { return txa('Tüm onay kuyruğu tek listede öncelik sırasına göre gösterilir.') },
    typeFilter: 'all',
  },
  {
    id: 'manga-revizyon',
    get label() { return txa('Manga Revizyon') },
    get description() { return txa('Manga açma ve manga düzenleme talepleri ayrık panelde yönetilir.') },
    typeFilter: 'manga',
  },
  {
    id: 'bolum-revizyon',
    get label() { return txa('Bolum Revizyon') },
    get description() { return txa('Bolum talepleri, sayfa ve yayin tarihi kontrolleriyle birlikte listelenir.') },
    typeFilter: 'chapter',
  },
  {
    id: 'fansub-talep',
    get label() { return txa('Fansub Talep') },
    get description() { return txa('Fansub başvuruları ayrı panelde kritik öncelikle ele alınır.') },
    typeFilter: 'fansub_request',
  },
]

const PENDING_SUB_VIEW_SET = new Set<string>(PENDING_SUB_VIEW_OPTIONS.map((option) => option.id))

export const DEFAULT_PENDING_SUB_VIEW: AdminPendingSubView = 'tum-talepler'

export function pendingSubViewFromHash(hash: string): AdminPendingSubView {
  const normalized = hash.replace(/^#/, '').trim().toLocaleLowerCase('tr-TR')
  if (PENDING_SUB_VIEW_SET.has(normalized)) {
    return normalized as AdminPendingSubView
  }
  return DEFAULT_PENDING_SUB_VIEW
}

export function pendingSubViewByTypeFilter(
  typeFilter: 'all' | PendingItemType,
): AdminPendingSubView {
  return PENDING_SUB_VIEW_OPTIONS.find((option) => option.typeFilter === typeFilter)?.id
    ?? DEFAULT_PENDING_SUB_VIEW
}

export function pendingSubViewOption(view: AdminPendingSubView): PendingSubViewOption {
  return PENDING_SUB_VIEW_OPTIONS.find((option) => option.id === view)
    ?? PENDING_SUB_VIEW_OPTIONS[0]
}
