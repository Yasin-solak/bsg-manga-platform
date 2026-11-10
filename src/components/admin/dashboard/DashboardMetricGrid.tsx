import type { DashboardMetricId, DashboardMetricView, DashboardTargetSection } from './dashboardTypes'
import { DashboardMetricCard } from './DashboardMetricCard'
import { txa } from '@/i18n/activeLocale'

interface DashboardMetricGridProps {
  metrics: DashboardMetricView[]
  selectedMetricId: DashboardMetricId
  onSelectMetric: (id: DashboardMetricId) => void
  onNavigate: (target: DashboardTargetSection) => void
}

/*
 * A metric strip in one card (instead of six large boxes). Cell lines are each
 * cell's right/bottom edge; outer edges are hidden with -m. So labels are not cut,
 * a single row is only on very wide screens (2 / 3 / 6 columns).
 */
export function DashboardMetricGrid({
  metrics,
  selectedMetricId,
  onSelectMetric,
  onNavigate,
}: DashboardMetricGridProps) {
  return (
    <section
      className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60"
      aria-label={txa('Etkileşimli dashboard metrikleri')}
      data-testid="dashboard-metric-grid"
    >
      <div className="-mb-px -mr-px grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
        {metrics.map((metric) => (
          <DashboardMetricCard
            key={metric.id}
            metric={metric}
            selected={metric.id === selectedMetricId}
            onSelect={onSelectMetric}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  )
}
