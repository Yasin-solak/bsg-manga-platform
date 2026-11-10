export type DashboardTargetSection =
  | 'dashboard'
  | 'pending'
  | 'community'
  | 'legal_requests'
  | 'reports'
  | 'announcements'
  | 'users'
  | 'mangas'
  | 'store'
  | 'coin_codes'
  | 'fansubs'
  | 'operations'
  | 'settings'

export type DashboardMetricId =
  | 'users'
  | 'mangas'
  | 'community'
  | 'fansubs'
  | 'backlog'
  | 'operation-health'

export type DashboardTone = 'stable' | 'attention' | 'critical' | 'muted'
export type DashboardActivityTone = 'info' | 'success' | 'warning' | 'danger'

export interface DashboardMetricComparison {
  deltaValue: number
  deltaFormat: 'percent' | 'points'
  direction: 'up' | 'down' | 'flat'
  sentiment: 'positive' | 'negative' | 'neutral'
  label: string
  description?: string
}

export interface DashboardChartPoint {
  at: string
  label: string
  value: number
}

export interface DashboardChartSeries {
  id: string
  label: string
  tone: 'primary' | 'secondary' | 'muted'
  points: DashboardChartPoint[]
}

export interface DashboardMetricView {
  id: DashboardMetricId
  label: string
  value: number | null
  format: 'integer' | 'percent' | 'score'
  helper: string
  comparison: DashboardMetricComparison | null
  target?: DashboardTargetSection
  chartTitle: string
  chartDescription: string
  series: DashboardChartSeries[]
}

export interface DashboardQueueStatus {
  /** Filled only when real SLA or completion data exists. */
  percent: number
  label: string
  description?: string
}

export interface DashboardQueueView {
  id: string
  label: string
  description: string
  availability: 'available' | 'disabled' | 'unavailable'
  pendingCount: number | null
  oldestAgeMinutes: number | null
  status: DashboardQueueStatus | null
  priority: 'normal' | 'medium' | 'high' | 'critical'
  target: DashboardTargetSection
}

export interface DashboardQualityView {
  id: string
  label: string
  availability: 'available' | 'disabled' | 'unavailable'
  value: number | null
  helper: string
  tone: DashboardTone
}

export interface DashboardHealthItemView {
  id: string
  label: string
  statusLabel: string
  tone: DashboardTone
}

export interface DashboardHealthView {
  kind: 'telemetry' | 'operations'
  status: 'available' | 'partial' | 'unavailable'
  score: number | null
  availableMetricCount: number
  totalMetricCount: number
  title: string
  disclosure: string
  items: DashboardHealthItemView[]
}

export interface DashboardActivityView {
  id: string
  category: string
  title: string
  detail: string
  createdAt: string | null
  actor?: string
  tone: DashboardActivityTone
  target?: DashboardTargetSection
}

export interface DashboardAnnouncementView {
  id: string
  title: string
  body: string
  category: string
  isActive: boolean
  updatedAt: string | null
}

export interface DashboardViewModel {
  generatedAt: string | null
  metrics: DashboardMetricView[]
  queues: DashboardQueueView[]
  quality: DashboardQualityView[]
  health: DashboardHealthView
  activity: DashboardActivityView[]
  announcements: DashboardAnnouncementView[]
  partialFailures: string[]
}
