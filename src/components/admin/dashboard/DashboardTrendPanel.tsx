import { formatMetricValue } from './dashboardFormatters'
import type { DashboardMetricView } from './dashboardTypes'
import { DashboardTrendChart } from './DashboardTrendChart'

/** Secili metrigin donem grafigi; son degerler basligin saginda. */
export function DashboardTrendPanel({ metric }: { metric: DashboardMetricView }) {
  const latestValues = metric.series.slice(0, 2).flatMap((series) => {
    const latest = series.points[series.points.length - 1]
    return latest ? [{ id: series.id, label: series.label, value: latest.value }] : []
  })

  return (
    <section
      id="dashboard-trend-panel"
      className="flex min-w-0 flex-col rounded-[20px] border border-border/70 bg-card/60 p-5 pt-4"
      aria-labelledby="dashboard-trend-title"
      data-testid="dashboard-trend-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dashboard-trend-title" className="text-[15px] font-bold tracking-tight text-foreground">
            {metric.chartTitle}
          </h2>
          <p className="text-[12px] text-muted-foreground">{metric.chartDescription}</p>
        </div>
        {latestValues.length > 0 ? (
          <dl className="flex gap-4">
            {latestValues.map((item) => (
              <div key={item.id} className="min-w-0 text-right">
                <dt className="truncate text-[11px] text-muted-foreground">{item.label}</dt>
                <dd className="text-[17px] font-black leading-tight tabular-nums text-foreground">
                  {formatMetricValue(item.value, metric.format)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-center">
        <DashboardTrendChart
          key={`${metric.id}:${metric.series.map((series) => series.id).join('|')}`}
          title={metric.chartTitle}
          series={metric.series}
          format={metric.format}
        />
      </div>
    </section>
  )
}
