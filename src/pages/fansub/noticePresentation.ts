import {
  getFansubNoticeActionTargetOption,
  resolveFansubNoticeActionLabel,
  resolveFansubNoticeActionTargetHref,
} from '@/lib/fansubNotices'
import type { FansubPinnedNotice } from '@/services/fansubNoticeService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type PresentedFansubNotice = {
  id: string
  title: string
  body: string
  href: string
  actionLabel: string
  targetLabel: string
  dateLabel: string
  updatedAt: string
}

export function normalizeNoticeText(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, ' ').trim() || ''
  return normalized || fallback
}

export function formatFansubNoticeRelativeDate(dateStr: string): string {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return txa('Az önce')
  if (diffMins < 60) return `${diffMins} dk`
  if (diffHours < 24) return `${diffHours} sa`
  if (diffDays < 7) return txa('{v1} gun', { v1: diffDays })

  return date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

function resolveNoticeSortTimestamp(notice: FansubPinnedNotice) {
  const updatedAtMs = new Date(notice.updatedAt || '').getTime()
  if (Number.isFinite(updatedAtMs)) return updatedAtMs

  const createdAtMs = new Date(notice.createdAt || '').getTime()
  if (Number.isFinite(createdAtMs)) return createdAtMs

  return 0
}

export function sortFansubNotices(notices: FansubPinnedNotice[]) {
  // Product logic: the public featured area works by "recency", not "pin".
  // So updatedAt is used first; an edited notice becomes the current face again.
  // For never-updated records the createdAt fallback applies.
  // If a real pin field is added, pin-first sorting should extend only inside this helper.
  return [...notices].sort((left, right) => {
    return resolveNoticeSortTimestamp(right) - resolveNoticeSortTimestamp(left)
  })
}

export function presentFansubNotice(
  notice: FansubPinnedNotice,
  fansub: { id?: string | null; slug?: string | null },
): PresentedFansubNotice {
  const targetOption = getFansubNoticeActionTargetOption(notice.actionTarget)

  return {
    id: notice.id,
    title: normalizeNoticeText(notice.title, txa('Duyuru')),
    body: normalizeNoticeText(notice.body, txa('Bu duyuru için açıklama bulunmuyor.')),
    href: resolveFansubNoticeActionTargetHref(fansub, notice.actionTarget, notice.actionUrl),
    actionLabel: resolveFansubNoticeActionLabel(notice.actionTarget, notice.actionLabel),
    targetLabel: targetOption.label,
    dateLabel: formatFansubNoticeRelativeDate(notice.updatedAt || notice.createdAt),
    updatedAt: notice.updatedAt || notice.createdAt,
  }
}
