import type { DashboardStats } from '@/data/admin'
import type { AdminDashboardSnapshot } from '@/services/adminService'
import type { AdminAnnouncement } from '@/services/announcementService'
import type { LegalRequest } from '@/services/legalRequestService'
import type { Report } from '@/services/reportService'
import type { PendingItem } from '@components/admin/AdminPendingSection'
import type {
  DashboardActivityView,
  DashboardAnnouncementView,
  DashboardChartPoint,
  DashboardChartSeries,
  DashboardMetricId,
  DashboardMetricView,
  DashboardQualityView,
  DashboardQueueView,
  DashboardTargetSection,
  DashboardTone,
  DashboardViewModel,
} from './dashboardTypes'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface BuildFallbackDashboardParams {
  stats: DashboardStats
  pendingItems: PendingItem[]
  lastUpdatedAt?: string | null
  reportStats: {
    pending: number
    resolved: number
    dismissed: number
  }
  reports: Report[]
  isReportsEnabled: boolean
  legalRequests: LegalRequest[]
  announcements: AdminAnnouncement[]
}

const METRIC_CONFIG: Record<DashboardMetricId, {
  label: string
  helper: string
  target?: DashboardTargetSection
  chartTitle: string
  chartDescription: string
}> = {
  users: {
    get label() { return txa('Kullanıcı') },
    get helper() { return txa('Toplam kayıtlı kullanıcı') },
    target: 'users',
    get chartTitle() { return txa('Kullanıcı büyümesi') },
    get chartDescription() { return txa('Seçili dönemde oluşturulan kullanıcı hesapları.') },
  },
  mangas: {
    get label() { return txa('Manga') },
    get helper() { return txa('Yönetilen manga kütüphanesi') },
    target: 'mangas',
    get chartTitle() { return txa('Manga kütüphanesi akışı') },
    get chartDescription() { return txa('Seçili dönemde oluşturulan manga kayıtları.') },
  },
  community: {
    get label() { return txa('Topluluk') },
    get helper() { return txa('Sunuculardaki mesajlar') },
    target: 'community',
    get chartTitle() { return txa('Topluluk mesaj akışı') },
    get chartDescription() { return txa('Seçili dönemde sunucularda yazılan mesajlar.') },
  },
  fansubs: {
    get label() { return txa('Fansub') },
    get helper() { return txa('Kayıtlı fansub ekipleri') },
    target: 'fansubs',
    get chartTitle() { return txa('Fansub büyümesi') },
    get chartDescription() { return txa('Seçili dönemde oluşturulan fansub kayıtları.') },
  },
  backlog: {
    get label() { return txa('Bekleyen iş') },
    get helper() { return txa('Benzersiz açık operasyon işi') },
    target: 'pending',
    get chartTitle() { return txa('Moderasyon akışı') },
    get chartDescription() { return txa('Dönemde kuyruğa gelen ve hâlâ açık kalan işler.') },
  },
  'operation-health': {
    get label() { return txa('Operasyon sağlığı') },
    get helper() { return txa('Kalite metriklerinden türetilir') },
    target: 'operations',
    get chartTitle() { return txa('Operasyon sağlığı eğilimi') },
    get chartDescription() { return txa('Önceki dönem ile güncel kalite ortalamasının karşılaştırması.') },
  },
}

const METRIC_ORDER: DashboardMetricId[] = [
  'users',
  'mangas',
  'community',
  'fansubs',
  'backlog',
  'operation-health',
]

function safePercent(numerator: number, denominator: number) {
  if (denominator <= 0) return null
  return Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (available.length === 0) return null
  return available.reduce((sum, value) => sum + value, 0) / available.length
}

function qualityTone(value: number | null): DashboardTone {
  if (value == null) return 'muted'
  if (value >= 80) return 'stable'
  if (value >= 55) return 'attention'
  return 'critical'
}

function queuePriority(value: number | null): DashboardQueueView['priority'] {
  if (value == null || value <= 5) return 'normal'
  if (value <= 15) return 'medium'
  if (value <= 30) return 'high'
  return 'critical'
}

