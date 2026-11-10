import { useMemo, useState } from 'react'
import { AlertTriangle, CircleDashed } from 'lucide-react'
import type { DashboardStats } from '@/data/admin'
import type {
  AdminDashboardPeriod,
  AdminDashboardSnapshot,
} from '@/services/adminService'
import type { AdminAnnouncement } from '@/services/announcementService'
import type { LegalRequest } from '@/services/legalRequestService'
import type { Report } from '@/services/reportService'
import type { PendingItem } from '@components/admin/AdminPendingSection'
import { DashboardActivityTimeline } from './dashboard/DashboardActivityTimeline'
import { DashboardAnnouncementsPanel } from './dashboard/DashboardAnnouncementsPanel'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { DashboardHealthPanel } from './dashboard/DashboardHealthPanel'
import { DashboardMetricGrid } from './dashboard/DashboardMetricGrid'
import { DashboardOperationsCenter } from './dashboard/DashboardOperationsCenter'
import { DashboardTrendPanel } from './dashboard/DashboardTrendPanel'
import {
  applyDashboardSnapshot,
  buildFallbackDashboardViewModel,
} from './dashboard/dashboardModel'
import type {
  DashboardMetricId,
  DashboardTargetSection,
} from './dashboard/dashboardTypes'
import { txa } from '@/i18n/activeLocale'

interface AdminDashboardSectionProps {
  snapshot: AdminDashboardSnapshot | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  period: AdminDashboardPeriod
  stats: DashboardStats
  pendingItems: PendingItem[]
  lastUpdatedAt?: string | null
  reportStats: {
    pending: number
    resolved: number
    dismissed: number
  }
  reports: Report[]
  legalRequests: LegalRequest[]
  isReportsEnabled?: boolean
  announcements: AdminAnnouncement[]
  onNavigate: (section: DashboardTargetSection) => void
  onPeriodChange: (period: AdminDashboardPeriod) => void
  onRefresh: () => void | Promise<void>
}

/**
 * The dashboard only orchestrates view and interaction. Period calculations come from the service
 * snapshot; if the RPC is unreachable, existing admin data is an honest fallback.
 */
function AdminDashboardSection({
  snapshot,
  isLoading,
  isRefreshing,
  error,
  period,
  stats,
  pendingItems,
  lastUpdatedAt,
  reportStats,
  reports,
  legalRequests,
  isReportsEnabled = true,
  announcements,
  onNavigate,
  onPeriodChange,
  onRefresh,
}: AdminDashboardSectionProps) {
  const [selectedMetricId, setSelectedMetricId] = useState<DashboardMetricId>('backlog')

  const fallback = useMemo(() => buildFallbackDashboardViewModel({
    stats,
    pendingItems,
    lastUpdatedAt,
    reportStats,
    reports,
    legalRequests,
    isReportsEnabled,
    announcements,
  }), [
    announcements,
    isReportsEnabled,
    lastUpdatedAt,
    legalRequests,
    pendingItems,
    reportStats,
    reports,
    stats,
  ])

  const activeSnapshot = snapshot?.period.key === period ? snapshot : null
  const model = useMemo(
    () => activeSnapshot ? applyDashboardSnapshot(activeSnapshot, fallback) : fallback,
    [activeSnapshot, fallback],
  )
  const selectedMetric = model.metrics.find((metric) => metric.id === selectedMetricId)
    || model.metrics[0]

  if (!selectedMetric) return null

  return (
    <section
      className="space-y-4"
      aria-busy={isLoading || isRefreshing}
      data-testid="admin-dashboard"
    >
      <DashboardHeader
        generatedAt={model.generatedAt}
        period={period}
        isRefreshing={isRefreshing}
        canChangePeriod
        onPeriodChange={onPeriodChange}
        onRefresh={onRefresh}
      />

      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300"
          role="alert"
          data-testid="dashboard-error"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            {error} {activeSnapshot
              ? txa('Son başarılı dönem verisi gösterilmeye devam ediyor.')
              : txa('Anlık yönetim verileriyle güvenli görünüm gösteriliyor.')}
          </p>
        </div>
      ) : (isLoading || isRefreshing) && !activeSnapshot ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
          role="status"
        >
          <CircleDashed className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {txa('Dönemsel metrikler yükleniyor; anlık yönetim verileri gösteriliyor.')}
        </div>
      ) : null}

      {model.partialFailures.length > 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300" role="status">
          <span className="font-medium">{txa('Kısmi veri:')}</span>{' '}
          {model.partialFailures[0]}
          {model.partialFailures.length > 1 ? txa(' (+{v1} bölüm)', { v1: model.partialFailures.length - 1 }) : ''}
        </div>
      ) : null}

      <DashboardMetricGrid
        metrics={model.metrics}
        selectedMetricId={selectedMetric.id}
        onSelectMetric={setSelectedMetricId}
        onNavigate={onNavigate}
      />

      {/* Ust: kuyruklar + secili metrigin grafigi. Alt: hareketler + saglik / duyurular. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <DashboardOperationsCenter queues={model.queues} onNavigate={onNavigate} />
        <DashboardTrendPanel metric={selectedMetric} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <DashboardActivityTimeline activity={model.activity} onNavigate={onNavigate} />
        <aside className="flex min-w-0 flex-col gap-4" aria-label={txa('Dashboard destek metrikleri')}>
          <DashboardHealthPanel health={model.health} />
          <DashboardAnnouncementsPanel announcements={model.announcements} onNavigate={onNavigate} />
        </aside>
      </div>
    </section>
  )
}

export default AdminDashboardSection
