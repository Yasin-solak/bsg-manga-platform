import { intlLocale, txa } from '@/i18n/activeLocale'
export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function formatNumberTr(value: number) {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(Math.max(0, value))
}

export function formatMetricValue(
  value: number,
  format: 'integer' | 'percent' | 'score',
) {
  if (format === 'score') return `${Math.round(clampPercent(value))}/100`
  if (format === 'percent') return txa('%{v1}', { v1: Math.round(clampPercent(value)) })
  return formatNumberTr(value)
}

export function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return txa('Veri yok')
  return txa('%{v1}', { v1: Math.round(clampPercent(value)) })
}

export function formatDateTimeTr(value?: string | null) {
  if (!value) return txa('Henüz güncellenmedi')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return txa('Henüz güncellenmedi')
  return new Intl.DateTimeFormat(intlLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatRelativeAge(value?: string | null) {
  if (!value) return txa('Zaman bilgisi yok')
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return txa('Zaman bilgisi yok')
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (diffMinutes < 1) return txa('Şimdi')
  if (diffMinutes < 60) return txa('{v1} dk önce', { v1: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return txa('{v1} sa önce', { v1: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return txa('{v1} gün önce', { v1: diffDays })
  return txa('{v1} ay önce', { v1: Math.floor(diffDays / 30) })
}

export function formatDurationMinutes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return txa('Ölçülmüyor')
  const minutes = Math.max(0, Math.round(value))
  if (minutes < 60) return txa('{v1} dk', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours < 24) return remainder > 0 ? txa('{v1} sa {v2} dk', { v1: hours, v2: remainder }) : txa('{v1} sa', { v1: hours })
  return txa('{v1} gün', { v1: Math.floor(hours / 24) })
}
