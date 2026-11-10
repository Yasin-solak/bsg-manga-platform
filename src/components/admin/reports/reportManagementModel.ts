import type {
  Report,
  ReportStatus,
  ReportTargetType,
} from '@/services/reportService'
import type { DashboardChartSeries } from '@/components/admin/dashboard/dashboardTypes'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type ReportRiskLevel = 'high' | 'medium' | 'low'
export type ReportTargetGroup = 'manga' | 'lists' | 'users'
export type ReportDateRange = 'all' | 'today' | '7d' | '30d'
export type ReportSort = 'newest' | 'oldest' | 'risk'

export interface ReportFiltersState {
  search: string
  targetType: 'all' | ReportTargetType
  status: 'all' | ReportStatus
  targetGroup: 'all' | ReportTargetGroup
  risk: 'all' | ReportRiskLevel
  dateRange: ReportDateRange
  sort: ReportSort
}

export interface ReportRisk {
  level: ReportRiskLevel
  score: number
}

export interface ReportManagementStats {
  total: number
  pending: number
  resolved: number
  dismissed: number
  highRisk: number
}

const HIGH_RISK_TERMS = [
  'tehdit',
  'taciz',
  'nefret',
  'hakaret',
  'küfür',
  'kufur',
  'kişisel bilgi',
  'kisisel bilgi',
  'dolandırıcılık',
  'dolandiricilik',
]

const MEDIUM_RISK_TERMS = [
  'spam',
  'reklam',
  'yanıltıcı',
  'yaniltici',
  'uygunsuz',
  'telif',
]

export const DEFAULT_REPORT_FILTERS: ReportFiltersState = {
  search: '',
  targetType: 'all',
  status: 'pending',
  targetGroup: 'all',
  risk: 'all',
  dateRange: 'all',
  sort: 'newest',
}

function normalizeText(value: string | null | undefined) {
  return (value || '').toLocaleLowerCase('tr-TR')
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term))
}

export function getReportRisk(report: Report): ReportRisk {
  const text = normalizeText(`${report.reason} ${report.description || ''}`)
  let score = 18

  if (includesAny(text, HIGH_RISK_TERMS)) score += 58
  else if (includesAny(text, MEDIUM_RISK_TERMS)) score += 30

  if (report.target_type === 'user') score += 16
  if (report.target_type === 'manga_comment') score += 7
  if (report.status === 'pending') score += 6

  const boundedScore = Math.max(1, Math.min(100, score))
  if (boundedScore >= 65) return { level: 'high', score: boundedScore }
  if (boundedScore >= 38) return { level: 'medium', score: boundedScore }
  return { level: 'low', score: boundedScore }
}

export function getReportTargetGroup(targetType: ReportTargetType): ReportTargetGroup {
  if (targetType === 'manga' || targetType === 'chapter' || targetType === 'manga_comment') return 'manga'
  if (targetType === 'manga_list_comment') return 'lists'
  return 'users'
}

export function reportStatusLabel(status: ReportStatus) {
  if (status === 'resolved') return txa('Çözüldü')
  if (status === 'dismissed') return txa('Yoksayıldı')
  return txa('Beklemede')
}

export function reportTargetLabel(targetType: ReportTargetType) {
  if (targetType === 'manga_comment') return txa('Manga yorumu')
  if (targetType === 'manga_list_comment') return txa('Liste yorumu')
  if (targetType === 'manga') return txa('Manga')
  if (targetType === 'chapter') return txa('Manga bölümü')
  return txa('Kullanıcı')
}

export function reportRiskLabel(level: ReportRiskLevel) {
  if (level === 'high') return txa('Yüksek')
  if (level === 'medium') return txa('Orta')
  return txa('Düşük')
}