function timestamp(value?: string | null) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function oldestAgeMinutes(values: Array<string | null | undefined>, referenceAt?: string | null) {
  const valid = values.map(timestamp).filter((value) => value > 0)
  if (valid.length === 0) return null
  const reference = timestamp(referenceAt) || Date.now()
  return Math.max(0, Math.floor((reference - Math.min(...valid)) / 60_000))
}

function pendingCategory(item: PendingItem) {
  if (item.type === 'manga') return txa('Manga')
  if (item.type === 'chapter') return txa('Bölüm')
  return txa('Fansub')
}

function buildFallbackActivity(params: BuildFallbackDashboardParams): DashboardActivityView[] {
  const pendingRows: DashboardActivityView[] = params.pendingItems.map((item) => ({
    id: `pending:${item.type}:${item.id}`,
    category: pendingCategory(item),
    title: item.title,
    detail: item.description || txa('İnceleme bekleyen içerik'),
    createdAt: item.createdAt || null,
    actor: item.author,
    tone: 'warning',
    target: 'pending',
  }))

  const reportRows: DashboardActivityView[] = params.isReportsEnabled
    ? params.reports.map((report) => ({
        id: `report:${report.id}`,
        category: txa('Rapor'),
        title: report.status === 'pending' ? txa('Yeni rapor bekliyor') : txa('Rapor işlemi güncellendi'),
        detail: txa(report.reason || report.target_type),
        createdAt: report.resolved_at || report.created_at,
        actor: report.reporter?.username,
        tone: report.status === 'pending' ? 'danger' : 'success',
        target: 'reports',
      }))
    : []

  const legalRows: DashboardActivityView[] = params.legalRequests.map((request) => ({
    id: `legal:${request.id}`,
    category: txa('Yasal'),
    title: request.subject?.trim() || txa('Yeni yasal talep'),
    detail: request.full_name,
    createdAt: request.updated_at || request.created_at,
    tone: request.priority === 'high' ? 'danger' : 'warning',
    target: 'legal_requests',
  }))

  const announcementRows: DashboardActivityView[] = params.announcements.map((item) => ({
    id: `announcement:${item.id}`,
    category: txa('Duyuru'),
    title: item.title,
    detail: item.isActive ? txa('Yayında') : txa('Yayın dışı'),
    createdAt: item.updatedAt,
    actor: item.author.username,
    tone: item.isActive ? 'info' : 'success',
    target: 'announcements',
  }))

  return [...pendingRows, ...reportRows, ...legalRows, ...announcementRows]
    .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt))
    .slice(0, 8)
}

function buildAnnouncements(items: AdminAnnouncement[]): DashboardAnnouncementView[] {
  return [...items]
    .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      category: item.announcementCategory || txa('Sistem'),
      isActive: item.isActive,
      updatedAt: item.updatedAt,
    }))
}

