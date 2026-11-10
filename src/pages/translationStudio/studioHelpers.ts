import { cn } from '@/lib/utils'
import { intlLocale } from '@/i18n/activeLocale'

export const inputClass = cn(
  'box-border h-[42px] w-full rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3.5',
  'text-sm font-semibold text-[var(--tl-fg)] outline-none placeholder:text-[var(--tl-dim)] focus:border-[var(--tl-p35)]',
)

export function parseChapterNumber(value: string): number | null {
  const parsed = Number(value.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999) return null
  return Math.round(parsed * 100) / 100
}

export function formatShortDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
}
