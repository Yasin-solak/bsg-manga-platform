import { ArrowDownRight, ArrowUpRight, Minus, MoveUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMetricValue } from './dashboardFormatters'
import { DASHBOARD_METRIC_VISUALS } from './dashboardVisuals'
import type { DashboardMetricView, DashboardTargetSection } from './dashboardTypes'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface DashboardMetricCardProps {
  metric: DashboardMetricView
  selected: boolean
  onSelect: (id: DashboardMetricView['id']) => void
  onNavigate: (target: DashboardTargetSection) => void
}

function comparisonTone(metric: DashboardMetricView) {
  if (metric.comparison?.sentiment === 'positive') return 'text-emerald-600 dark:text-emerald-400'
  if (metric.comparison?.sentiment === 'negative') return 'text-destructive'
  return 'text-muted-foreground'
}

function ComparisonIcon({ metric }: { metric: DashboardMetricView }) {
  if (metric.comparison?.direction === 'up') return <ArrowUpRight className="size-3" aria-hidden="true" />
  if (metric.comparison?.direction === 'down') return <ArrowDownRight className="size-3" aria-hidden="true" />
  return <Minus className="size-3" aria-hidden="true" />
}

function comparisonDirectionLabel(metric: DashboardMetricView) {
  if (metric.comparison?.direction === 'up') return txa('Artış')
  if (metric.comparison?.direction === 'down') return txa('Azalış')
  return txa('Değişim yok')
}

/**
 * One cell of the metric strip. Clicking shows the metric in the trend chart below
 * (aria-pressed); the arrow at top right goes to the related section.
 */
export function DashboardMetricCard({
  metric,
  selected,
  onSelect,
  onNavigate,
}: DashboardMetricCardProps) {
  const visual = DASHBOARD_METRIC_VISUALS[metric.id]
  const Icon = visual.icon
  const delta = metric.comparison?.deltaValue
  const formattedDelta = metric.comparison?.deltaFormat === 'points'
    ? txa('{v1} puan', { v1: Math.abs(delta ?? 0).toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) })
    : txa('%{v1}', { v1: Math.abs(delta ?? 0).toLocaleString(intlLocale(), { maximumFractionDigits: 1 }) })

  return (
    <article
      className={cn('relative min-w-0 transition-colors', selected && 'bg-primary/[0.07]')}
      data-testid={`dashboard-metric-${metric.id}`}
    >
      <button
        type="button"
        className="flex h-full w-full min-w-0 items-center gap-3 px-4 py-3 pr-9 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-pressed={selected}
        aria-controls="dashboard-trend-panel"
        onClick={() => onSelect(metric.id)}
      >
        {/* Dar ekranda iki sutun: ikon gizlenir ki etiket ve deger kesilmesin. */}
        <span className={cn('hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex', visual.iconSurfaceClassName)}>
          <Icon className={cn('size-[18px]', visual.iconClassName)} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{metric.label}</span>
          <span className="block text-[20px] font-black leading-tight tracking-tight tabular-nums text-foreground">
            {metric.value == null ? txa('Veri yok') : formatMetricValue(metric.value, metric.format)}
          </span>
          {metric.comparison && delta != null ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px]" title={metric.comparison.description}>
              <span className={cn('inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums', comparisonTone(metric))}>
                <ComparisonIcon metric={metric} />
                <span className="sr-only">{comparisonDirectionLabel(metric)}: </span>
                {formattedDelta}
              </span>
              <span className="hidden truncate text-muted-foreground sm:inline">{metric.comparison.label}</span>
              <span className="sr-only">{metric.comparison.description}.</span>
            </span>
          ) : (
            <span className="block truncate text-[11px] text-muted-foreground">
              {metric.id === 'operation-health' ? txa('Kalite oranlarından') : txa('Karşılaştırma yok')}
            </span>
          )}
        </span>
        <span className="sr-only">{txa('Bu metriği trend grafiğinde göster.')}</span>
      </button>

      {metric.target ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-2 top-2 z-10 text-muted-foreground/70 hover:text-foreground"
          aria-label={txa('{v1} detayına git', { v1: metric.label })}
          data-testid={`dashboard-metric-detail-${metric.id}`}
          onClick={() => onNavigate(metric.target as DashboardTargetSection)}
        >
          <MoveUpRight className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}

      <span
        className={cn(
          'pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-left rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none',
          selected ? 'scale-x-100' : 'scale-x-0',
        )}
        aria-hidden="true"
      />
    </article>
  )
}