export function buildFallbackDashboardViewModel(params: BuildFallbackDashboardParams): DashboardViewModel {
  const approvalItems = params.pendingItems
  const pendingReports = params.isReportsEnabled
    ? params.reports.filter((report) => report.status === 'pending')
    : []
  const pendingLegal = params.legalRequests.filter((request) => (
    request.status !== 'actioned' && request.status !== 'rejected'
  ))

  const approvalCount = approvalItems.length
  const reportCount = params.isReportsEnabled ? params.reportStats.pending : 0
  const legalCount = pendingLegal.length
  const backlogTotal = approvalCount + reportCount + legalCount

  const reportTotal = params.reportStats.pending
    + params.reportStats.resolved
    + params.reportStats.dismissed
  // Legacy sources do not present completed and pending work in the same period cohort.
  // So the moderation completion rate is deliberately not calculated in the fallback.
  const moderationCompletion = null
  const reportResolution = params.isReportsEnabled
    ? safePercent(params.reportStats.resolved, reportTotal)
    : null
  const operationScore = average([reportResolution])

  const metrics: DashboardMetricView[] = [
    ['users', params.stats.users],
    ['mangas', params.stats.mangas],
    // Community messages come only from the summary RPC; unknown in the fallback model.
    ['community', null],
    ['fansubs', params.stats.fansubs],
    ['backlog', backlogTotal],
    ['operation-health', operationScore],
  ].map(([id, value]) => {
    const metricId = id as DashboardMetricId
    return {
      id: metricId,
      ...METRIC_CONFIG[metricId],
      value: value as number | null,
      format: metricId === 'operation-health' ? 'score' : 'integer',
      comparison: null,
      series: [],
    }
  })

  const queues: DashboardQueueView[] = [
    {
      id: 'approval',
      label: txa('Onay kuyruğu'),
      description: txa('Manga, bölüm ve fansub talepleri'),
      availability: 'available',
      pendingCount: approvalCount,
      oldestAgeMinutes: oldestAgeMinutes(approvalItems.map((item) => item.createdAt), params.lastUpdatedAt),
      status: null,
      priority: queuePriority(approvalCount),
      target: 'pending',
    },
    {
      id: 'community',
      label: txa('Topluluk şikâyetleri'),
      description: txa('Sunuculardaki mesaj şikâyetleri'),
      availability: 'unavailable',
      pendingCount: null,
      oldestAgeMinutes: null,
      status: null,
      priority: queuePriority(null),
      target: 'community',
    },
    {
      id: 'reports',
      label: txa('Rapor kuyruğu'),
      description: params.isReportsEnabled ? txa('Kullanıcı raporları') : txa('Rapor modülü kapalı'),
      availability: params.isReportsEnabled ? 'available' : 'disabled',
      pendingCount: params.isReportsEnabled ? reportCount : null,
      oldestAgeMinutes: oldestAgeMinutes(pendingReports.map((report) => report.created_at), params.lastUpdatedAt),
      status: null,
      priority: queuePriority(params.isReportsEnabled ? reportCount : null),
      target: 'reports',
    },
    {
      id: 'legal',
      label: txa('Yasal talepler'),
      description: txa('DMCA ve yasal bildirimler'),
      availability: 'available',
      pendingCount: legalCount,
      oldestAgeMinutes: oldestAgeMinutes(pendingLegal.map((request) => request.created_at), params.lastUpdatedAt),
      status: null,
      priority: queuePriority(legalCount),
      target: 'legal_requests',
    },
  ]

  const quality: DashboardQualityView[] = [
    {
      id: 'moderation-completion',
      label: txa('Moderasyon tamamlanma oranı'),
      availability: 'unavailable',
      value: moderationCompletion,
      helper: txa('Aynı dönem kohortu legacy kaynaklarda bulunmuyor'),
      tone: qualityTone(moderationCompletion),
    },
    {
      id: 'report-closure',
      label: txa('Rapor çözüm oranı'),
      availability: params.isReportsEnabled
        ? (reportResolution == null ? 'unavailable' : 'available')
        : 'disabled',
      value: reportResolution,
      helper: params.isReportsEnabled ? txa('Çözülen raporların toplam rapora oranı') : txa('Rapor modülü kapalı'),
      tone: qualityTone(reportResolution),
    },
  ]
  const healthMetrics = quality.filter((metric) => metric.availability !== 'disabled')
  const availableHealthMetrics = healthMetrics.filter((metric) => metric.value != null)
  const healthStatus = availableHealthMetrics.length === 0
    ? 'unavailable'
    : availableHealthMetrics.length < healthMetrics.length ? 'partial' : 'available'

  return {
    generatedAt: params.lastUpdatedAt || null,
    metrics,
    queues,
    quality,
    health: {
      kind: 'operations',
      status: healthStatus,
      score: operationScore,
      availableMetricCount: availableHealthMetrics.length,
      totalMetricCount: healthMetrics.length,
      title: txa('Operasyon durumu'),
      disclosure: txa('Sistem telemetry’si değildir; mevcut moderasyon ve kalite verilerinden türetilir.'),
      items: [
        {
          id: 'queue-health',
          label: txa('Açık operasyon işi'),
          statusLabel: `${backlogTotal}`,
          tone: backlogTotal > 30 ? 'critical' : backlogTotal > 12 ? 'attention' : 'stable',
        },
        {
          id: 'report-health',
          label: txa('Rapor iş akışı'),
          statusLabel: params.isReportsEnabled ? txa('{v1} bekliyor', { v1: reportCount }) : txa('Kapalı'),
          tone: params.isReportsEnabled ? (reportCount > 10 ? 'attention' : 'stable') : 'muted',
        },
      ],
    },
    activity: buildFallbackActivity(params),
    announcements: buildAnnouncements(params.announcements),
    partialFailures: [],
  }
}

