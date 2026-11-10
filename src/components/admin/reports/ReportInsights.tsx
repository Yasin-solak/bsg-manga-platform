import { Clock3, Gauge, UserRoundCheck } from 'lucide-react'
import type { Report } from '@/services/reportService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { DashboardTrendChart } from '@/components/admin/dashboard/DashboardTrendChart'
import { StudioDonut } from '@/components/fansub/StudioCharts'
import {
  buildReportTrendSeries,
  formatReportRelativeAge,
  getReportRisk,
} from './reportManagementModel'
import { txa } from '@/i18n/activeLocale'

export function ReportInsights({ reports }: { reports: Report[] }) {
  const pendingReports = reports
    .filter((report) => report.status === 'pending')
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
  const high = reports.filter((report) => getReportRisk(report).level === 'high').length
  const medium = reports.filter((report) => getReportRisk(report).level === 'medium').length
  const low = reports.filter((report) => getReportRisk(report).level === 'low').length
  const oldestPending = pendingReports[0]
  const closedCount = reports.filter((report) => report.status !== 'pending').length
  const trendSeries = buildReportTrendSeries(reports)

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_0.95fr_1.7fr]">
      <AdminSurface className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">{txa('İnceleme Kuyruğu')}</h2>
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground">{pendingReports.length}</span>
        </div>
        <dl className="mt-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{txa('Bekleyen raporlar')}</dt>
            <dd className="font-medium tabular-nums text-foreground">{pendingReports.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{txa('Yüksek riskli')}</dt>
            <dd className="font-medium tabular-nums text-red-600 dark:text-red-300">{high}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{txa('En eski bekleyen')}</dt>
            <dd className="font-medium text-foreground">
              {oldestPending ? formatReportRelativeAge(oldestPending.created_at) : txa('Kuyruk boş')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{txa('Sonuçlanan')}</dt>
            <dd className="font-medium tabular-nums text-foreground">{closedCount}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {txa('En riskli ve en eski kayıtları önce inceleyin.')}
        </div>
      </AdminSurface>

      <AdminSurface className="p-4">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{txa('Risk Dağılımı')}</h2>
        </div>
        <div className="mt-4">
          <StudioDonut
            size={108}
            thickness={13}
            centerValue={reports.length}
            centerLabel="rapor"
            segments={[
              { label: txa('Yüksek'), value: high, colorClass: 'text-red-500' },
              { label: txa('Orta'), value: medium, colorClass: 'text-orange-400' },
              { label: txa('Düşük'), value: low, colorClass: 'text-emerald-500' },
            ]}
          />
        </div>
      </AdminSurface>

      <AdminSurface className="min-w-0 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{txa('Günlük Trend')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{txa('Son 7 gündeki gelen ve sonuçlanan raporlar.')}</p>
        </div>
        <div className="mt-2 [&_svg]:!h-[120px]">
          <DashboardTrendChart
            title={txa('Günlük rapor trendi')}
            series={trendSeries}
            format="integer"
          />
        </div>
      </AdminSurface>
    </div>
  )
}
