import type {
  AdminMangaListCommentRow,
  AdminMangaListSort,
  AdminMangaListVisibilityFilter,
} from '@/services/adminMangaListService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const PAGE_LIMIT = 15

export const VISIBILITY_FILTERS: Array<[AdminMangaListVisibilityFilter, string]> = [
  ['all', 'Tüm görünürlük'],
  ['public', 'Herkese açık'],
  ['private', 'Özel'],
]

export const SORT_OPTIONS: Array<[AdminMangaListSort, string]> = [
  ['newest', 'En yeni'],
  ['updated', 'Son güncellenen'],
  ['top_rated', 'En yüksek puan'],
  ['most_commented', 'En çok yorum'],
]

export type CommentVisibilityFilter = 'all' | 'active' | 'inactive'

export function toErrorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return txa(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return txa(message)
  }
  return fallback
}

function toTimestamp(value?: string) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** "9 Tem 2026" */
export function formatListDate(value?: string) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "today", "3 days ago", "2 months ago" */
export function listRelativeAge(value?: string, now = Date.now()) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  const days = Math.floor((now - ts) / 86_400_000)
  if (days <= 0) return txa('bugün')
  if (days === 1) return txa('dün')
  if (days < 30) return txa('{v1} gün önce', { v1: days })
  if (days < 365) return txa('{v1} ay önce', { v1: Math.floor(days / 30) })
  return txa('{v1} yıl önce', { v1: Math.floor(days / 365) })
}

/** A comment itself + its whole reply chain (removal / restore work together). */
export function collectCascadeCommentIds(comments: AdminMangaListCommentRow[], rootId: string) {
  const ids = new Set<string>([rootId])
  let changed = true

  while (changed) {
    changed = false
    comments.forEach((comment) => {
      if (!comment.parentId) return
      if (!ids.has(comment.parentId) || ids.has(comment.id)) return
      ids.add(comment.id)
      changed = true
    })
  }

  return ids
}