function toMetricId(key: AdminDashboardSnapshot['metrics'][number]['key']): DashboardMetricId {
  return key === 'operations' ? 'operation-health' : key
}

function metricTarget(id: DashboardMetricId): DashboardTargetSection | undefined {
  return METRIC_CONFIG[id].target
}

function chartDateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(parsed)
}

function chartPoints(
  snapshot: AdminDashboardSnapshot,
  valueFor: (row: AdminDashboardSnapshot['series'][number]) => number | null,
): DashboardChartPoint[] {
  return snapshot.series.flatMap((row) => {
    const value = valueFor(row)
    if (value == null || !Number.isFinite(value)) return []
    return [{ at: row.date, label: chartDateLabel(row.date), value }]
  })
}

function metricSeries(snapshot: AdminDashboardSnapshot, id: DashboardMetricId): DashboardChartSeries[] {
  if (id === 'operation-health') {
    const points: DashboardChartPoint[] = []
    if (snapshot.operationHealth.previousScore != null) {
      points.push({
        at: snapshot.period.previousEnd,
        label: txa('Önceki dönem'),
        value: snapshot.operationHealth.previousScore,
      })
    }
    if (snapshot.operationHealth.score != null) {
      points.push({
        at: snapshot.period.currentEnd,
        label: txa('Bu dönem'),
        value: snapshot.operationHealth.score,
      })
    }
    return points.length > 0 ? [{ id: 'health-score', label: txa('Operasyon skoru'), tone: 'primary', points }] : []
  }

  if (id === 'backlog') {
    return [
      {
        id: 'backlog-arrivals',
        label: txa('Kuyruğa gelen'),
        tone: 'primary',
        points: chartPoints(snapshot, (row) => row.backlogArrivals),
      },
      {
        id: 'backlog-open',
        label: txa('Hâlâ açık'),
        tone: 'muted',
        points: chartPoints(snapshot, (row) => row.backlogOpenFromArrivals),
      },
    ].filter((series) => series.points.length > 0) as DashboardChartSeries[]
  }

  return [{
    id: `${id}-created`,
    label: id === 'community' ? txa('Yeni mesaj') : txa('Yeni kayıt'),
    tone: 'primary',
    points: chartPoints(snapshot, (row) => {
      if (id === 'users') return row.users
      if (id === 'mangas') return row.mangas
      if (id === 'community') return row.community
      return row.fansubs
    }),
  }].filter((series) => series.points.length > 0) as DashboardChartSeries[]
}