export function formatReportRelativeAge(value?: string | null) {
  if (!value) return '—'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return txa('Şimdi')
  if (minutes < 60) return txa('{v1} dk önce', { v1: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return txa('{v1} sa önce', { v1: hours })
  const days = Math.floor(hours / 24)
  return txa('{v1} gün önce', { v1: days })
}

export function formatReportDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(intlLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function matchesDateRange(report: Report, range: ReportDateRange) {
  if (range === 'all') return true
  const createdAt = new Date(report.created_at).getTime()
  if (!Number.isFinite(createdAt)) return false
  const elapsed = Date.now() - createdAt
  if (range === 'today') return elapsed <= 86_400_000
  if (range === '7d') return elapsed <= 7 * 86_400_000
  return elapsed <= 30 * 86_400_000
}

export function filterAndSortReports(reports: Report[], filters: ReportFiltersState) {
  const search = normalizeText(filters.search.trim())
  return [...reports]
    .filter((report) => {
      if (filters.status !== 'all' && report.status !== filters.status) return false
      if (filters.targetType !== 'all' && report.target_type !== filters.targetType) return false
      if (filters.targetGroup !== 'all' && getReportTargetGroup(report.target_type) !== filters.targetGroup) return false
      if (filters.risk !== 'all' && getReportRisk(report).level !== filters.risk) return false
      if (!matchesDateRange(report, filters.dateRange)) return false
      if (!search) return true

      return normalizeText([
        report.reason,
        report.description,
        report.reporter?.username,
        report.target_id,
        report.id,
      ].filter(Boolean).join(' ')).includes(search)
    })
    .sort((left, right) => {
      if (filters.sort === 'risk') {
        const scoreDiff = getReportRisk(right).score - getReportRisk(left).score
        if (scoreDiff !== 0) return scoreDiff
      }
      const leftTime = new Date(left.created_at).getTime() || 0
      const rightTime = new Date(right.created_at).getTime() || 0
      return filters.sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime
    })
}

export function getReportManagementStats(reports: Report[]): ReportManagementStats {
  return reports.reduce<ReportManagementStats>((stats, report) => {
    stats.total += 1
    if (report.status === 'resolved') stats.resolved += 1
    else if (report.status === 'dismissed') stats.dismissed += 1
    else stats.pending += 1
    if (getReportRisk(report).level === 'high') stats.highRisk += 1
    return stats
  }, {
    total: 0,
    pending: 0,
    resolved: 0,
    dismissed: 0,
    highRisk: 0,
  })
}

export function buildStatusSparkline(reports: Report[], status?: ReportStatus, risk?: ReportRiskLevel) {
  const buckets = Array.from({ length: 7 }, () => 0)
  reports.forEach((report) => {
    if (status && report.status !== status) return
    if (risk && getReportRisk(report).level !== risk) return
    const elapsedDays = Math.floor((Date.now() - new Date(report.created_at).getTime()) / 86_400_000)
    if (elapsedDays < 0 || elapsedDays > 6) return
    buckets[6 - elapsedDays] += 1
  })
  return buckets
}

export function buildReportTrendSeries(reports: Report[]): DashboardChartSeries[] {
  const dateFormatter = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' })
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    return date
  })

  const incoming = days.map((date) => ({
    at: date.toISOString(),
    label: dateFormatter.format(date),
    value: reports.filter((report) => {
      const created = new Date(report.created_at)
      return created.getFullYear() === date.getFullYear()
        && created.getMonth() === date.getMonth()
        && created.getDate() === date.getDate()
    }).length,
  }))

  const closed = days.map((date) => ({
    at: date.toISOString(),
    label: dateFormatter.format(date),
    value: reports.filter((report) => {
      if (!report.resolved_at) return false
      const resolved = new Date(report.resolved_at)
      return resolved.getFullYear() === date.getFullYear()
        && resolved.getMonth() === date.getMonth()
        && resolved.getDate() === date.getDate()
    }).length,
  }))

  return [
    { id: 'incoming', label: txa('Gelen'), tone: 'primary', points: incoming },
    { id: 'closed', label: txa('Çözülen'), tone: 'muted', points: closed },
  ]
}
