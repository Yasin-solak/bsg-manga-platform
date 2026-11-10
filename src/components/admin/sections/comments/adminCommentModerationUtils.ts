import type {
  AdminCommentModerationItem,
  AdminCommentModerationSource,
  AdminCommentModerationSourceFilter,
  AdminCommentSignal,
} from '@/services/adminCommentModerationService'
import {
  detectAdminCommentSignals,
  getAdminCommentBodyKind,
} from '@/services/adminCommentModerationService/shared'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const COMMENT_SOURCE_ORDER: AdminCommentModerationSourceFilter[] = ['all', 'chapter', 'manga', 'list']

export function commentSourceLabel(source: AdminCommentModerationSourceFilter) {
  if (source === 'all') return txa('Tümü')
  if (source === 'chapter') return txa('Bölüm')
  if (source === 'list') return txa('Liste')
  return txa('Manga')
}

export function commentRouteActionLabel(source: AdminCommentModerationSource) {
  if (source === 'chapter') return txa('Bölümü aç')
  if (source === 'list') return txa('Listeyi aç')
  return txa('Mangayı aç')
}

export function commentSignalLabel(signal: AdminCommentSignal) {
  if (signal === 'links') return txa('Bağlantı')
  if (signal === 'spoiler') return txa('Spoiler')
  if (signal === 'spam') return txa('Spam / reklam')
  return txa('Hakaret')
}

/** Ayrintidaki "Dikkat noktalari" cumlesi. */
export function commentSignalHint(signal: AdminCommentSignal, comment: Pick<AdminCommentModerationItem, 'isSpoiler'>) {
  if (signal === 'links') return txa('Bağlantı içeriyor; adresin güvenli olduğuna bak.')
  if (signal === 'spoiler') {
    return comment.isSpoiler
      ? txa('Yazar yorumu spoiler olarak işaretledi; sitede bulanık görünür.')
      : txa('Spoiler içerebilir ve işaretlenmemiş; okuyanlar için açık görünür.')
  }
  if (signal === 'spam') return txa('Reklam, çekiliş ya da kanal daveti kelimeleri geçiyor.')
  return txa('Hakaret ya da küfür içerebilir.')
}

/** Server signals (text only); otherwise calculated on the client with the same rules. */
export function commentSignals(comment: AdminCommentModerationItem): AdminCommentSignal[] {
  if (comment.signals) return comment.signals
  return detectAdminCommentSignals(comment).filter((signal): signal is AdminCommentSignal => signal !== 'all' && signal !== 'flagged')
}

export function commentBodyKind(comment: Pick<AdminCommentModerationItem, 'body'>) {
  return getAdminCommentBodyKind(comment.body)
}

export function commentBodyKindLabel(kind: ReturnType<typeof commentBodyKind>) {
  if (kind === 'empty') return txa('Boş')
  if (kind === 'expression') return txa('Yalnız ifade')
  if (kind === 'mixed') return txa('Metin + ifade')
  return txa('Metin')
}

export function adminCommentInitials(name: string) {
  return (name || 'K')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') || '')
    .join('')
}

function toTimestamp(value?: string) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** "9 Tem 2026 23:18" (saniyesiz, kisa ay). */
export function formatAdminCommentDateTime(value?: string) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  return new Date(ts).toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Edited? Updated more than a minute after creation. */
export function commentWasEdited(comment: Pick<AdminCommentModerationItem, 'createdAt' | 'updatedAt'>) {
  return toTimestamp(comment.updatedAt) - toTimestamp(comment.createdAt) > 60_000
}

/** List row age: relative in the last 30 days, a short date when older. */
export function commentRelativeAge(value?: string, now = Date.now()) {
  const ts = toTimestamp(value)
  if (!ts) return '—'
  const minutes = Math.max(0, Math.floor((now - ts) / 60_000))
  if (minutes < 60) return txa('{v1} dk', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa', { v1: hours })
  const days = Math.floor(hours / 24)
  if (days <= 30) return txa('{v1} gün', { v1: days })
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(intlLocale(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