function comparisonFor(
  metric: AdminDashboardSnapshot['metrics'][number],
): DashboardMetricView['comparison'] {
  if (metric.delta == null) return null
  const usesPoints = metric.comparisonBasis === 'quality_average'
  const deltaValue = usesPoints ? metric.delta : metric.deltaPercent
  if (deltaValue == null) return null
  const direction = metric.delta > 0 ? 'up' : metric.delta < 0 ? 'down' : 'flat'
  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral'
  if (metric.trendPolarity === 'higher_is_better') {
    sentiment = direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'neutral'
  } else if (metric.trendPolarity === 'lower_is_better') {
    sentiment = direction === 'down' ? 'positive' : direction === 'up' ? 'negative' : 'neutral'
  }
  return {
    deltaValue,
    deltaFormat: usesPoints ? 'points' : 'percent',
    direction,
    sentiment,
    label: metric.comparisonBasis === 'arrivals'
      ? txa('gelen iş, önceki döneme göre')
      : txa('önceki döneme göre'),
    description: usesPoints
      ? txa('Mevcut durumdaki dönem kohortlarının kalite ortalaması; tarihsel as-of snapshot değildir')
      : metric.comparisonBasis === 'arrivals'
        ? txa('Açık toplam değil, dönemlerde kuyruğa gelen benzersiz işler karşılaştırılır')
        : txa('Seçili dönemlerde oluşturulan yeni kayıtlar karşılaştırılır'),
  }
}

function queueTarget(key: AdminDashboardSnapshot['queues'][number]['key']): DashboardTargetSection {
  if (key === 'community') return 'community'
  if (key === 'reports') return 'reports'
  if (key === 'legal') return 'legal_requests'
  return 'pending'
}

export function applyDashboardSnapshot(
  snapshot: AdminDashboardSnapshot,
  fallback: DashboardViewModel,
): DashboardViewModel {
  const metricRows = new Map(snapshot.metrics.map((metric) => [toMetricId(metric.key), metric]))
  const metrics = METRIC_ORDER.map((id): DashboardMetricView => {
    const row = metricRows.get(id)
    const value = id === 'operation-health'
      ? snapshot.operationHealth.score
      : row?.total ?? null
    return {
      id,
      ...METRIC_CONFIG[id],
      target: metricTarget(id),
      value,
      format: id === 'operation-health' ? 'score' : row?.unit === 'percent' ? 'percent' : 'integer',
      comparison: row ? comparisonFor(row) : null,
      series: metricSeries(snapshot, id),
    }
  })

  const queues: DashboardQueueView[] = snapshot.queues.map((queue) => ({
    id: queue.key,
    label: txa(queue.label),
    description: queue.status === 'disabled'
      ? txa('Bu operasyon modülü kapalı')
      : txa('Dönemsel geliş ve açık iş görünümü'),
    availability: queue.status,
    pendingCount: queue.currentTotal,
    oldestAgeMinutes: oldestAgeMinutes([queue.oldestQueuedAt], snapshot.generatedAt),
    status: null,
    priority: queuePriority(queue.currentTotal),
    target: queueTarget(queue.key),
  }))

  const quality: DashboardQualityView[] = snapshot.quality.map((metric) => ({
    id: metric.key,
    label: txa(metric.label),
    availability: metric.status,
    value: metric.rate,
    helper: metric.disclosure,
    tone: qualityTone(metric.rate),
  }))

  const healthItems = quality
    .filter((metric) => metric.availability === 'available')
    .map((metric) => ({
      id: metric.id,
      label: txa(metric.label),
      statusLabel: metric.value == null ? txa('Veri yok') : txa('%{v1}', { v1: Math.round(metric.value) }),
      tone: metric.tone,
    }))

  return {
    ...fallback,
    generatedAt: snapshot.generatedAt,
    metrics,
    queues,
    quality,
    health: {
      kind: 'operations',
      status: snapshot.operationHealth.status,
      score: snapshot.operationHealth.score,
      availableMetricCount: snapshot.operationHealth.availableMetricCount,
      totalMetricCount: snapshot.operationHealth.totalMetricCount,
      title: txa('Operasyon durumu'),
      disclosure: snapshot.operationHealth.disclosure,
      items: healthItems.length > 0
        ? healthItems
        : [{
            id: 'health-unavailable',
            label: txa('Operasyon verisi'),
            statusLabel: snapshot.operationHealth.status === 'partial' ? txa('Kısmi') : txa('Veri yok'),
            tone: snapshot.operationHealth.status === 'partial' ? 'attention' : 'muted',
          }],
    },
    partialFailures: snapshot.partialFailures.map((failure) => failure.message),
  }
}
